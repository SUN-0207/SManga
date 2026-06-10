# Job Retry & Dead-Letter Queue — Design Spec

- **Date:** 2026-06-10
- **Status:** Approved (design), pending implementation plan
- **Owner:** son.cu@opswat.com
- **Scope:** `apps/api` crawler queue, `packages/shared` errors, `packages/db` schema, `apps/frontend` `/admin/jobs`

## 1. Problem

When a crawler job fails for any reason, there is **no automatic recovery after Bull's in-process attempts are exhausted**. A failed job lands in Bull's `failed` set and stays there until an operator manually clicks **"Retry tất cả thất bại"** on `/admin/jobs`. Two consequences:

1. **No self-healing.** Transient failures (network blips, upstream 5xx, rate-limit) that outlast the current `attempts: 2` budget require a human to notice and click.
2. **Failure history is lost.** `removeOnFail: { age: 86_400, count: 5_000 }` trims the `failed` set after 24h / 5k entries. Failures older than that vanish — there is no durable record of what failed or why.

### What already exists (do not rebuild)

- **Automatic in-process retry**: `defaultJobOptions = { attempts: 2, backoff: { type: 'exponential', delay: 30_000 } }` in `apps/api/src/modules/queue/queue.module.ts`. `refetchAllChapters` / `backfillCovers` override to `attempts: 3`.
- **Manual operator retry**: `JobsService.retry(id)` and `JobsService.retryAllFailed()` (with a clone-fallback when Bull refuses `.retry()`).
- **Failure visibility**: `stats()` exposes `failed` count + an `erroring` sample; `list()` returns `failedReason` + `attemptsMade` per row.

### Hard constraint — the 2026-06-09 Redis incident

Aggressive retry/enqueue drove Redis to **100% CPU** (3.7M waiting jobs; a single `refetchAllChapters` click enqueued 3.7M). In response, `attempts` was *deliberately lowered* 3→2, and `removeOnFail`/`removeOnComplete` were bounded. **Any retry enhancement must stay inside tight caps and must not add sustained load to Redis.** "Retry everything, forever" is precisely what broke production.

## 2. Goals / Non-goals

**Goals**
- Automatically recover **transient** terminal failures without operator action, within bounds that cannot recreate the incident.
- Classify failures so retry budget is spent only where it can help; **permanent** failures are surfaced, never looped.
- Keep a **durable** failure record (survives Redis trim + restarts) and a "needs attention" inbox.

**Non-goals**
- Changing Bull's in-process retry (`attempts`/`backoff` stay as tuned).
- Retrying non-crawler work (only `QUEUE_CRAWLER`).
- Replacing the existing manual retry buttons (they remain as operator-rescue paths).
- Real-time alerting/notifications (possible later; out of scope here).

## 3. Chosen approach

