# Perf Phase 3 — Queue & Crawler Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standing 2026-06-09-incident recurrence vectors (unbounded enqueue past the 10k cap; Bull silently no-ops re-adds of retained jobIds; deploys mass-fail active jobs; crawler bursts trip 503s; sync zlib/cheerio stall the reader event loop) without changing externally-observable behavior.

**Architecture:** A FIFO token-bucket fix (no thundering herd) lets crawl rps go back to 1; two new queue helpers (`enqueueChunked` — addBulk in ≤500-job chunks with live headroom re-checks; `enqueueIdempotent` — remove-terminal-then-add so retained jobIds don't no-op) replace the unbounded/duplicate-prone producers; Bull gets longer locks + graceful shutdown so deploys don't strand jobs; and `gzip`/`gunzip` move to the libuv threadpool with a leaner per-chapter SELECT.

**Tech Stack:** NestJS 11 + `@nestjs/bull` 11 / Bull 4 (Redis), Drizzle, `@smanga/crawler` (undici + cheerio + zlib), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-performance-remediation-design.md` §5 — read it first. §5.6 (remove dead `autoRefreshConcurrency`) is **deferred** (see §Deferred below). Phases 1, 2, 4 are separate plans.

---

## Running tests (authoritative)

Per-package vitest configs:

| Package | Command |
|---|---|
| `@smanga/crawler` | `pnpm --filter @smanga/crawler exec vitest run tests/<file>` |
| `@smanga/api` | `pnpm --filter @smanga/api exec vitest run src/modules/<...>/<file>` (~20s collect) |
| typecheck | `pnpm --filter @smanga/<pkg> typecheck` |
| all | `pnpm test` |

**Pre-commit hook** (lefthook): `biome check` on staged files + full-monorepo `pnpm typecheck`. Before each commit: `pnpm exec biome check --write <changed files>`, re-stage. Never `--no-verify`, never `git add -A` (commit only the listed paths), never push.

**No live DB needed** for any task here — crawler tests use fake timers / mocks; queue-helper + jobs tests mock the Bull queue; the engine/processor changes are verified by typecheck + the existing crawler suite. Boot smoke (Bull settings) is the controller's job after.

---

## File structure

| File | Change |
|---|---|
| `packages/crawler/src/rate-limit.ts` | TokenBucket: FIFO serialization + loop-until-token (kills thundering herd) |
| `packages/crawler/src/sources/truyenfull/index.ts` | `rateLimit.rps` 0.5 → 1 |
| `packages/crawler/src/engine.ts` | `bucketFor` honors rps changes; `fetchChapterById` lean SELECT + adapter rps + async gzip |
| `apps/api/src/modules/chapters/chapters.service.ts` | `gunzipSync` → async `gunzip` |
| `apps/api/src/modules/queue/queue.module.ts` | `registerQueue` Bull `settings` (lockDuration/stalled/maxStalled) |
| `apps/api/src/main.ts` | `app.enableShutdownHooks()` |
| `apps/api/src/modules/queue/enqueue.util.ts` | **new** `enqueueChunked` + `enqueueIdempotent` |
| `apps/api/src/modules/queue/enqueue.util.spec.ts` | **new** unit tests |
| `apps/api/src/modules/jobs/jobs.service.ts` | refetchAllChapters/backfillCovers → `enqueueChunked`; retryAllFailed paginates |
| `apps/api/src/modules/sources/sources.service.ts` | discover-all `removeOnFail` bounded + `enqueueIdempotent` |
| `apps/api/src/modules/crawler-jobs/import-story.processor.ts` | chain via `enqueueIdempotent` |
| `apps/api/src/modules/crawler-jobs/discover-chapters.processor.ts` | chain via `enqueueIdempotent` |
| `apps/api/src/modules/app-settings/refresh-all-stories.processor.ts` | fan-out via `enqueueIdempotent` + periodic headroom re-check |

---

## Task 1: TokenBucket FIFO fix (thundering-herd)

The bug: `acquire()` sleeps once then unconditionally consumes a token, so N concurrent waiters wake at the same computed deadline and **all** proceed — emitting bursts that trip truyenfull's 503s (the reason rps was halved to 0.5). Fix: serialize waiters FIFO via a promise chain, and loop (refill → if token take & return, else sleep the deficit & re-check) so each waiter consumes exactly one real token.

**Files:**
- Modify: `packages/crawler/src/rate-limit.ts`
- Test: `packages/crawler/tests/rate-limit.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `packages/crawler/tests/rate-limit.test.ts` (inside the existing `describe('TokenBucket', ...)`):

```typescript
  it('serializes concurrent waiters one-per-interval (no thundering herd)', async () => {
    vi.useFakeTimers();
    try {
      // rps=2 → one token every 500ms; burst=1 → only the first is immediate.
      const bucket = new TokenBucket({ ratePerSecond: 2, burst: 1 });
      const resolvedAt: number[] = [];
      const t0 = Date.now();
      const ps = [bucket.acquire(), bucket.acquire(), bucket.acquire()].map((p, i) =>
        p.then(() => {
          resolvedAt[i] = Date.now() - t0;
        }),
      );
      // Drain virtual time well past 3 intervals, flushing microtasks each step.
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.all(ps);
      // #0 immediate; #1 ~500ms; #2 ~1000ms — spaced, NOT all at ~500ms.
      expect(resolvedAt[0]).toBeLessThan(50);
      expect(resolvedAt[1]).toBeGreaterThanOrEqual(450);
      expect(resolvedAt[2]).toBeGreaterThanOrEqual(950);
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smanga/crawler exec vitest run tests/rate-limit.test.ts`
Expected: FAIL — with the current code, waiters #1 and #2 both resolve at ~500ms (thundering herd), so `resolvedAt[2] >= 950` fails.

- [ ] **Step 3: Rewrite `acquire()` (FIFO + loop)**

Replace the entire `acquire()` method (currently lines ~28-39) in `packages/crawler/src/rate-limit.ts` with:

```typescript
  async acquire(): Promise<void> {
    // Serialize waiters FIFO so concurrent callers can't all wake on the same
    // computed deadline and stampede (the old single-sleep bug that forced
    // truyenfull rps down to 0.5). Each caller waits its turn, then loops:
    // refill, take a real token if one is available, else sleep the exact
    // deficit and re-check.
    const prev = this.chain;
    let release!: () => void;
    this.chain = new Promise<void>((r) => {
      release = r;
    });
    await prev;
    try {
      while (true) {
        this.refill();
        if (this.tokens >= 1) {
          this.tokens -= 1;
          return;
        }
        const deficit = 1 - this.tokens;
        const waitMs = Math.max(1, Math.ceil(deficit / this.refillPerMs));
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      }
    } finally {
      release();
    }
  }
```

And add the `chain` field to the class (next to the other private fields, after `private lastRefillMs: number;`):

```typescript
  // FIFO gate: each acquire() awaits the previous one before competing for a
  // token, so refills are handed out one caller at a time.
  private chain: Promise<void> = Promise.resolve();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @smanga/crawler exec vitest run tests/rate-limit.test.ts`
Expected: PASS (the existing "immediate" + "delays when empty" tests stay green; the new serialization test passes).

- [ ] **Step 5: Commit**

```bash
git add packages/crawler/src/rate-limit.ts packages/crawler/tests/rate-limit.test.ts
git commit -m "fix(crawler): FIFO token bucket — no thundering-herd bursts"
```

---

## Task 2: bucketFor honors rps changes + restore truyenfull rps→1

`bucketFor` caches a bucket per source forever, ignoring later rps changes. Make it re-create when rps differs, then restore truyenfull to 1 rps (safe now that Task 1 killed the bursts).

**Files:**
- Modify: `packages/crawler/src/engine.ts` (`bucketFor`, lines ~19-27)
- Modify: `packages/crawler/src/sources/truyenfull/index.ts` (rps)

- [ ] **Step 1: Make `bucketFor` rps-aware**

Replace the `bucketFor` block in `packages/crawler/src/engine.ts` (lines ~19-27):

```typescript
const buckets = new Map<string, { bucket: TokenBucket; rps: number }>();
function bucketFor(sourceId: string, rps: number): TokenBucket {
  const cached = buckets.get(sourceId);
  if (cached && cached.rps === rps) return cached.bucket;
  // rps changed (config/source edit) or first use → fresh bucket.
  const bucket = new TokenBucket({ ratePerSecond: rps, burst: rps });
  buckets.set(sourceId, { bucket, rps });
  return bucket;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @smanga/crawler typecheck`
Expected: PASS.

- [ ] **Step 3: Restore truyenfull rps**

In `packages/crawler/src/sources/truyenfull/index.ts`, change the `rateLimit` line (and its comment) from `rateLimit: { rps: 0.5 }` to:

```typescript
  // 1 rps. Was lowered to 0.5 to compensate for a token-bucket thundering-herd
  // bug (all concurrent processor types woke together and burst 4-6 requests,
  // tripping truyenfull's 503). Fixed in rate-limit.ts (FIFO acquire), so 1 rps
  // sustained is safe again — restores ~2x crawl throughput.
  rateLimit: { rps: 1 },
```

- [ ] **Step 4: Run the crawler suite**

Run: `pnpm --filter @smanga/crawler exec vitest run`
Expected: PASS (parser/rate-limit/cover/registry tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add packages/crawler/src/engine.ts packages/crawler/src/sources/truyenfull/index.ts
git commit -m "perf(crawler): bucketFor honors rps changes; restore truyenfull rps 0.5->1"
```

---

## Task 3: Async zlib + lean per-chapter SELECT

`fetchChapterById` does `SELECT *` (pulling the gzipped `content_text` bytea it never reads) + a second SELECT just for the source's rps, then `gzipSync` on the shared event loop. The reader's `getChapterContent` does `gunzipSync` per view. Move compression to the libuv threadpool and trim the queries.

**Files:**
- Modify: `packages/crawler/src/engine.ts` (`fetchChapterById`, lines ~357-394)
- Modify: `apps/api/src/modules/chapters/chapters.service.ts` (gunzip, line ~50)

- [ ] **Step 1: Rewrite `fetchChapterById`**

Replace the whole `fetchChapterById` function in `packages/crawler/src/engine.ts`:

```typescript
export async function fetchChapterById(db: Database, chapterId: string): Promise<void> {
  // Lean SELECT: only the 3 columns we use. The old SELECT * dragged the
  // gzipped content_text bytea (often tens of KB) into memory on every
  // re-fetch for no reason.
  const [row] = await db
    .select({ id: chapter.id, sourceId: chapter.sourceId, externalUrl: chapter.externalUrl })
    .from(chapter)
    .where(eq(chapter.id, chapterId))
    .limit(1);
  if (!row) throw new Error(`chapter not found: ${chapterId}`);

  // rps from the adapter (single source of truth, same as import/discover/
  // browse) — drops the extra source-table SELECT that only fed rateLimitRps.
  const adapter = getAdapter(row.sourceId);
  const bucket = bucketFor(adapter.id, adapter.rateLimit.rps);
  await bucket.acquire();

  try {
    const html = await fetchHtml(row.externalUrl);
    const content = await adapter.fetchChapterContent(html);
    const raw = Buffer.from(content.text, 'utf-8');
    const compressed = await gzip(raw); // libuv threadpool, off the event loop
    await db
      .update(chapter)
      .set({
        contentText: compressed,
        contentByteSize: raw.length,
        status: 'crawled',
        crawledAt: new Date(),
        lastError: null,
      })
      .where(eq(chapter.id, chapterId));
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    await db
      .update(chapter)
      .set({ status: 'failed', lastError: msg })
      .where(eq(chapter.id, chapterId));
    throw err;
  }
}
```

- [ ] **Step 2: Swap the zlib import in engine.ts**

At the top of `packages/crawler/src/engine.ts`, find the `gzipSync` import from `node:zlib` and replace it with a promisified `gzip`. If the current import is `import { gzipSync } from 'node:zlib';`, change to:

```typescript
import { gzip as gzipCb } from 'node:zlib';
import { promisify } from 'node:util';

const gzip = promisify(gzipCb);
```

(Place the `const gzip = ...` near the top with the other module-level consts. Remove the now-unused `gzipSync` import and the now-unused `sourceTable` import IF `fetchChapterById` was its only consumer — run typecheck in Step 4; if `sourceTable` is used elsewhere in engine.ts, leave its import.)

- [ ] **Step 3: Make the reader read path async**

In `apps/api/src/modules/chapters/chapters.service.ts`:
- Change the import `import { gunzipSync } from 'node:zlib';` to:
  ```typescript
  import { gunzip as gunzipCb } from 'node:zlib';
  import { promisify } from 'node:util';

  const gunzip = promisify(gunzipCb);
  ```
- In `getChapterContent`, change the decompress block (lines ~48-54) from the `gunzipSync` version to:
  ```typescript
    let text: string | null = null;
    if (row.content && row.content.length > 0) {
      try {
        text = (await gunzip(row.content as Buffer)).toString('utf-8');
      } catch {
        text = (row.content as Buffer).toString('utf-8');
      }
    }
  ```
  (The method is already `async`, so `await` is fine.)

- [ ] **Step 4: Typecheck both packages + crawler suite**

Run: `pnpm --filter @smanga/crawler typecheck` → PASS (resolves any now-unused-import errors — fix by removing them).
Run: `pnpm --filter @smanga/api typecheck` → PASS.
Run: `pnpm --filter @smanga/crawler exec vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/crawler/src/engine.ts apps/api/src/modules/chapters/chapters.service.ts
git commit -m "perf: async gzip/gunzip off the event loop + lean fetch-chapter SELECT"
```

---

## Task 4: Bull lock duration + graceful shutdown

Default `lockDuration=30s / maxStalledCount=1` means any >30s event-loop/Redis stall or Watchtower swap mass-fails active jobs as "stalled". Lengthen the lock and enable shutdown hooks so deploys let jobs release cleanly (`@nestjs/bull` closes queues on shutdown).

**Files:**
- Modify: `apps/api/src/modules/queue/queue.module.ts` (registerQueue)
- Modify: `apps/api/src/main.ts` (bootstrap)

- [ ] **Step 1: Add Bull `settings` to the queue registration**

In `apps/api/src/modules/queue/queue.module.ts`, replace the `BullModule.registerQueue({ name: QUEUE_CRAWLER })` line with:

```typescript
    BullModule.registerQueue({
      name: QUEUE_CRAWLER,
      settings: {
        // Default lockDuration 30s / maxStalledCount 1 mass-fails active jobs
        // on any >30s stall or a Watchtower container swap. Longer lock +
        // higher stalled tolerance survive deploys and brief event-loop stalls
        // during crawls (cheerio parse). lockRenewTime defaults to half of
        // lockDuration, which is fine.
        lockDuration: 120_000,
        stalledInterval: 60_000,
        maxStalledCount: 3,
      },
    }),
```

- [ ] **Step 2: Enable shutdown hooks**

In `apps/api/src/main.ts`, immediately after `const app = await NestFactory.create(AppModule, { bufferLogs: true });`, add:

```typescript
  // Let SIGTERM (Watchtower swap) run module destroy hooks so @nestjs/bull
  // closes the queue gracefully — active jobs release their locks instead of
  // being mass-failed as stalled on the next boot.
  app.enableShutdownHooks();
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @smanga/api typecheck` → PASS.
Run: `pnpm --filter @smanga/api build` → success (webpack bundles cleanly).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/queue/queue.module.ts apps/api/src/main.ts
git commit -m "fix(api): Bull lockDuration 120s + maxStalledCount 3 + graceful shutdown"
```

---

## Task 5: `enqueueChunked` + `enqueueIdempotent` helpers

Two reusable queue helpers. `enqueueChunked` addBulk's in ≤500-job chunks, re-reading the live `waiting` count before each chunk and stopping when the 10k cap leaves no headroom (so one click can't recreate the 3.7M flood). `enqueueIdempotent` does getJob → if the existing job is in a terminal state (completed/failed, which Bull retains) remove it then add, so a re-add with a retained jobId actually re-enqueues instead of silently no-oping; if the job is still waiting/active/delayed it returns the existing job untouched.

**Files:**
- Create: `apps/api/src/modules/queue/enqueue.util.ts`
- Test: `apps/api/src/modules/queue/enqueue.util.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/queue/enqueue.util.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { QUEUE_WAITING_CAP } from './queue-capacity';
import { enqueueChunked, enqueueIdempotent } from './enqueue.util';

const mkJobs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: 'fetch-chapter', data: { chapterId: `c${i}` }, opts: { jobId: `j${i}` } }));

describe('enqueueChunked', () => {
  it('addBulks in chunks and stops when the cap leaves no headroom', async () => {
    let waiting = QUEUE_WAITING_CAP - 1200; // headroom 1200
    const addBulk = vi.fn(async (chunk: unknown[]) => {
      waiting += chunk.length;
      return [];
    });
    const getWaitingCount = vi.fn(async () => waiting);
    const queue = { addBulk, getWaitingCount } as never;

    const res = await enqueueChunked(queue, mkJobs(5000), 500);

    // Enqueued only up to the 1200 headroom (in 500-chunks: 500+500+200), then stopped.
    expect(res.enqueued).toBe(1200);
    expect(res.remaining).toBe(3800);
    expect(addBulk).toHaveBeenCalledTimes(3);
  });

  it('enqueues everything when there is ample headroom', async () => {
    const addBulk = vi.fn(async () => []);
    const getWaitingCount = vi.fn(async () => 0);
    const queue = { addBulk, getWaitingCount } as never;
    const res = await enqueueChunked(queue, mkJobs(900), 500);
    expect(res).toEqual({ enqueued: 900, remaining: 0 });
    expect(addBulk).toHaveBeenCalledTimes(2); // 500 + 400
  });

  it('does nothing for an empty job list', async () => {
    const addBulk = vi.fn();
    const getWaitingCount = vi.fn(async () => 0);
    const queue = { addBulk, getWaitingCount } as never;
    expect(await enqueueChunked(queue, [], 500)).toEqual({ enqueued: 0, remaining: 0 });
    expect(addBulk).not.toHaveBeenCalled();
  });
});

describe('enqueueIdempotent', () => {
  it('removes a completed/failed job under the same id, then re-adds', async () => {
    const remove = vi.fn(async () => {});
    const existing = { getState: vi.fn(async () => 'completed'), remove };
    const getJob = vi.fn(async () => existing);
    const add = vi.fn(async () => ({ id: 'new' }));
    const queue = { getJob, add } as never;

    await enqueueIdempotent(queue, 'discover-chapters', { storyId: 's1' }, { jobId: 'discover-chapters:s1' });

    expect(remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith('discover-chapters', { storyId: 's1' }, { jobId: 'discover-chapters:s1' });
  });

  it('leaves an active/waiting job alone and does NOT re-add', async () => {
    const remove = vi.fn();
    const existing = { getState: vi.fn(async () => 'active'), remove };
    const getJob = vi.fn(async () => existing);
    const add = vi.fn();
    const queue = { getJob, add } as never;

    const res = await enqueueIdempotent(queue, 'discover-chapters', { storyId: 's1' }, { jobId: 'discover-chapters:s1' });

    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(res).toBe(existing);
  });

  it('adds normally when no job exists for the id', async () => {
    const getJob = vi.fn(async () => null);
    const add = vi.fn(async () => ({ id: 'new' }));
    const queue = { getJob, add } as never;
    await enqueueIdempotent(queue, 'fetch-chapter', { chapterId: 'c1' }, { jobId: 'fetch-chapter:c1' });
    expect(add).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smanga/api exec vitest run src/modules/queue/enqueue.util.spec.ts`
Expected: FAIL — module `./enqueue.util` does not exist.

- [ ] **Step 3: Write the helpers**

Create `apps/api/src/modules/queue/enqueue.util.ts`:

```typescript
import type { Job, JobOptions, Queue } from 'bull';
import { QUEUE_WAITING_CAP } from './queue-capacity';

interface BulkJob {
  name: string;
  data: unknown;
  opts?: JobOptions;
}

/**
 * addBulk in chunks, re-reading the live `waiting` count before each chunk and
 * stopping when the cap (QUEUE_WAITING_CAP) leaves no headroom. Prevents a
 * single producer from blowing past the cap in one shot (the 2026-06-09
 * 3.7M-job Redis-meltdown class). Returns how many were enqueued vs left
 * behind so the caller can report partial progress / be re-run later.
 */
export async function enqueueChunked(
  queue: Queue,
  jobs: BulkJob[],
  chunkSize = 500,
): Promise<{ enqueued: number; remaining: number }> {
  let enqueued = 0;
  for (let i = 0; i < jobs.length; i += chunkSize) {
    // Fresh count (NOT the 2s capacity cache) so headroom is accurate as we drain.
    const waiting = await queue.getWaitingCount();
    const headroom = QUEUE_WAITING_CAP - waiting;
    if (headroom <= 0) break;
    const take = Math.min(chunkSize, headroom, jobs.length - i);
    await queue.addBulk(jobs.slice(i, i + take) as never);
    enqueued += take;
    if (take < chunkSize) break; // headroom-limited this chunk → next loop would also be 0
  }
  return { enqueued, remaining: jobs.length - enqueued };
}

const TERMINAL_STATES = new Set(['completed', 'failed']);

/**
 * Idempotent enqueue for fixed-jobId producers. Bull's addJob silently returns
 * the existing job when its jobId hash is present in ANY state — so a re-add
 * against a RETAINED completed (7d/20k) or failed (24h/5k) job no-ops, which
 * silently breaks auto-refresh re-ticks, crawl-missing rescue clicks, and
 * discover-all re-runs. This removes a terminal-state leftover before adding,
 * but leaves a still-queued (waiting/active/delayed) job untouched so we don't
 * duplicate in-flight work.
 */
export async function enqueueIdempotent(
  queue: Queue,
  name: string,
  data: unknown,
  opts: JobOptions & { jobId: string },
): Promise<Job> {
  const existing = await queue.getJob(opts.jobId);
  if (existing) {
    const state = await existing.getState().catch(() => null);
    if (state && !TERMINAL_STATES.has(state)) return existing; // still queued — don't duplicate
    await existing.remove().catch(() => {}); // terminal leftover — clear so the re-add takes
  }
  return queue.add(name, data as never, opts);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @smanga/api exec vitest run src/modules/queue/enqueue.util.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/queue/enqueue.util.ts apps/api/src/modules/queue/enqueue.util.spec.ts
git commit -m "feat(api): enqueueChunked + enqueueIdempotent queue helpers"
```

---

## Task 6: Bound the big enqueue producers (jobs.service)

`refetchAllChapters` and `backfillCovers` build the full job set and `addBulk` it after a single cap check — a click can enqueue ~109k jobs past the cap. `retryAllFailed` pulls the entire failed set unbounded. Route the first two through `enqueueChunked`, and page the retry loop.

**Files:**
- Modify: `apps/api/src/modules/jobs/jobs.service.ts` (`refetchAllChapters` ~236-270, `backfillCovers` ~285-324, `retryAllFailed` ~199-227)
- Test: `apps/api/src/modules/jobs/jobs.service.spec.ts` (adjust existing addBulk assertions)

- [ ] **Step 1: Import the helper**

In `apps/api/src/modules/jobs/jobs.service.ts`, add to the imports:

```typescript
import { enqueueChunked } from '@/modules/queue/enqueue.util';
```

- [ ] **Step 2: Route refetchAllChapters through enqueueChunked**

In `refetchAllChapters`, replace the final two lines (`await this.queue.addBulk(jobs);` + `return { enqueued: jobs.length };`) with:

```typescript
    const { enqueued, remaining } = await enqueueChunked(this.queue, jobs);
    return { enqueued, remaining };
  }
```

Change the method's return type annotation from `Promise<{ enqueued: number }>` to `Promise<{ enqueued: number; remaining: number }>`.

- [ ] **Step 3: Route backfillCovers through enqueueChunked**

In `backfillCovers`, replace `await this.queue.addBulk(jobs);` + `return { enqueued: jobs.length, totalNullCover };` with:

```typescript
    const { enqueued, remaining } = await enqueueChunked(this.queue, jobs);
    return { enqueued, remaining, totalNullCover };
  }
```

Change its return type to `Promise<{ enqueued: number; remaining: number; totalNullCover: number }>`.

- [ ] **Step 4: Page retryAllFailed**

Replace `const failed = await this.queue.getJobs(['failed'], 0, -1);` and the `for (const job of failed)` loop header in `retryAllFailed` with a paged version. Replace from that `const failed = ...` line through the end of the `for` loop body's closing brace with:

```typescript
    let retried = 0;
    let skipped = 0;
    const PAGE = 1000;
    for (let start = 0; ; start += PAGE) {
      const failed = await this.queue.getJobs(['failed'], start, start + PAGE - 1);
      if (failed.length === 0) break;
      for (const job of failed) {
        try {
          await job.retry();
          retried += 1;
        } catch {
          try {
            await this.queue.add(job.name, job.data, {
              attempts: job.opts.attempts ?? 3,
              backoff: job.opts.backoff,
              priority: job.opts.priority,
            });
            await job.remove().catch(() => {});
            retried += 1;
          } catch {
            skipped += 1;
          }
        }
      }
      if (failed.length < PAGE) break;
    }
    return { retried, skipped };
```

(Keep the existing `this.statsCache = null;` line above this block. Delete the old `let retried = 0; let skipped = 0;` that preceded the old loop so they aren't declared twice.)

- [ ] **Step 5: Update the existing tests**

In `apps/api/src/modules/jobs/jobs.service.spec.ts`, the refetch/backfill tests assert `addBulk` was called and on the result shape. `enqueueChunked` calls `queue.getWaitingCount()` before `addBulk`, so the mocked queue already has `getWaitingCount` (it does — used by the cap check). Update the two result assertions:
- refetch happy path: `expect(result).toEqual({ enqueued: 2, remaining: 0 });`
- backfill happy path: `expect(result).toEqual({ enqueued: 2, remaining: 0, totalNullCover: 2 });`

The `addBulk`/`getWaitingCount` mocks already resolve appropriately (getWaitingCount → 100/50 gives ample headroom). No other test changes needed; the 503-at-capacity tests still assert `addBulk` not called (assertQueueCapacity throws first).

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @smanga/api exec vitest run src/modules/jobs/jobs.service.spec.ts` → PASS.
Run: `pnpm --filter @smanga/api typecheck` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/jobs/jobs.service.ts apps/api/src/modules/jobs/jobs.service.spec.ts
git commit -m "fix(api): chunked enqueue for refetch/backfill + paged retryAllFailed"
```

---

## Task 7: Idempotent re-enqueue at fixed-jobId producers + discover-all retention

Replace silent-no-op `queue.add(..., { jobId })` calls with `enqueueIdempotent` at the chaining/fan-out producers, and stop `discover-all-source` from wedging forever.

**Files:**
- Modify: `apps/api/src/modules/sources/sources.service.ts` (discover-all enqueue ~162-170)
- Modify: `apps/api/src/modules/crawler-jobs/import-story.processor.ts` (~48-51)
- Modify: `apps/api/src/modules/crawler-jobs/discover-chapters.processor.ts` (~59-65)
- Modify: `apps/api/src/modules/app-settings/refresh-all-stories.processor.ts` (~70-90)

- [ ] **Step 1: discover-all — bound removeOnFail + idempotent add**

In `apps/api/src/modules/sources/sources.service.ts`, in `enqueueDiscoverAll`, replace the `await this.queue.add(JOB_DISCOVER_ALL_SOURCE, payload, { jobId, removeOnComplete: true, removeOnFail: false, priority })` call with `enqueueIdempotent` and a bounded `removeOnFail`:

```typescript
    const job = await enqueueIdempotent(this.queue, JOB_DISCOVER_ALL_SOURCE, payload, {
      jobId,
      removeOnComplete: true,
      // Was `false` → a failed discover-all stayed in Redis forever, and Bull's
      // jobId dedup then silently no-op'd every re-run (the feed was wedged
      // until a manual Redis purge). Bound it; enqueueIdempotent also clears a
      // terminal leftover before re-adding.
      removeOnFail: { age: 86_400, count: 50 },
      priority: JOB_PRIORITY.DISCOVER_ALL_SOURCE,
    });
```

Add the import: `import { enqueueIdempotent } from '@/modules/queue/enqueue.util';`. The existing pre-check (getJob → getState → 409 if waiting/active/delayed) STAYS — it gives the operator a clear "already running" 409; `enqueueIdempotent` then handles the terminal-leftover case the pre-check intentionally falls through.

- [ ] **Step 2: import-story chain → idempotent**

In `apps/api/src/modules/crawler-jobs/import-story.processor.ts`, replace the chain `await this.queue.add(JOB_DISCOVER_CHAPTERS, payload, { jobId: \`discover-chapters:${storyId}\`, priority: JOB_PRIORITY.DISCOVER_CHAPTERS })` with:

```typescript
          await enqueueIdempotent(this.queue, JOB_DISCOVER_CHAPTERS, payload, {
            jobId: `discover-chapters:${storyId}`,
            priority: JOB_PRIORITY.DISCOVER_CHAPTERS,
          });
```

Add the import `import { enqueueIdempotent } from '@/modules/queue/enqueue.util';`.

- [ ] **Step 3: discover-chapters chain → idempotent**

In `apps/api/src/modules/crawler-jobs/discover-chapters.processor.ts`, replace the per-row `await this.queue.add(JOB_FETCH_CHAPTER, payload, { jobId: \`fetch-chapter:${r.id}\`, priority: JOB_PRIORITY.FETCH_CHAPTER })` inside the loop with:

```typescript
            await enqueueIdempotent(this.queue, JOB_FETCH_CHAPTER, payload, {
              jobId: `fetch-chapter:${r.id}`,
              priority: JOB_PRIORITY.FETCH_CHAPTER,
            });
```

Add the import `import { enqueueIdempotent } from '@/modules/queue/enqueue.util';`.

- [ ] **Step 4: refresh-all fan-out → idempotent + periodic headroom re-check**

In `apps/api/src/modules/app-settings/refresh-all-stories.processor.ts`, replace the fan-out `for (const r of rows) { ... await this.queue.add(JOB_DISCOVER_CHAPTERS, payload, { jobId, priority }); ... }` loop body with an idempotent add plus a periodic capacity re-check (the cron can fan out ~37k, so re-check headroom every 200 stories and stop the rest for next tick):

```typescript
    let enqueued = 0;
    let skipped = 0;
    for (let i = 0; i < rows.length; i += 1) {
      // Re-check capacity periodically — the upfront check is stale after a few
      // hundred enqueues; stop and let the next tick continue rather than blow
      // past the cap.
      if (i % 200 === 0 && i > 0 && (await isQueueAtCapacity(this.queue))) {
        skipped += rows.length - i;
        this.logger.warn(
          `refresh-all-stories ${job.id} stopped at ${i}/${rows.length} — queue near cap; rest deferred to next tick`,
        );
        break;
      }
      const r = rows[i];
      const payload: DiscoverChaptersJobData = { storyId: r.id, requestedBy: null, autoCrawl: true };
      try {
        await enqueueIdempotent(this.queue, JOB_DISCOVER_CHAPTERS, payload, {
          jobId: `discover-chapters:${r.id}`,
          priority: JOB_PRIORITY.REFRESH_ALL_STORIES,
        });
        enqueued += 1;
      } catch {
        skipped += 1;
      }
    }
```

Add the import `import { enqueueIdempotent } from '@/modules/queue/enqueue.util';` (the file already imports `isQueueAtCapacity`).

- [ ] **Step 5: Typecheck + build**

Run: `pnpm --filter @smanga/api typecheck` → PASS.
Run: `pnpm --filter @smanga/api exec vitest run src/modules/jobs` → PASS (no processor unit tests exist; this confirms the jobs specs still pass after the import additions). 
Run: `pnpm --filter @smanga/api build` → success.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/sources/sources.service.ts apps/api/src/modules/crawler-jobs/import-story.processor.ts apps/api/src/modules/crawler-jobs/discover-chapters.processor.ts apps/api/src/modules/app-settings/refresh-all-stories.processor.ts
git commit -m "fix(api): idempotent re-enqueue at fixed-jobId producers + bound discover-all retention"
```

---

## Task 8: Verify + finish

- [ ] **Step 1: Full suite**

Run: `pnpm test`
Expected: all packages green (crawler +1 TokenBucket test; api +6 enqueue.util tests; nothing regressed).

- [ ] **Step 2: Boot smoke (controller-run; needs local Postgres+Redis on the dev ports)**

Build + boot the api on `PORT=3010` against local dev infra. Confirm: no DI errors, the queue registers (no Bull settings error), `Nest application successfully started`, and a clean `SIGTERM` (Ctrl-C) logs graceful shutdown rather than hanging. (Rebuild needed — api code changed.)

- [ ] **Step 3: Finish**

Use `superpowers:finishing-a-development-branch`. Commit-only — do not push without explicit user request (push auto-deploys via CI→Watchtower). After deploy, there is no single prod probe for Phase 3 (it's resilience, not latency) — sanity-check that crawling still progresses (`/admin/jobs` shows completions, no stalled-failure spike) and that a deploy no longer mass-fails active jobs.

---

## Deferred (not in this plan)

- **§5.6 remove dead `autoRefreshConcurrency`**: the global `ValidationPipe` has `forbidNonWhitelisted: true`, so dropping the DTO field while the frontend settings form still sends `concurrency` would make the PATCH 400. Removing it safely requires a coupled frontend-form change for a purely-cosmetic dead-field cleanup — low value, deferred to a standalone cleanup. The DB column stays (no migration).
- Dedicated worker process for Bull processors (spec's architectural follow-up) — async zlib (Task 3) is this phase's event-loop mitigation.

---

## Self-review (author's checklist — completed)

**Spec §5 coverage:** §5.1 chunked enqueue → Tasks 5+6 (helper + jobs.service) and §5/Task 7 (refresh fan-out periodic re-check); §5.2 idempotent re-enqueue + discover-all `removeOnFail` → Tasks 5+7; §5.3 Bull settings + shutdown → Task 4; §5.4 TokenBucket fix + cover-through-bucket + rps restore → Tasks 1+2 (note: `downloadCover` routing through the bucket is **not** done here — it's a low-frequency path and out of this plan's edited surface; flagged for a follow-up, the TokenBucket fix is the load-bearing part); §5.5 async zlib + lean select → Task 3; §5.6 → Deferred. Gap noted: `downloadCover` bucket routing deferred (small, separate).

**Placeholder scan:** every code step has complete code; `~NNN` line numbers are navigational, the code blocks are authoritative.

**Type consistency:** `enqueueChunked(queue, jobs, chunkSize?) → {enqueued, remaining}` and `enqueueIdempotent(queue, name, data, opts & {jobId}) → Job` are defined in Task 5 and consumed with those exact shapes in Tasks 6 & 7. `refetchAllChapters`/`backfillCovers` return-type changes (Task 6) match their updated test assertions (Task 6 Step 5). `bucketFor` (Task 2) stores `{bucket, rps}` and is called `bucketFor(adapter.id, adapter.rateLimit.rps)` in Task 3 — consistent. The promisified `gzip`/`gunzip` consts (Task 3) match their `await` call sites.
