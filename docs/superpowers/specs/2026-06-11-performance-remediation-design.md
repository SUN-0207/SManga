# Performance Remediation (P0+P1) — Design Spec

- **Date:** 2026-06-11
- **Status:** Approved (design), pending implementation plan
- **Owner:** son.cu@opswat.com
- **Scope:** `apps/api`, `apps/frontend`, `packages/crawler`, `packages/db`, `deploy/` + two operator runbooks (Cloudflare dashboard, laptop compose apply)
- **Source:** 5-lens read-only performance audit (DB/SQL, API runtime, frontend, crawler/queue, infra/caching), 39 verified findings → 10 bundles. This spec covers the 9 P0+P1 bundles in 4 phases. P2 (rankings) and dismissed findings are recorded in §9 for later.

## 1. Problem — measured on prod (2026-06-11, via Cloudflare)

| Endpoint | Measured | Why |
|---|---|---|
| `GET /api/v1/stories?limit=24` (public browse) | TTFB 1.19s, total 2.16s; **identical TTFB at `limit=1`** | the list query hash-aggregates the ENTIRE chapter table (millions of rows) per request; EXPLAIN on dev confirms the `GROUP BY story_id` subquery is not filtered by the pagination. No index on `story.updated_at` → full 38k-row sort per request. |
| `GET /api/v1/stories/count?crawlState=needs-crawl` | 2.45s — and admin fires 4 counts in parallel per debounced keystroke | no chapter index contains `status`; the EXISTS heap-walks every chapter of every fully-crawled story. |
| `GET /sitemap-chapters.xml` | TTFB 4.37s; 1.9MB of ~23MB in 60s (~10 min full) | 109k URLs in ONE file (> the 50k sitemap-protocol cap → Google rejects it regardless); rebuilt per request from a full-table scan into a 23MB string; ETag computed after the work; `Cf-Cache-Status: DYNAMIC`. This is the live GSC "Không thể tìm nạp" failure. |
| covers `/api/v1/cover/:id` | `Cf-Cache-Status: DYNAMIC` despite `immutable` | extensionless path is not CF-cache-eligible by default; the Plan 8 Cache Rules were never created in the dashboard. ~24 covers/page through a measured ~50KB/s tunnel ≈ 8–23s image trickle per fresh visitor. |
| frontend JS | single 683kB chunk (196kB gzip); 15.8s transfer on CF MISS | no route code-splitting — admin code ships to every reader and to Googlebot on all ~109k chapter URLs. |

Latent (verified in code/internals, not yet measured as outage):
- **Queue meltdown vectors**: `QUEUE_WAITING_CAP` is checked once, then `refetchAllChapters` (~109k), `backfillCovers`, `refresh-all-stories` (~38k) enqueue unbounded batches; Bull 4.16.5 `addJobWithPriority.lua` is O(list-length) LINSERT per job → one click can recreate the 2026-06-09 Redis-100%-CPU incident.
- **Silent dedup no-ops**: `addJob-6.lua` returns the existing job when a jobId hash exists in ANY state. Completed jobs are retained 7d/20k, failed 24h/5k, discover-all failed **forever** (`removeOnFail:false`) → auto-refresh ticks silently skip stories, crawl-missing rescue no-ops for 24h after failures, discover-all bricks permanently after one failure.
- **Deploy kills jobs**: default `lockDuration=30s/maxStalledCount=1` + no shutdown hooks → every Watchtower swap mass-fails active jobs as stalled.
- **TokenBucket bug** (`packages/crawler/src/rate-limit.ts:28-39`): all concurrent waiters wake at once and ALL proceed → bursts of 4-6 requests → truyenfull 503s; rps was halved to 0.5 as a symptom patch, halving crawl throughput.
- **Sync zlib + cheerio on the shared event loop** (workers run in-process with HTTP): 30–100ms reader-latency stalls during crawls; `fetchChapterById` SELECT-*s the gzipped bytea it never reads.
- **Rate limiting is dead code**: `ThrottlerModule` registered, `ThrottlerGuard` never bound; `?limit=` unbounded (`@Min(1)` only) → anonymous `?limit=100000` returns all 38k rows.
- **Stock containers**: Postgres at `shared_buffers=128MB, work_mem=4MB, random_page_cost=4.0` (browse aggregate spills to disk; planner biased against new indexes); no Redis `maxmemory`; no container mem limits; DB pool hardcoded `max:10` shared by HTTP + all Bull processors.

