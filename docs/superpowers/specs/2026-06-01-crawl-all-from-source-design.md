# Crawl-All-From-Source — Spec

**Date:** 2026-06-01
**Depends on:** Plan 7 (catalog discovery — `adapter.discover()` exists and works)
**Spec type:** Admin productivity (no DB schema change)

## Why this exists

Today the operator opens `/admin/sources/$id/discover` and ticks story checkboxes one at a time on each catalog page. With a source like `truyenfull.today` exposing thousands of stories across dozens of pages, this is grindingly slow — the same complaint the operator raised verbatim: *"chọn từng cái mất thời gian quá"*.

This spec adds a single button that says **"Import tất cả truyện trong feed này"**. Click it → BE iterates every catalog page of the currently-active feed and queues an import for every story it finds, idempotently. The operator can monitor progress on the existing `/admin/jobs` page.

## Locked decisions (from brainstorming 2026-06-01)

| Topic | Decision |
|---|---|
| Scope of "all" | **Current feed only** (one feed at a time — operator switches tabs to scope) |
| Auto-crawl chapter content | **Optional checkbox**, default off (mirrors existing `DiscoverActionBar`) |
| Cap | **No cap** — feed boundary is the natural scope; operator can cancel via /admin/jobs if needed |
| Dedup | Idempotent via existing `enqueueImport(url)` slug-uniqueness; same story imported twice = no-op |
| Concurrent runs | Bull jobId `discover-all:{sourceId}:{feed}` — second click while a run is active returns 409 Conflict |
| Rate limit | Crawler's existing per-source token bucket (1 rps default) handles fairness; new job sleeps 1 s between feed pages |
| Cancel | Operator removes the job from `/admin/jobs` (existing UI) — same as any other Bull job |
| Visibility | Toast on submit + auto-navigate to `/admin/jobs` so operator sees the queue |
| DB | **No migration** — uses existing tables only |

## Backend

### New job type

```
JOB_DISCOVER_ALL_SOURCE = 'discover-all-source'
QUEUE_CRAWLER (existing)
```

Job data shape:

```ts
type DiscoverAllSourceJobData = {
  sourceId: string;
  feedId: string;
  autoCrawl: boolean;
  requestedBy: string | null;
};
```

### New endpoint

`POST /api/v1/sources/:id/discover-all` (admin only, JwtAuthGuard + Roles(['admin']))

Body (DTO `DiscoverAllSourceDto`):

```ts
{
  feed: string;       // feed id (e.g. "latest", "completed"); validated against adapter.catalogFeeds
  autoCrawl: boolean; // default false
}
```

Response (`202 Accepted`):

```ts
{ jobId: string }   // e.g. "discover-all:truyenfull:latest"
```

Errors:
- `404 Not Found` — sourceId doesn't exist
- `400 Bad Request` — feed not in adapter.catalogFeeds
- `409 Conflict` — job with the same `(sourceId, feedId)` already running

### Service method (`sources.service.ts`)

```ts
async enqueueDiscoverAll(sourceId: string, feedId: string, autoCrawl: boolean, requestedBy: string | null) {
  // 1. Verify source exists + adapter resolves
  // 2. Verify feedId is one of adapter.catalogFeeds
  // 3. Add Bull job with jobId = `discover-all:${sourceId}:${feedId}` and removeOnComplete: true
  // 4. Return { jobId }
}
```

### New processor (`crawler-jobs/discover-all-source.processor.ts`)

```ts
@Processor(QUEUE_CRAWLER)
async handle(job: Job<DiscoverAllSourceJobData>) {
  const { sourceId, feedId, autoCrawl, requestedBy } = job.data;
  const adapter = resolveAdapter(sourceId);
  let page = 1;
  let totalQueued = 0;
  while (true) {
    const browse = await adapter.discover({ feedId, page });
    for (const story of browse.items) {
      await this.stories.enqueueImport(story.url, requestedBy, autoCrawl).catch(() => {
        // Idempotent — duplicate slug throws; silently skip.
      });
      totalQueued++;
    }
    await job.progress({ page, totalQueued, hasNextPage: browse.hasNextPage });
    if (!browse.hasNextPage) break;
    page++;
    await sleep(1000);    // throttle per-source: 1 page per second
  }
  return { totalQueued, pagesCrawled: page };
}
```

Note: `enqueueImport` is the existing single-story importer. The processor reuses it so per-story idempotency, rate limiting, and chapter-discovery chaining (when `autoCrawl=true`) all come for free.

### Module wiring

