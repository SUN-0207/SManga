# Chapter Text Layout — Design Spec

> **Status:** Draft (2026-06-08). Phases verbally approved; awaiting written-doc review before invoking `superpowers:writing-plans`.
>
> **Scope:** Fix paragraph fusion in crawled chapter text + add an admin tool to re-crawl all existing chapters so old data benefits from the fix.

## Problem

Chapter prose in `/truyen/:slug/chuong/:n` renders as one giant blob — sentences and dialog turns fuse together. Two root causes:

1. **Crawler under-separates paragraphs.** Commit `9c356cf` appended a single `\n` after each block element (`<p>`, `<div>`, etc.) so block boundaries didn't disappear in `text()`. The frontend renderer splits the stored text on `\n\n` (double newline) to produce one `<p>` per paragraph. With single `\n` between adjacent blocks, the FE sees one big paragraph and renders it as a wall of text with whitespace where the original block boundaries were. The collapse step `replace(/\n{3,}/g, '\n\n')` doesn't help because there were never 3+ newlines in the first place.
2. **Existing 10,555 chapters in DB were crawled BEFORE either fix.** Their `content_text` is already flat — no markers left to reconstruct paragraphs from. The only way to clean them is to re-fetch from source and re-parse with the corrected logic.

Source structure on truyenfull (verified via `__fixtures__/chapter.html:45529+`): each paragraph is a clean `<p>` element. The fix is mechanical — emit `\n\n` between blocks — but it only helps NEW crawls. Old data needs a re-crawl.

## Goals

1. Parser emits `\n\n` between block elements so the FE's `split('\n\n')` produces correct paragraphs.
2. Admin can trigger a one-click re-crawl of every existing chapter to refresh the prose with the fixed parser.
3. The re-crawl is rate-limited so it doesn't blast truyenfull (existing 0.5 rps token bucket handles it).

## Non-goals (explicit)

- Within-paragraph fusion fixes (e.g. `(parens)Capital`, `"quote"Capital` with no space). User explicitly deferred; will observe results from block-level fix first.
- Heuristic backfill (regex-split of existing flat text). User chose re-crawl instead — re-crawl restores true source structure; regex would produce false-positive splits.
- Live progress UI for the 6h backfill. The existing `/admin/jobs` page polls `getJobCounts()` every 5s; queue counters are visible.
- Pause / cancel / resume of in-flight backfill. Bull queue can be drained via redis CLI if absolutely needed.
- Multi-source orchestration. SManga has one source (`truyenfull`); single-source bulk re-crawl is sufficient.

## Audience and channels

