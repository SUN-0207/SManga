# Smart Auto-Crawl (Backlog Drainer) — Design Spec

**Date:** 2026-06-12
**Status:** Approved (brainstorming)
**Owner:** son.cu@opswat.com

## 1. Problem

`/admin/stories` "Cần crawl" filter shows **~34,917 stories** whose chapters are discovered (`discovery_status='complete'`) but not yet fetched (`chapter.status='pending'`) — e.g. `0/116`, `8/121`. Today they are crawled only by **manual** operator action (crawl-missing / "Chỉ crawl lỗi" bulk actions) or the **disabled** nightly auto-refresh (which re-*discovers* ongoing stories rather than draining the pending backlog, in one big batch with no prioritization or reader-load awareness).

The operator wants the backlog crawled **automatically**, **smart** (useful order), and **without degrading overall app performance** (the api is a single in-process Node process shared with the reader; the 2026-06-09 incident was a 3.7M-job queue flood).

## 2. Goals / Non-goals

**Goals**
- A standing background engine that continuously drains `pending` chapters with **zero manual triggering**, idling when the backlog is empty and resuming when new pending chapters appear (from imports/discovery).
- **Newest-first** ordering (recently-imported/updated stories become readable first).
- **Bounded + non-disruptive**: never floods the queue, never starves reader requests or manual crawl actions, gentle on truyenfull.
- Operator **kill switch** + visible progress.

**Non-goals**
- Re-*discovering* new chapters for ongoing stories — that is the separate (existing, disabled) nightly auto-refresh; out of scope here.
- Re-crawling `failed` chapters — handled by the dead-letter reconciler (transient) / left as Lỗi/VIP. The feeder only consumes `pending`.
- A dedicated worker process / new container (rejected Approach C — overkill for 1 rps; recorded as a future option).
- Speeding up crawling beyond the existing 1 rps/source TokenBucket (the natural, intentional throttle).

## 3. Chosen approach (A — repeatable feeder)

A Bull **repeatable** job (`JOB_AUTOCRAWL_FEED`, cron `*/1 * * * *`, tz `Asia/Ho_Chi_Minh`) — installed on boot exactly like `RetryReconcilerService` (via `withRedisReadyRetry`, jobId `autocrawl-feeder-cron`). Each tick tops the queue up to a watermark with the next newest-first `pending` chapters. The existing fetch-chapter worker drains them at 1 rps. Reuses `enqueueChunked`, `enqueueIdempotent`, the capacity gate, the engine, and the dead-letter/reconciler — almost no change to the core crawl path; this feature only adds "the thing that feeds jobs".

Rejected: **B (self-feeding chain)** — fragile (one crash breaks the chain; needs a watchdog), doesn't fit the repeatable pattern. **C (separate worker process)** — large infra change, unjustified at 1 rps.

## 4. Architecture

```
app_setting(autoCrawlEnabled, autoCrawlWatermark)
        │
        ▼
AutoCrawlFeederService  @Processor(QUEUE_CRAWLER) @Process(JOB_AUTOCRAWL_FEED)
   onModuleInit → install repeatable (withRedisReadyRetry), cron */1
   handle(tick): gate → pick newest-first pending batch → enqueueChunked
        │  (priority AUTOCRAWL_FETCH = lowest)
        ▼
Bull queue → fetch-chapter worker (TokenBucket 1 rps/source — existing)
        ▼
engine.fetchChapterById → async gzip → chapter.status='crawled'
   fail → 'failed' → dead-letter listener + reconciler (existing); NOT re-picked
```

**New units**
- `apps/api/src/modules/app-settings/auto-crawl-feeder.processor.ts` — the feeder (install + tick). One clear responsibility: keep the queue topped with background fetch-chapter jobs, bounded.
- `apps/api/src/modules/app-settings/auto-crawl.controller.ts` + `dto/update-auto-crawl.dto.ts` — `GET/PATCH /admin/settings/auto-crawl` (mirror the existing `auto-retry` controller/DTO).
- `queue.constants.ts`: `JOB_AUTOCRAWL_FEED` name + `JOB_PRIORITY.AUTOCRAWL_FETCH = 30` (lowest — below `REFRESH_ALL_STORIES:20`, so every manual/discover/reconciler job preempts the background trickle).
- `app-setting` schema + migration: `auto_crawl_enabled boolean NOT NULL DEFAULT false`, `auto_crawl_watermark integer NOT NULL DEFAULT 500`.