- Add `DiscoverAllSourceProcessor` to `CrawlerJobsModule`
- `SourcesModule` already imports `StoriesModule` (for `StoriesService.enqueueImport`) — keep
- Export job constant `JOB_DISCOVER_ALL_SOURCE` from `queue.constants.ts`

## Frontend

### Route changes

Single file edit: `apps/frontend/src/routes/admin/sources/$id.discover.tsx`.

Add a primary button in the page header (next to the feed tabs row):

```
[Latest] [Completed] [Popular]          [Import tất cả truyện trong feed này]
```

Button is pink-gradient `bg-accent-gradient` (signature touch — matches BulkActionBar primary CTA).

### Confirm dialog

Click → centered modal (reuse existing pattern from `DeleteConfirm` in `/admin/users.tsx`):

```
Import tất cả truyện trong feed này?

Hệ thống sẽ quét toàn bộ trang của feed "latest" và queue
một job import cho mỗi truyện. Quá trình có thể mất nhiều
phút tới vài giờ tuỳ kích thước catalog.

[ ] Tự động crawl chapter content (chạy ngay sau khi
    metadata sẵn sàng)

                                    [Huỷ]  [Import tất cả →]
```

On confirm:
- `POST /sources/:id/discover-all` with `{ feed, autoCrawl }`
- Loading state on confirm button (disabled + spinner)
- Success → toast "Đã queue. Đang chuyển tới Jobs..." → `navigate({ to: '/admin/jobs' })`
- 409 → toast "Job đang chạy. Mở trang Jobs để xem."
- Other errors → toast with backend message

### API client

`apps/frontend/src/api/sources.ts` adds:

```ts
async discoverAll(sourceId: string, feed: string, autoCrawl: boolean): Promise<{ jobId: string }>
```

## Acceptance criteria

1. `POST /api/v1/sources/:id/discover-all` with valid feed + admin auth returns 202 + `{ jobId }`.
2. Same call again while job is running returns 409 with body explaining a job is already queued.
3. Invalid feed returns 400 listing valid feeds from `adapter.catalogFeeds`.
4. Job iterates pages starting from 1 until `hasNextPage=false`; each loop sleeps 1s between pages.
5. Each story discovered triggers `enqueueImport(url, requestedBy, autoCrawl)`; already-imported stories are skipped silently (no duplicate slug error surfaces).
6. Job `progress()` reports `{ page, totalQueued, hasNextPage }` so the existing `/admin/jobs` UI shows live progress.
7. Job completes with return value `{ totalQueued: number, pagesCrawled: number }`.
8. `/admin/sources/$id/discover` page renders the new button in the header row, styled with `bg-accent-gradient` + `shadow-glow-pink-soft`.
9. Click button → confirm modal opens with feed name + autoCrawl checkbox + Huỷ/Import buttons.
10. Confirm submission disables the button and shows a spinner until the POST resolves.
11. On 202 success, toast appears AND user is navigated to `/admin/jobs`.
12. On 409 conflict, toast informs the user without navigation.
13. `pnpm --filter @smanga/api typecheck` and `pnpm --filter @smanga/frontend typecheck` both pass.

## Out of scope

- All-feeds-at-once mode (cross-feed dedup, etc.)
- Per-feed cap input on the modal
- Scheduled / recurring crawl-all
- Pause / resume of an in-flight job (Bull supports it but no UI wiring planned)
- Retry-failed-only filter
- Visibility into per-story progress within the parent job (use individual import-story job rows in /admin/jobs)
- Email / notification when complete

## Risks + mitigations

- **Risk**: Operator clicks twice quickly → only the first succeeds (409 on second). **Mitigation**: button disabled during in-flight POST + Bull jobId dedup as second guard.
- **Risk**: Adapter changes catalog feeds mid-run → page N returns different stories than page N-1 would have. **Mitigation**: accept the drift; future re-runs catch missed stories via idempotent import.
- **Risk**: Source rate-limit ban from too-fast pagination. **Mitigation**: 1 s sleep between page fetches + existing per-source token bucket on `adapter.fetch()`.
- **Risk**: Long-running job (hours) blocks queue concurrency slot. **Mitigation**: Bull queue concurrency is already > 1; this job runs alongside chapter fetches naturally. Operator can cancel from /admin/jobs if needed.
- **Risk**: `enqueueImport` throws on slug collision and the catch swallows it. **Mitigation**: explicitly catch `ConflictException` only; re-throw on other errors so genuine failures surface in job state.

## Migration phases (within this spec)

1. **Phase 1 — BE**: queue constant + processor + service method + controller endpoint + DTO + module wiring
2. **Phase 2 — FE**: API client + button + confirm dialog + toast + navigation

Each phase = own commit set + local verify. **Push only when user explicitly says push.**