- Operator: `cuthanhson27@gmail.com` (admin) running this from `/admin/jobs` on prod (smanga.shop) after the fix deploys.
- Bull processor: existing `JOB_FETCH_CHAPTER` handler. No new processor needed.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Crawler (packages/crawler/src/sources/truyenfull/)       │
│                                                            │
│ parseChapterContentHtml(html):                            │
│   contentEl.find('p,div,h1..h6,li,br').each(el =>         │
│     $(el).append('\n\n')          ← was '\n', NOW '\n\n'  │
│   )                                                        │
│   text = contentEl.text()                                  │
│     .replace(/\n{3,}/g, '\n\n')   ← clamps to 2           │
│   → returns string with \n\n between paragraphs           │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Backend — new endpoint                                    │
│                                                            │
│ POST /api/v1/jobs/refetch-all-chapters  (admin-only, 202) │
│                                                            │
│ jobs.service.refetchAllChapters():                        │
│   1. SELECT id, story_id, source_id, external_url         │
│        FROM chapter WHERE status = 'crawled'              │
│        ORDER BY updated_at ASC                            │
│   2. queue.addBulk([                                      │
│        { name: JOB_FETCH_CHAPTER,                         │
│          data: { chapterId, storyId, sourceId, url },     │
│          opts: { jobId: 'fetch-chapter-<id>',             │
│                  attempts: 3,                              │
│                  backoff: exp 30s } },                    │
│        ...                                                 │
│      ])                                                    │
│   3. return { enqueued: N }                               │
│                                                            │
│ Bull queue (crawler) ← already exists                     │
│   ↓ processed by FetchChapterProcessor (already exists)   │
│ Engine.fetchChapterById()                                 │
│   ↓ token-bucket rate-limited at 0.5 rps per source       │
│ truyenfull HTTP fetch → parseChapterContentHtml → gzip    │
│   → UPDATE chapter SET content_text, content_byte_size,   │
│       crawled_at = now() WHERE id = $1                    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Frontend — /admin/jobs page (existing)                    │
│                                                            │
│ Add second button next to "Retry tất cả thất bại":        │
│   [↻ Re-crawl tất cả chapter]                             │
│                                                            │
│ Click → confirm modal:                                    │
│   "Re-crawl 10.555 chapter từ source? ...~6 giờ           │
│    background... Nội dung cũ sẽ được ghi đè. [Hủy]        │
│    [Xác nhận]"                                            │
│                                                            │
│ Confirm → useMutation POST /jobs/refetch-all-chapters     │
│   → on success: alert(`Đã enqueue ${enqueued} chapter`)   │
│   → invalidate ['jobs'] queries so counters refresh       │
└──────────────────────────────────────────────────────────┘
```

## Components

### 1. Parser fix — `packages/crawler/src/sources/truyenfull/parsers.ts:250-252`

```ts
contentEl.find('p, div, h1, h2, h3, h4, h5, h6, li, br').each((_, el) => {
  $(el).append('\n\n');   // was: '\n'
});
```

One-line change. The existing `replace(/\n{3,}/g, '\n\n')` clamps runs of newlines to exactly two — so adjacent `<p>` boundaries produce exactly `\n\n` regardless of incoming whitespace.

### 2. Service method — `apps/api/src/modules/jobs/jobs.service.ts`

```ts
async refetchAllChapters(): Promise<{ enqueued: number }> {
  const r = await this.db.execute<{
    id: string;
    story_id: string;
    source_id: string;
    external_url: string;
  }>(sql`
    SELECT id, story_id, source_id, external_url
    FROM chapter
    WHERE status = 'crawled'
    ORDER BY updated_at ASC
  `);
  const rows = rowsOf<{ id: string; story_id: string; source_id: string; external_url: string }>(r);
  if (rows.length === 0) return { enqueued: 0 };

  const jobs = rows.map((c) => ({
    name: JOB_FETCH_CHAPTER,
    data: {
      chapterId: c.id,
      storyId: c.story_id,
      sourceId: c.source_id,
      externalUrl: c.external_url,
    } satisfies FetchChapterJobData,
    opts: {
      jobId: `fetch-chapter-${c.id}`,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 30_000 },
    },
  }));

  await this.queue.addBulk(jobs);
  return { enqueued: jobs.length };
}
```

`status = 'crawled'` filter skips stub chapters (pending discovery) — those will be filled by the normal discover flow, not re-fetch. The `jobId` makes the enqueue idempotent: if a chapter's job is already in the queue (waiting or active), `addBulk` no-ops for it. Safe to spam the button.

The `satisfies FetchChapterJobData` assertion needs the existing type from `@/modules/queue/queue.constants` — verify the field names match before saving (look at how `enqueueDiscoverChapters` and the existing single-chapter retry produce `JOB_FETCH_CHAPTER` job data).

### 3. Controller endpoint — `apps/api/src/modules/jobs/jobs.controller.ts`

```ts
import { HttpCode } from '@nestjs/common';

@Post('refetch-all-chapters')
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
@HttpCode(202)
async refetchAllChapters() {
  return this.jobs.refetchAllChapters();
}
```

Returns 202 Accepted to signal "enqueued, will process async" instead of 200 OK.

### 4. FE API client — `apps/frontend/src/api/jobs.ts`

Add method:
```ts
refetchAllChapters: () => api
  .post<{ enqueued: number }>('/jobs/refetch-all-chapters')
  .then((r) => r.data),