## 2. Goals / Non-goals

**Goals**
- Public browse TTFB < 300ms at prod scale; counts < 100ms.
- `sitemap-chapters` ingestible by GSC (≤10k URLs/file, served from cache, edge-cached).
- Covers + sitemaps + anonymous JSON served from Cloudflare edge (`Cf-Cache-Status: HIT` on repeats).
- The 2026-06-09 incident structurally impossible from any single producer; deploys don't fail active jobs; fixed-jobId producers actually re-enqueue.
- Crawl throughput restored (rps 0.5 → 1) by fixing the limiter, not by retrying harder.
- Reader first-paint without admin code; reading page doesn't re-render per scroll tick.
- Host tuned for the dataset with bounded blast radius (OOM cannot take out Postgres).

**Non-goals**
- No denormalized chapter counts on `story` (LATERAL makes on-the-fly cheap — keeps the 2026-06-11 crawl-state spec decision).
- No separate worker process for Bull (future follow-up; async zlib is this round's mitigation).
- No SSR/prerender for SEO (separate initiative if GSC data demands it).
- P2 rankings bundle deferred (§9).
- No bcrypt worker threads (right-sized fix is the throttler).

## 3. Phase 1 — Database & query core

1. **`stories.list()` LATERAL rework** (`apps/api/src/modules/stories/stories.service.ts:180-214`): replace the two non-correlated `GROUP BY story_id` subqueries (chapter aggregates incl. `latest_chapter_index` + the rating aggregate) with `LEFT JOIN LATERAL (SELECT ... FROM chapter ch WHERE ch.story_id = s.id) c ON true` so aggregation runs per paginated row via `chapter_story_index_uniq`. Response shape unchanged (`crawledChapters`/`pendingChapters`/`failedChapters`/`latestChapterIndex`/`ratingAvg`/`ratingCount` keep their names/semantics). The `crawlState='needs-crawl'` filter moves to an EXISTS predicate (it can no longer reference materialized aggregates; the partial index below makes it cheap).
2. **Indexes** (one Drizzle migration; remember drizzle.config.ts explicit `schema:` array + per-project import-extension rules):
   - `story_updated_at_idx` btree on `story(updated_at DESC)` — list ORDER BY top-N terminates early.
   - `chapter_needs_crawl_idx` partial: `chapter(story_id) WHERE status IN ('pending','failed')` — needs-crawl EXISTS becomes an empty-range probe; also accelerates crawl-missing selects.
3. **Counts consolidation**: new `GET /stories/counts` returning `{ all, full, stub, needsCrawl }` in ONE SQL pass (`COUNT(*) FILTER` over story joined to the partial-index EXISTS), honoring the same `q` filter. Frontend `admin/stories/index.tsx` replaces the 4 `useQuery` counts with one, forwards React Query's `AbortSignal` into axios, debounce 250→400ms. Old `/stories/count` stays (other callers) but gains nothing new.
4. **`storageStats` cache**: 5-min in-process cache (same pattern as `jobs.service` statsCache); admin dashboard FE drops `refetchInterval: 30s` in favor of `staleTime` + refetch-on-focus.
5. **Admin chapters pagination**: `GET /stories/:id/chapters` paginates (reuse the `chapterListBySlug` shape, default 50/page) and returns server-computed `{ crawled, pending, failed }` via one `COUNT(*) FILTER` query; `admin/stories/$id.tsx` uses server counts + paginated table instead of rendering all rows.

**Phase-1 verification**: EXPLAIN (ANALYZE) before/after on dev for list + counts (plan shape: no Seq Scan on chapter); existing suite green; prod probe after deploy: browse TTFB and needs-crawl count.

## 4. Phase 2 — Sitemap rescue, edge cache, abuse bounds

1. **Sitemap sharding** (`apps/api/src/modules/seo/seo.service.ts` + controller): `sitemap.xml` (index) lists `sitemap-stories.xml` + `sitemap-chapters-{n}.xml` shards of ≤10,000 URLs. Chapter query becomes story-driven LATERAL (first 3 chapter indexes per story) instead of `WHERE c.index IN (1,2,3)` full scan.
2. **Build-once cache**: each sitemap body lazy-builds into an in-process cache keyed by `MAX(story.updated_at)` with 1h TTL; SHA1/ETag computed once at build; controller serves cached bytes and answers 304 without DB work. (In-process beats Redis here: bodies are MBs and rebuild is acceptable on restart.)
3. **Cache headers on public JSON**: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` on anonymous stories list/detail/chapter-list; `public, s-maxage=86400` on crawled chapter content (immutable once crawled; re-crawl tolerance is fine at 1 day).
4. **Throttling + caps**: bind `ThrottlerGuard` via `APP_GUARD`; `@SkipThrottle()` on SEO/health; `@Throttle({ default: { limit: 5, ttl: 60_000 } })` on `/auth/login`; `@Max(100)` on `ListStoriesDto.limit`; clamp `pageSize` ≤200 in `chapterListBySlug`; audit rankings/search/comments DTOs for the same gap.
5. **OPERATOR RUNBOOK — Cloudflare dashboard** (no repo change; I cannot do this): Cache Rules in order: (a) URI path starts `/api/v1/cover/` → Eligible for cache, Edge TTL 1 year; (b) URI path matches `/sitemap*.xml` → Eligible, Edge TTL 24h; (c) URI path starts `/api/v1/stories` OR `/api/v1/search` OR `/api/v1/rankings`, **AND request has no `Cookie` header** → Eligible, "respect origin" TTL (driven by the §4.3 `s-maxage`); (d) URI path starts `/api/` (everything else) → Bypass. Rule (c) is what makes the §4.3 headers effective — without it they are inert at the edge; the cookie condition keeps logged-in/admin responses out of the shared cache. Verify with `curl -sI` → `Cf-Cache-Status: HIT` on second cover fetch and on a repeated anonymous stories fetch.

**Phase-2 verification**: `sitemap.xml` lists shards, each shard ≤10k URLs + <1MB-ish; second fetch of a shard returns 304 with no DB queries (log-assert); GSC re-submission accepted (async, user-observed); login throttle returns 429 on 6th attempt.

## 5. Phase 3 — Queue & crawler hardening

1. **`enqueueChunked()` helper** (jobs module): cursor-paged SELECT → `addBulk` in ≤500-job chunks → re-check `QUEUE_WAITING_CAP - waiting` headroom between chunks → stop early returning `{ enqueued, remaining }` (resumable). Used by `refetchAllChapters`, `backfillCovers`, `refresh-all-stories` fan-out. `retryAllFailed` pages `getJobs(['failed'], i, i+999)` instead of `(0,-1)`.
2. **`enqueueIdempotent()` helper**: `getJob(jobId)` → if present and NOT waiting/active/delayed → `remove()` → `add()` (the retry-reconciler's proven pattern). Applied at every fixed-jobId producer (discover-chapters, fetch-chapter, discover-all, refresh repeatable add). `discover-all` drops `removeOnFail: false`.
3. **Bull settings + graceful shutdown**: `registerQueue({ name, settings: { lockDuration: 120_000, stalledInterval: 60_000, maxStalledCount: 3 } })`; `app.enableShutdownHooks()` + `OnApplicationShutdown` → `queue.close()` so Watchtower swaps let active jobs release cleanly.
4. **TokenBucket fix** (`packages/crawler/src/rate-limit.ts`): `acquire()` loops — refill; if `tokens ≥ 1` take & return; else sleep the deficit and re-check (FIFO via promise chain so waiters can't stampede). Route `downloadCover` through the bucket. Then restore truyenfull `rps: 0.5 → 1` (`packages/crawler/src/sources/truyenfull/index.ts`) — the halving was compensating for the burst bug.
5. **Async zlib + lean selects**: `gzipSync→zlib.gzip` (promisified) in `engine.fetchChapterById` write path; `gunzipSync→zlib.gunzip` in `chapters.service` read path; `fetchChapterById` selects only `(id, source_id, external_url)` — not the bytea.
6. **Remove `autoRefreshConcurrency`** from UI + DTO (column may stay): it is read by nothing (`@Process` concurrency is static) and misleads incident response.

**Phase-3 verification**: unit tests — TokenBucket under 6 concurrent acquires emits ≤rps (fake timers); enqueueChunked stops at cap with remaining>0; enqueueIdempotent removes completed-then-adds and leaves active untouched. Suite green.

## 6. Phase 4 — Frontend + host tuning

1. **Code-split**: `TanStackRouterVite({ autoCodeSplitting: true })` + `build.rollupOptions.output.manualChunks` (react/react-dom/router/query vendor chunk). Acceptance: build output shows admin routes in separate chunks; entry chunk meaningfully smaller (target: reader entry < 300kB raw).
2. **Reader smoothness** (`routes/truyen/$slug/chuong/$index.tsx`): scroll-progress bar extracted into its own rAF-throttled component owning the listener/state; `wordCount` + paragraph array `useMemo`'d on `chapter.content`.
3. **Fonts**: self-host used variants via `@fontsource` (woff2 preload; drop JetBrains Mono from reader if admin-only); fix or remove the `REPLACE_AFTER_GSC_SETUP` verification meta in `index.html`.
4. **OPERATOR RUNBOOK — laptop compose apply** (`deploy/home/docker-compose.prod.yml` changes land in git; user applies with `git pull && docker compose up -d` on the laptop): Postgres `command: postgres -c shared_buffers=1GB -c effective_cache_size=3GB -c work_mem=32MB -c maintenance_work_mem=256MB -c random_page_cost=1.1`; Redis `--maxmemory 768mb --maxmemory-policy noeviction` (Bull requires noeviction); `mem_limit` postgres 2g / api 1.5g / redis 1g; api `NODE_OPTIONS=--max-old-space-size=1024`; `DB_POOL_MAX` env (default 10, prod 25) read by `packages/db` `createDb`.

**Phase-4 verification**: build-output chunk listing; Lighthouse/transfer-size spot check on a chapter URL; post-apply prod probes (the §1 table re-run) as the program's overall success metric.

## 7. Cross-cutting decisions

- **LATERAL over denormalization** — consistent with the crawl-state spec; revisit only if LATERAL probes are insufficient at 10×.
- **In-process caches** (sitemaps, storageStats) over Redis — single API instance; restart rebuild acceptable; avoids large-value Redis churn alongside Bull.
- **Operator tasks are first-class plan tasks** with exact click-by-click/copy-paste runbooks, because I cannot reach the CF dashboard or SSH to the laptop (Tailscale is a parked loose end).
- **Phases ship sequentially** (each green + deployed before the next) so prod probe deltas attribute wins to the right change.

## 8. Testing

- Unit: TokenBucket concurrency/burst, enqueueChunked cap/resume, enqueueIdempotent state matrix, counts endpoint SQL mapping, sitemap shard pagination + cache-key invalidation, crawlBadge-style pure helpers for any new FE logic.
- EXPLAIN before/after (dev, qualitative plan-shape: no chapter Seq Scan on list/counts/sitemap paths).
- Existing 134-test suite stays green per phase; Playwright proof for admin-visible changes (counts pill, paginated detail) per house rule before each deploy.
- Prod probes re-run after each phase deploy; record numbers in the plan.

## 9. Deferred (recorded, not in this program)

- **P2 Rankings bundle**: `story(view_count DESC)` + `story(status)` indexes + 60-300s cache on rankings service.
- Dismissed as negligible/speculative: view-count UPDATE churn; reading_progress/bookmark indexes (tiny tables); job-failure onCompleted single-row UPDATE; home double listStories call (symptom of P0-2, recheck after); Watchtower swap downtime (accepted tradeoff; the harmful side-effect is fixed by Phase 3.3); bcrypt worker threads.
- Future architectural follow-up: dedicated worker process for Bull processors; SSR/prerender for SEO.

## 10. Risks & mitigations

- **LATERAL regression risk** (different plan on prod's data distribution) → EXPLAIN on dev + measure on prod immediately after deploy; the old query is one git revert away; phases are independent.
- **`s-maxage` on JSON serving stale data** → 300s staleness on anonymous browse is product-acceptable; admin endpoints (cookie-authed) are explicitly excluded and CF rule (c) bypasses `/api/` by default — ONLY the explicitly-ruled paths cache.
- **Restoring rps=1 re-triggers 503s** → only after the limiter fix lands; watch the dead-letter panel (transient 503s now self-retry) and revert the rps line alone if sustained.
- **Compose tuning on an unknown-RAM laptop** → values sized for ≥8GB; runbook includes `free -h` pre-check and halved fallback values.
- **`maxmemory noeviction` can error writes during a flood** → that is the point (bounded-and-erroring beats OOM-killing Postgres); caps from Phase 3 make hitting it unlikely.
