# Auto-Crawl Throughput — Design Spec

> **Status:** APPROVED 2026-06-20 — ready for an implementation plan.
> **Origin:** prod auto-crawl is far too slow to drain the chapter backlog. This raises crawl throughput against the single source (truyenfull) safely, with **no change to crawl correctness, parsing, or the feeder/prioritization logic** — only the *rate* at which pending chapters are fetched.

## Problem

The background auto-crawl drains pending chapters at a hard ceiling of **~1 chapter/second**, fixed there by three things:

1. **Per-source rate limit = 1 rps, burst 1** — `packages/crawler/src/sources/truyenfull/index.ts:39` (`rateLimit: { rps: 1 }`). The token bucket (`packages/crawler/src/rate-limit.ts`) is an in-process singleton keyed by `sourceId`; with a single `api` container this is effectively a *global* 1 req/sec to truyenfull.
2. **Worker concurrency = 1** — `apps/api/src/modules/crawler-jobs/fetch-chapter.processor.ts:19` uses `@Process(JOB_FETCH_CHAPTER)` with no concurrency argument → Bull's default of 1. One chapter is fetched at a time. Raising this alone does nothing — the shared 1-rps bucket still caps aggregate throughput.
3. **No connection reuse tuning** — `fetchHtml` (`packages/crawler/src/fetcher.ts`) calls undici's top-level `request()`; there is no per-host keep-alive `Pool`, so each fetch can pay TCP/TLS setup.

The feeder, watermark, queue, and DB writes are **not** the bottleneck: the feeder (`auto-crawl-feeder.processor.ts`, cron `*/1`, watermark 500) tops the queue to ~500 while it drains at ~60/min, so there is always work waiting. Wall-clock ≈ backlog ÷ rps.

### Measured scale (prod, 2026-06-20)

| Metric | Value | Source |
|---|---|---|
| Total stories | 38,018 | `/api/v1/stories/counts` |
| Stories with pending chapters (`needs-crawl`) | 20,972 | same |
| Stories with failed chapters (`has-errors`) | 1,421 | same |
| Chapters crawled (with content) | 980,433 | `/api/v1/stories/storage-stats` |
| Chapters discovered/expected (`chapterTargetTotal`) | 3,881,584 | same |
| **→ Chapters still needing crawl** | **≈ 2,901,151** | derived |
| Stored content | 12.7 GB (≈13 KB/chapter gzip) | same |
| Queue at probe time | waiting 507, active 8, failed 165 | `/api/v1/jobs/stats` |

At 1 chapter/sec, ~2.9M chapters ≈ **~34 days** of nonstop crawling.

### Measured source tolerance (probe, 2026-06-20)

A direct probe against truyenfull chapter pages (real browser UA, `am-quan-minh-the`): **30 chapters fetched back-to-back = 30× HTTP 200, 0 rate-limited, 0 errors, in 11 s (~2.7 rps sequential)**, per-request latency ~200–300 ms. No 429/503, no Cloudflare challenge. The 1-rps cap is **entirely self-imposed**; there is real headroom (one reused connection ≈ 4 rps; with concurrency, more).

## Goal

Drain the full ~2.9M-chapter backlog **as fast as the source safely tolerates**, on the existing single laptop, without getting the home IP rate-limited or banned and without degrading the live (edge-cached) site. Expected with the defaults below: **~8 days at 4 rps**, tunable upward live toward the source's real ceiling.

Throughput math (backlog ÷ effective rps): 1 rps → ~34 d; 4 → ~8.4 d; 8 → ~4.2 d; 12 → ~2.8 d.

## Decisions (locked)

- **Approach A1, structured A2-ready.** Crawl stays in the `api` process now; rate control is routed through one new seam (`RateGovernor`) so a future split into a dedicated worker container (A2) is a swap behind two methods, not a rewrite. No worker container is built in this scope.
- **rps is a live knob** (`app_setting.crawlRps`, default `4`), tunable at `/admin/settings` with no redeploy.
- **Worker concurrency is a boot-time env** (`CRAWLER_FETCH_CONCURRENCY`, default `6`) — Bull fixes concurrency at registration; restart-level is acceptable.
- **Connection reuse** via an undici keep-alive `Pool` per source host in the fetcher.
- **Global circuit-breaker** in `RateGovernor`: on a burst of 429/503 it pauses all `acquire()`s for a cooldown, then half-opens — global protection the per-job backoff lacks.
- **No change** to parsing, the feeder's newest-first ordering, prioritization (the user explicitly chose "drain everything", not prioritize), the queue-capacity cap, dead-letter, or retry-reconciler.