```

### 5. FE button + modal — `apps/frontend/src/routes/admin/jobs.tsx`

Mirror the bulk-retry pattern already in the file. Add state + mutation:

```tsx
const [refetchOpen, setRefetchOpen] = useState(false);
const refetchAll = useMutation({
  mutationFn: jobsApi.refetchAllChapters,
  onSuccess: (data) => {
    setRefetchOpen(false);
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    window.alert(`Đã enqueue ${data.enqueued.toLocaleString('vi-VN')} chapter để re-crawl.`);
  },
  onError: () => window.alert('Re-crawl thất bại. Xem log api.'),
});
```

Button (next to existing "Retry tất cả thất bại"):
```tsx
<button
  type="button"
  disabled={refetchAll.isPending}
  onClick={() => setRefetchOpen(true)}
  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm border border-border hover:border-accent/40 hover:bg-bg-subtle/60 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
>
  {refetchAll.isPending
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : <RefreshCw className="h-4 w-4" />}
  Re-crawl tất cả chapter
</button>
```

Modal (mirror confirmOpen structure):
```tsx
{refetchOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-md rounded-xl bg-bg border border-border p-6 shadow-elev">
      <h3 className="font-sans font-semibold text-lg">Re-crawl tất cả chapter?</h3>
      <p className="mt-2 text-sm text-fg-muted">
        Toàn bộ chapter (status = crawled) sẽ được fetch lại từ source để áp dụng
        parser mới (paragraph spacing). Rate limit 0.5 rps → ước tính ~
        {Math.ceil((stats.completed ?? 10_000) / 0.5 / 3600)} giờ background. Nội dung cũ
        sẽ được ghi đè. Có thể slow các operation crawl khác trong thời gian này.
      </p>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button onClick={() => setRefetchOpen(false)} ...>Hủy</button>
        <button onClick={() => refetchAll.mutate()} ...>Xác nhận</button>
      </div>
    </div>
  </div>
)}
```

## Data flow

```
Admin clicks button at /admin/jobs
  ↓
useMutation fires POST /api/v1/jobs/refetch-all-chapters
  ↓
NestJS controller (admin-guarded) → jobs.service.refetchAllChapters()
  ↓
SELECT id, story_id, source_id, external_url FROM chapter
  WHERE status='crawled' ORDER BY updated_at ASC
  ↓
queue.addBulk(jobs)  // 10k items, 1-2s redis call
  ↓
Bull stores jobs with jobId='fetch-chapter-<id>' (idempotent)
  ↓
Controller returns 202 { enqueued: N }
  ↓
FE alert + invalidate ['jobs'] → stat cards refresh
  ↓
... background:
Bull processor picks job from queue
  ↓
Engine.fetchChapterById() — gated by 0.5 rps token bucket
  ↓
HTTP GET truyenfull → parseChapterContentHtml (new logic)
  ↓
gzipSync content → UPDATE chapter SET content_text=..., content_byte_size=...
  ↓