**Postgres-backed dead-letter queue + scheduled reconciler.** The retry "brain" lives in Postgres (the project's source of truth), not Redis. This is the only approach that (a) keeps a durable audit trail, (b) moves retry bookkeeping *off* the resource that melted, and (c) is bounded by construction.

Rejected alternatives:
- **Bull-native sweeper** — failures lost on `removeOnFail` trim before the sweep; the sweeper reads Redis (the bottleneck); retry-generation state has to live in job data.
- **Minimal (cron the existing `retryAllFailed`)** — same durability hole, same Redis dependence, weakest audit trail. Acceptable stepping-stone only.

### Data flow

```
job throws ──▶ Bull in-process retry (attempts:2, 30s exp)   ← unchanged; transient blips caught here
                     │ attempts exhausted
                     ▼
   @OnQueueFailed listener ──▶ classifyCrawlerError(err)
                     │
       ┌─────────────┴─────────────┐
   transient                    permanent
       ▼                            ▼
 job_failure row              job_failure row
 status=pending               status=needs_attention   (never auto-retried)
 nextRetryAt = now+backoff(gen)
       │
       ▼  RetryReconciler (every 5 min, bounded)
 re-enqueue into Bull (original jobId + priority)
       │
       ├─ success ─▶ @OnQueueCompleted ──▶ row status=resolved
       └─ fail ────▶ @OnQueueFailed ──▶ bump retryGeneration, recompute nextRetryAt
                                            │ retryGeneration ≥ MAX (5)
                                            ▼
                                         status=dead (manual-only)
```

## 4. Data model — `job_failure` (new Drizzle table)

New schema file `packages/db/src/schema/job-failure.ts`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `dedupKey` | text, **unique** | Natural key for the underlying work, e.g. `fetch-chapter:<chapterId>`, `import-story:<url>`. Upsert target — repeated failures of the same work update one row, never spawn duplicates. |
| `queue` | text | default `'crawler'` (future-proofing) |
| `jobName` | text | Bull job name (`fetch-chapter`, `import-story`, …) |
| `jobData` | jsonb | Exact payload needed to re-enqueue |
| `errorClass` | text | Constructor name (`FetchError`, `ParserError`, …) |
| `classification` | enum `job_failure_class` (`transient`/`permanent`) | from `classifyCrawlerError` |
| `failedReason` | text | Last error message |
| `attemptsMade` | integer | Bull attempts at terminal failure |
| `retryGeneration` | integer | default `0`; reconciler re-enqueue count → drives backoff + give-up |
| `status` | enum `job_failure_status` (`pending`/`retrying`/`needs_attention`/`dead`/`resolved`) | lifecycle (see §6) |
| `firstFailedAt` | timestamptz | set on first insert |
| `lastFailedAt` | timestamptz | updated each terminal failure |
| `nextRetryAt` | timestamptz, nullable | reconciler only picks rows where `nextRetryAt ≤ now`; null for permanent/dead/resolved |
| `resolvedAt` | timestamptz, nullable | set on resolve |
| `createdAt` / `updatedAt` | timestamptz | standard |

Index on `(status, classification, nextRetryAt)` for the reconciler query; unique index on `dedupKey`.

**Schema wiring (project workarounds):** cross-schema imports inside the file use `.ts` extensions (workaround #1); append the file to the explicit `schema:` array in `packages/db/drizzle.config.ts` (workaround #2); export from `schema/index.ts` barrel with `.js`. Migration is generated via drizzle-kit and runs on api boot (idempotent through the drizzle journal).

## 5. Classification — `packages/shared/src/retry-policy.ts`

Pure, unit-tested module. `classifyCrawlerError(err: unknown): 'transient' | 'permanent'`.

| Error | Classification | Rationale |
|---|---|---|
| `RateLimitError` (429/503) | transient | upstream throttling — retry with longer backoff |
| `FetchError`, network error | transient | connection reset / timeout |
| `FetchError`, HTTP 5xx / 408 | transient | upstream server hiccup |
| `FetchError`, HTTP 4xx (404/403/400) | **permanent** | resource gone / forbidden — retrying is pointless |
| `ParserError` | **permanent** | site HTML changed → needs a parser code fix, not a retry |
| `AdapterNotFoundError` | **permanent** | config error |
| unknown / generic `Error` | **permanent** | conservative — surface it, never loop on something we don't understand |

**Prerequisite change:** add `statusCode?: number` to `FetchError` (`packages/shared/src/errors.ts`) and populate it in `packages/crawler/src/fetcher.ts` from `res.statusCode`. Today the status lives only in the message string (`"http 404 fetching …"`), so 404 and 503 are indistinguishable to a classifier.

The same module exports the **per-generation backoff ladder** (§6) as a pure function `backoffForGeneration(gen): minutes`.

## 6. Lifecycle state machine

- **insert/upsert (on terminal failure)** — `@OnQueueFailed` classifies and upserts by `dedupKey`:
  - transient → `status = pending`, `nextRetryAt = now + backoffForGeneration(retryGeneration + 1)`. Generation numbering starts at **1** for the first dead-letter retry, so a fresh failure (`retryGeneration = 0`) is scheduled `now + 10m`.
  - permanent → `status = needs_attention`, `nextRetryAt = null`
  - On repeat failure of an existing row: update `lastFailedAt`, `failedReason`, `attemptsMade`.
- **reconciler re-enqueue** — sets `status = retrying`, increments `retryGeneration`, recomputes `nextRetryAt` for the *next* generation.
- **success** — `@OnQueueCompleted` matches the row by `dedupKey` and sets `status = resolved`, `resolvedAt = now`.
- **give-up** — when `retryGeneration ≥ MAX_RETRY_GENERATIONS` (5) and it fails again → `status = dead`, `nextRetryAt = null`. Operator-only from here.
- **operator actions** — "retry now" (set `nextRetryAt = now`, `status = pending`, works on `dead`/`needs_attention` too); "dismiss/resolve" (`status = resolved`).

## 7. Reconciler safety envelope

`apps/api/src/modules/jobs/retry-reconciler.service.ts`, scheduled (reuses the scheduling mechanism the `refresh-all-stories` path already uses — confirm `@nestjs/schedule` `@Cron` vs Bull repeatable at plan time).

- **Cadence**: every 5 minutes.
- **Per-run batch cap**: re-enqueue at most **200** rows per run (constant, documented).
- **Capacity gate**: call `assertQueueCapacity(queue)` before enqueuing; additionally **skip the entire run** if Bull `waiting` exceeds a high-water threshold (`RECONCILER_SKIP_OVER_WAITING = 10_000`) — never pile onto a backed-up queue.
- **Coarse per-generation backoff** (on top of Bull's fine 30s exp): gen 1 → 10m, 2 → 30m, 3 → 2h, 4 → 6h, 5 → 24h, then `dead`.
- **Kill switch**: `auto_retry_enabled` boolean in app-settings (default **ON**), mirroring the existing auto-refresh toggle. Reconciler no-ops when off — instant disable during an incident.
- **Re-enqueue fidelity**: preserve original `jobId` (idempotency) and `priority` (so a retried `fetch-chapter` keeps `priority: 1`), matching the existing clone-fallback logic in `jobs.service.ts`.

Together these make a 3.7M-job flood structurally impossible: trickle rate, hard batch cap, capacity gate, global off switch, and a DB-side give-up.

## 8. Components / files

| File | Change |
|---|---|
| `packages/shared/src/retry-policy.ts` | **new** — `classifyCrawlerError`, `backoffForGeneration`, constants |
| `packages/shared/src/errors.ts` | add `statusCode?: number` to `FetchError` |
| `packages/crawler/src/fetcher.ts` | populate `FetchError.statusCode` from `res.statusCode` |
| `packages/db/src/schema/job-failure.ts` | **new** table + enums |
| `packages/db/drizzle.config.ts`, `schema/index.ts` | register new schema file |
| `apps/api/.../jobs/job-failure.listener.ts` | **new** `@Processor(QUEUE_CRAWLER)` listener-only class: `@OnQueueFailed` (upsert) + `@OnQueueCompleted` (resolve) |
| `apps/api/.../jobs/retry-reconciler.service.ts` | **new** scheduled bounded re-enqueue |
| `apps/api/.../jobs/jobs.service.ts` + `jobs.controller.ts` | dead-letter list, "retry now", "dismiss/resolve" endpoints |
| `apps/api/.../app-settings/*` | `auto_retry_enabled` toggle |
| `apps/frontend` `/admin/jobs` | **Needs Attention / Dead Letter** panel |

**Naming:** English-only for filenames/exports/types/identifiers (per project rule); Vietnamese is fine in JSX display text and URL slugs.

## 9. Observability / admin UI

`/admin/jobs` gains a **Needs Attention / Dead Letter** panel listing `job_failure` rows where `status ∈ {pending, retrying, needs_attention, dead}`, showing: job name, dedup key, error class + classification, last reason, retry generation, next retry time, status. Per-row **Retry now** and **Dismiss**; a bulk **Retry all pending**. Follow `design-system/smanga/MASTER.md` + a generated `/admin/jobs` page override before writing UI.

## 10. Testing

Vitest units (mock Bull queue + db, in the style of `jobs.service.spec.ts`):
- `classifyCrawlerError` — every error class → expected classification, including 404 vs 503 vs network vs unknown.
- `backoffForGeneration` — ladder values; give-up boundary at gen 5.
- Reconciler — batch cap honored; capacity-gate / high-water skip; `auto_retry_enabled = false` ⇒ no-op; only picks `nextRetryAt ≤ now` + transient + under-cap.
- Listener — upsert dedup (second failure updates, not inserts); permanent ⇒ `needs_attention`; `@OnQueueCompleted` ⇒ `resolved`.

## 11. Defaults chosen (change at will)

- `MAX_RETRY_GENERATIONS = 5`
- Reconciler cadence: every 5 minutes
- Per-run batch cap: 200
- Skip-run high-water: `waiting > 10_000`
- Backoff ladder: 10m / 30m / 2h / 6h / 24h (generations 1–5)
- `auto_retry_enabled` default: **ON**
- Unknown errors classified **permanent**

## 12. Risks & mitigations

- **Reconciler adds Redis load** → mitigated by 5-min cadence, 200 cap, capacity gate, high-water skip, kill switch. Reconciler reads Postgres, only *writes* a bounded burst to Redis.
- **Error class lost across process boundary** → `@OnQueueFailed` runs in-process with the real `Error` instance for locally-processed jobs (single API process runs producer + workers); classification via `instanceof` is reliable. Verify in plan; fall back to a structured marker on the error if needed.
- **`dedupKey` collisions across job types** → key is prefixed with job name, so namespaces don't collide.
- **Resolved-but-still-failing races** → `@OnQueueCompleted` only resolves by exact `dedupKey`; a later failure re-upserts and re-arms.
```