## Architecture — the three levers + the seam

Today crawl rate is pinned by two static values and a missing optimization. The design unlocks all three and routes rate control through `RateGovernor` for A2-readiness.

```
feeder (*/1, watermark 500) ──enqueue──▶ Bull crawler queue
                                              │  concurrency = CRAWLER_FETCH_CONCURRENCY (6)
                                              ▼
                             FetchChapterProcessor (N parallel)
                                              ▼
                       engine.fetchChapterById(db, id)
                            │
                            ├─ governor.acquire('truyenfull')   ◀── rps from app_setting.crawlRps (5s cache)
                            │        └─ (breaker open? → sleep cooldown)
                            ├─ fetchHtml(url)  ◀── undici Pool (keep-alive, reused)
                            │        └─ on 429/503 → governor.recordRateLimit() + throw RateLimitError
                            ├─ parse (cheerio) → gzip (async, libuv pool)
                            └─ UPDATE chapter SET status='crawled'
```

### `RateGovernor` (the seam) — `packages/crawler`

Owns, per `sourceId`: the `TokenBucket` and the circuit-breaker state. Public surface is exactly two methods plus configuration:

- `acquire(sourceId): Promise<void>` — resolves the current rps (via resolver, below), rebuilds the bucket if rps changed (the existing `bucketFor` rps-change check), blocks while the breaker is open, then takes a token (FIFO, as today).
- `recordRateLimit(sourceId): void` — records a 429/503 occurrence in a rolling window; opens the breaker on threshold.
- `configure({ rpsResolver })` — the host registers how to resolve the live rps. The **api** registers a resolver reading `app_setting.crawlRps` (5 s TTL cache so it isn't queried per fetch); the **CLI** registers nothing and falls back to the static `adapter.rateLimit.rps`.

Engine callers (`fetchChapterById`, `importStoryMetadata`, `discoverChapters`, `browseCatalog`, `searchCatalog`) replace the current `bucketFor(adapter.id, adapter.rateLimit.rps).acquire()` with `governor.acquire(adapter.id)`. The in-process `buckets` Map moves inside the governor.

**A2-readiness:** to later run a second crawl process, swap the in-process governor for one whose bucket + breaker state live in Redis, behind the same `acquire`/`recordRateLimit`. No engine or processor change. `app_setting.crawlRps` is already shared (both processes read the same row). This swap is explicitly out of scope here; the seam is the only A2 cost paid now.

### Live rps knob — `app_setting.crawlRps`

New nullable-with-default column (default `4`), added via Drizzle schema + migration (append the schema file to `drizzle.config.ts`'s explicit array **and** `schema/index.ts` if a new file; here it's an existing file edit). Surfaced at `/admin/settings` beside `autoCrawlEnabled` / `autoCrawlWatermark` using the same DTO → service → UI pattern (`update-auto-refresh.dto.ts` family). Validated `>= 0.1` and `<= 20` (a sane ceiling; 0 would stall crawling — use `autoCrawlEnabled` to stop).

### Worker concurrency — boot env

`FetchChapterProcessor` reads `CRAWLER_FETCH_CONCURRENCY` (default 6) at module load and registers `@Process({ name: JOB_FETCH_CHAPTER, concurrency: N })`. Concurrency need only satisfy `concurrency ≥ rps × latency` to saturate the rps (rps 8 × 0.25 s ⇒ ≥2); 6 comfortably supports tuning rps to ~16–24. Only `fetch-chapter` is bumped; other job types stay at 1.

### Connection reuse — undici `Pool`

The fetcher keeps a per-host keep-alive `Pool` (or a configured `Agent`) reused across requests, replacing the bare top-level `request()`. Lowers per-request latency under concurrency. Behavior, headers, timeouts, and the 429/503 → `RateLimitError` mapping are unchanged.

## Error handling & safety

- **Circuit-breaker (in `RateGovernor`):** count `RateLimitError`s in a rolling window; on **≥5 within 60 s** → **open**: every `acquire()` sleeps a cooldown (60 s) → **half-open**: resume at a reduced rps (e.g. half) and re-open immediately if another 429/503 lands, else fully close. This is the global signal the existing per-job exponential backoff lacks — when truyenfull pushes back, *new* jobs slow too, directly mitigating the ban-escalation that historically forced rps→0.5.
- **Existing machinery unchanged:** per-job backoff (attempts 2, 30 s; `refetchAllChapters` keeps its 3), dead-letter, retry-reconciler, and the 10k queue-capacity cap all still apply.
- **Watermark interaction:** at 8 rps the queue drains ~480/min vs watermark 500 + `*/1` feed → never starves. Past ~8 rps, raise `autoCrawlWatermark` (already a live knob) so the queue doesn't idle between feeder ticks. No code change needed — operator guidance.
- **Laptop guardrails:** the Postgres connection pool must be ≥ `CRAWLER_FETCH_CONCURRENCY` + live-site headroom (ties into the pending Phase-4 `DB_POOL_MAX=25`); concurrency is capped at boot so cheerio parsing cannot starve the (Cloudflare-edge-cached) live site. **Disk:** draining 2.9M chapters ≈ **+38 GB** on `/mnt/hdd` — accepted by the operator.

## Testing / Verification

- **`RateGovernor` unit tests** (extend `packages/crawler/tests/rate-limit.test.ts`): a dynamic rps change rebuilds the bucket and changes the drain rate; `recordRateLimit` opens the breaker at threshold; an open breaker makes `acquire()` sleep the cooldown; half-open resumes and re-opens on a fresh 429/503.
- **Engine test:** a simulated 429/503 from `fetchHtml` calls `governor.recordRateLimit` and still surfaces `RateLimitError` (so the job retries as today).
- **Settings controller-e2e** through the global `ValidationPipe` (the lesson from the reports-400 bug): `crawlRps` accepts valid values and rejects out-of-range / unknown fields.
- **Manual prod proof:** bump `crawlRps` live at `/admin/settings`; watch `/api/v1/jobs/stats` throughput rise (completed/min) with the failure count staying flat; force a 503 (or lower the breaker threshold in a throwaway check) to confirm the breaker trips and recovers.

## Boundaries

- **Always:** commit only the files each task lists (explicit `git add`); never stage `apps/frontend/vite.config.ts` (permanent local proxy edit); commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; English-only identifiers/filenames (Vietnamese only in JSX copy + slugs); do **not** push without explicit user instruction. New/changed Drizzle schema → keep `.ts` cross-schema imports, update `drizzle.config.ts` array (+ `schema/index.ts` barrel only if a new file). Migrations run idempotently on api boot.
- **Ask first:** building the A2 worker container or a Redis-coordinated governor (out of scope here); any change to parsing, the feeder's ordering, or prioritization; raising the queue-capacity cap; touching prod compose/Caddy/host tuning.
- **Never:** change crawl correctness/parsing to gain speed; remove the rate limit entirely; set a default rps the probe hasn't shown safe (default stays a conservative 4, operator ramps from there).

## Acceptance criteria

1. Crawl rps is read live from `app_setting.crawlRps` (default 4) and changeable at `/admin/settings` with no redeploy; the engine picks up a change within the cache TTL.
2. `fetch-chapter` worker concurrency is set from `CRAWLER_FETCH_CONCURRENCY` (default 6); raising rps + concurrency together demonstrably increases throughput on prod (`jobs/stats` completed/min).
3. All per-source rate acquisition + 429/503 recording goes through a single `RateGovernor` seam; the in-process bucket/breaker can be swapped for a Redis-backed one without engine/processor changes.
4. The fetcher reuses connections via a per-host keep-alive pool; fetch behavior/headers/timeouts/error-mapping are otherwise unchanged.
5. A sustained burst of 429/503 opens the circuit-breaker (global pause + cooldown + half-open recovery); normal per-job retry/dead-letter behavior is unchanged.
6. No change to parsing, feeder ordering/prioritization, the queue-capacity cap, dead-letter, or retry-reconciler. Crawl output is byte-for-byte what it was, only faster.