Job marked completed in Bull
```

## Edge cases

| Case | Behavior |
|---|---|
| Re-crawl in progress, user clicks again | `jobId` idempotency makes re-enqueue a no-op. UI shows isPending → button disabled for ~2s while the bulk insert runs. After mutation returns, button re-enables; clicking again is harmless. |
| Source returns 503 / 5xx | Existing 3-attempt retry with exponential 30s backoff. After 3 fails the job lands in `failed`; user can hit existing bulk-retry button later. |
| Source moved chapter URL (404) | Job's existing error path marks chapter `last_error = 'http 404'`, no DB write to content_text. After enough such failures across stories that source restructured, operator may need to re-discover. Out of scope here. |
| Chapter parses identically (no actual prose change) | DB UPDATE writes the same bytes. No-op at storage level (Postgres still writes a new row version but vacuum cleans it up). Harmless. |
| Engine's 0.5 rps shared with admin discover/crawl traffic | Yes — admin operations during the 6h window will be visibly slow. Modal warns about this. Worth scheduling the click for off-hours. |
| 10k+ chapters at higher scale | `queue.addBulk` is one redis pipeline call. Tested up to ~50k by Bull users; for SManga's current scale (10.5k) there's no risk. If catalog grows past 100k, chunk to batches of 1000. |
| Worker processor crashes mid-backfill | Bull job stays in `active` state until worker timeout, then moves back to `waiting`. Resumes automatically when worker reconnects. |
| Bull job is already in `failed` state from a prior crawl | `jobId` collision — `addBulk` may skip OR replace depending on Bull config. Verify behavior; if it skips, those rows stay in failed bucket and need the bulk-retry button first. Document in modal if needed. |

## Testing

### Unit tests

**Parser** (`packages/crawler/src/sources/truyenfull/__tests__/parsers.spec.ts`):
- Existing test should still pass with the change.
- ADD a new assertion: given HTML `<div id="chapter-c"><p>One.</p><p>Two.</p></div>`, the parsed `text` contains `'One.\n\nTwo.'` (literal `\n\n` between paragraphs, not `One.Two.` or `One.\nTwo.`).

**Service** (`apps/api/src/modules/jobs/jobs.service.spec.ts`):
- Mock `db.execute` to return 3 chapter rows.
- Mock `queue.addBulk` and assert it was called with 3 items, each with the right `jobId` pattern and `JOB_FETCH_CHAPTER` name.
- Assert `refetchAllChapters()` returns `{ enqueued: 3 }`.
- Empty-DB case: 0 rows → addBulk not called → returns `{ enqueued: 0 }`.

### E2E tests

`apps/api/test/jobs.e2e-spec.ts` (extend existing if present, else new):
- `POST /api/v1/jobs/refetch-all-chapters` with reader token → 403.
- Same endpoint with admin token → 202 + JSON body with `enqueued` field.
- Same endpoint without auth → 401.

### Manual smoke (post-deploy)

1. SSH to laptop after Watchtower pulls new image.
2. Open `https://smanga.shop/admin/jobs`, click "Re-crawl tất cả chapter", confirm.
3. Verify alert shows `Đã enqueue 10.555 chapter`.
4. Watch `/admin/jobs` stat cards — `Đang chạy + Chờ` jumps to ~10k.
5. After ~10 minutes, pick any chapter slug, hit it in the browser, verify paragraphs are now visibly separated. Or `curl https://smanga.shop/api/v1/chapters/by-slug/...` and check the content blob contains `\n\n`.
6. After ~6 hours: `Đang chạy + Chờ` should drop to ~0, `Hoàn thành` should rise by ~10k. `Thất bại` may rise — review and bulk-retry.

## Risks

1. **Bull `addBulk` redis pipeline limit** — unlikely at 10k. If hit (returns an error), chunk to batches of 1000 (3-line wrap of the addBulk call). Documented as a follow-up.

2. **Truyenfull anti-bot escalation under sustained 0.5 rps for 6h** — possible, not certain. Mitigation: if many jobs fail with non-503 codes (Cloudflare 403, etc.), pause the backfill (drain queue or just wait) and retry over multiple days.

3. **Concurrent admin operations slow** — during the 6h window, discovering new stories will compete for the same 0.5 rps slot. Modal warns operator. Acceptable for a one-time op.

4. **`jobId` collision with a failed job** — Bull's `addBulk` with duplicate `jobId` MAY skip existing jobs in `failed` state (need to verify exact behavior). If so, those chapters won't get re-fetched. Mitigation: run the existing bulk-retry-failed button BEFORE the re-crawl to clear failed bucket. Note in the modal or in the operator runbook.

5. **DB connection pool exhaustion** — 10k UPDATEs over 6h = 0.5/sec. Negligible.

6. **No way to cancel mid-flight** — out-of-scope per non-goals. Operator can drain Bull queue manually via redis CLI if absolutely required.

## Out of scope (recap)

- Within-paragraph fusion regex injection
- Heuristic regex-split backfill
- Progress bar / live percentage
- Pause / cancel / resume controls
- Multi-source orchestration
- Per-story re-crawl button (already possible via existing bulk-action Discover/Crawl-missing path)