**Reused as-is:** `enqueueChunked`, `enqueueIdempotent`, `queue-capacity` (`getWaitingCount`, `QUEUE_WAITING_CAP`), `AppSettingsService` patterns (`getOrSeed`, the auto-retry get/set), `withRedisReadyRetry`, the fetch-chapter processor + engine + TokenBucket, the dead-letter pipeline.

## 5. Feeder tick algorithm (every ~1 min, restart-safe)

```
1. config = appSetting row.  if (!config.autoCrawlEnabled) return no-op.   // kill switch
2. waiting = await queue.getWaitingCount()
   if (waiting >= config.autoCrawlWatermark) return no-op.                  // bounded; never pile on
3. headroom = config.autoCrawlWatermark - waiting                          // also capped by enqueueChunked vs QUEUE_WAITING_CAP
4. Select up to `headroom` pending chapter ids, ordered **newest-story-first**
   (`story.updated_at DESC`, then `chapter.index ASC`), via an index-ordered plan
   that stops at the LIMIT — never a Seq Scan / full sort over the ~1.7M pending
   rows. Two candidate forms (the plan picks one against `EXPLAIN`):
     (a) single join query: `story ⋈ chapter WHERE discovery_complete AND status='pending'
         ORDER BY s.updated_at DESC, ch.index ASC LIMIT headroom` — works if the planner
         does an index-ordered nested loop (story_updated_at_idx outer, partial
         chapter_needs_crawl_idx inner) and stops early; OR
     (b) two-step story-frontier: pick the newest N stories with pending (EXISTS on the
         partial index, ORDER BY updated_at DESC), then their pending chapters in
         (story-recency, index) order up to `headroom`.
   Acceptance: EXPLAIN shows index usage + early-stop, no Seq Scan. Under-filling a
   tick is fine — the next tick continues.
5. enqueueChunked(queue, jobs) where each job = {name: fetch-chapter, data:{chapterId}, opts:{jobId:`fetch-chapter:${id}`, priority: AUTOCRAWL_FETCH, attempts:3, backoff: exp 30s}}
   (enqueueChunked re-checks live headroom vs QUEUE_WAITING_CAP; enqueueIdempotent semantics via addBulk jobId dedup)
6. log(`auto-crawl: enqueued=${enqueued} waiting=${waiting} headroom=${headroom}`)
   No pending stories → enqueued 0 → idle (zero load until pending reappears).
```

**Index strategy (so the feeder itself doesn't load the DB):** the story-frontier query uses `story_updated_at_idx` (DESC, from Phase 1) + the partial `chapter_needs_crawl_idx` (`chapter(story_id) WHERE status IN ('pending','failed')`, Phase 1) for the per-story EXISTS — no Seq Scan / no global sort over ~1.7M pending rows. Verified via EXPLAIN in dev before merge.

**Steady state:** at 1 rps the worker drains ~60 chapters/min. With watermark 500 the queue settles ~440–500; each tick re-enqueues ~the 60 drained. Initial fill is one ≤500-job `enqueueChunked` (far under the 10k cap).

## 6. Safety gates ("không ảnh hưởng performance")

| Gate | Effect |
|---|---|
| `autoCrawlEnabled` kill switch (default **OFF**) | Opt-in; instant off, like auto-retry |
| Watermark ≤ `autoCrawlWatermark` (500) waiting | Queue stays small → no flood (anti-3.7M); progress visible |
| `AUTOCRAWL_FETCH` = lowest priority (30) | Manual crawl-missing / "Chỉ crawl lỗi" / discover / reconciler all preempt |
| TokenBucket 1 rps/source (existing) | Outbound to truyenfull ≤1/s → gentle on the site + laptop network |
| Capacity gate (`QUEUE_WAITING_CAP` 10k via `enqueueChunked`) | Defense-in-depth ceiling |
| Feeder consumes `pending` only | A failed fetch (network/VIP) → `'failed'` → out of `pending` → never re-picked → no infinite VIP loop |
| Idle when drained | Backlog empty → enqueued 0 → no load |
| `withRedisReadyRetry` on boot install | Survives a Redis co-restart (no crash-loop) |

**Priority/idempotency note:** the feeder enqueues `fetch-chapter:<id>` at low priority; if the operator later manually crawl-misses the same chapter, `enqueueIdempotent`/`addBulk` jobId-dedup leaves the already-queued job in place (it won't be re-prioritized). Acceptable — the chapter is already queued and will be crawled; manual actions on *other* (not-yet-queued) chapters enqueue at high priority and preempt normally.

## 7. Settings / control / observability

- **`app_setting`** + migration: `auto_crawl_enabled` (bool, default false), `auto_crawl_watermark` (int, default 500). Watermark clamped to [50, 2000] in the DTO.
- **`/admin/settings`**: a "Tự động crawl backlog" section — a toggle (reuse the auto-retry toggle component/pattern) + an advanced numeric watermark input. Endpoint `GET/PATCH /admin/settings/auto-crawl` (copy the `auto-retry` controller/DTO shape; admin-guarded).
- **Observability** (reuse existing surfaces — no new dashboard):
  - `/admin/stories` "Cần crawl (N)" pill shrinks = live progress.
  - `/admin/jobs` stats: `waiting` small + steady (~watermark), `completed` rising.
  - Feeder `this.logger.log()` per tick (`enqueued`, `waiting`, `headroom`).

## 8. Error handling

- Boot repeatable install wrapped in `withRedisReadyRetry` (no Nest-bootstrap crash on Redis LOADING).
- Tick body wrapped in try/catch → log + return; a transient DB/Redis error never crashes the process; next tick retries.
- Per-chapter fetch failure → existing path: `chapter.status='failed'`, dead-letter listener records + classifies, reconciler auto-retries transient ones. The feeder is unaffected (only reads `pending`).
- Queue at/over capacity → watermark gate (step 2) + `enqueueChunked` headroom check skip the tick — no harm.

## 9. Testing

- **Unit** (`auto-crawl-feeder.processor.spec.ts`, mirroring `retry-reconciler.service.spec.ts` / `jobs.service.spec.ts` mock patterns):
  - disabled (`autoCrawlEnabled=false`) → `enqueueChunked` not called.
  - `waiting >= watermark` → not called (bounded).
  - pending present → `enqueueChunked` called with the expected chapter ids, `jobId fetch-chapter:<id>`, priority `AUTOCRAWL_FETCH`; count ≤ headroom.
  - no pending rows → enqueued 0 (idle).
  - watermark clamp in the DTO ([50, 2000]).
- **EXPLAIN** (dev, qualitative): the story-frontier + pending-chapter queries hit `story_updated_at_idx` + `chapter_needs_crawl_idx`, no Seq Scan.
- **Boot smoke** (controller, PORT=3010): enable auto-crawl → observe queue trickle (waiting ≈ watermark), "Cần crawl" count drop, reader endpoints stay responsive; SIGTERM clean.
- **Playwright** (pre-push, house rule): `/admin/settings` auto-crawl toggle renders + flips; backlog count visibly decreasing on `/admin/stories`.
- Full suite stays green; commit-only, no push without explicit ask.

## 10. Rollout

1. Ship with `autoCrawlEnabled` **default false** — no behavior change on deploy.
2. After deploy: enable via `/admin/settings`, watch the queue trickle + "Cần crawl" drop + prod liveness across a window (the post-incident discipline).
3. If truyenfull starts throttling the laptop IP under sustained 1 rps (the diagnosed `network error` class), lower the watermark and/or revert source rps 1→0.5; the kill switch stops it instantly.

## 11. Decided parameters

| Param | Value |
|---|---|
| Feeder cron | `*/1 * * * *` (Asia/Ho_Chi_Minh) |
| `JOB_PRIORITY.AUTOCRAWL_FETCH` | 30 (lowest) |
| `autoCrawlEnabled` default | false (opt-in) |
| `autoCrawlWatermark` default / clamp | 500 / [50, 2000] |
| Priority order (existing) | FETCH_CHAPTER 1 < RETRY_RECONCILER 2 < DISCOVER_CHAPTERS 5 < DISCOVER_ALL 8 < IMPORT_STORY 10 < REFRESH_ALL 20 < **AUTOCRAWL_FETCH 30** |
| Ordering | story `updated_at` DESC, chapter `index` ASC |
| Consumes | `chapter.status='pending'` only |
