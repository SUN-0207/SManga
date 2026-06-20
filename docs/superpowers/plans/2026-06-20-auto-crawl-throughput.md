# Auto-Crawl Throughput Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise auto-crawl throughput against truyenfull from ~1 chapter/sec toward the source's safe ceiling — via a live rps knob, higher worker concurrency, connection reuse, and a global circuit-breaker — with zero change to crawl correctness, parsing, or feeder ordering.

**Architecture:** Route all per-source rate acquisition through one new `RateGovernor` singleton in `packages/crawler` (owns the token bucket + circuit-breaker + a live `globalRps` override). The api pushes `app_setting.crawlRps` into it (boot + on PATCH); the CLI leaves it unset and falls back to the static adapter rps. Worker concurrency comes from an env var; the fetcher gets a keep-alive undici `Agent`. The governor's two-method surface (`acquire` / `recordRateLimit`) is the seam a future worker-container split (A2) swaps for a Redis-backed impl.

**Tech Stack:** TypeScript, NestJS 11, Bull/Redis, Drizzle + Postgres 17, undici, vitest, Vite/React 19, class-validator.

## Global Constraints

- Config/dependency/rate changes only — **no change to parsing, the feeder's newest-first ordering, prioritization, the queue-capacity cap, dead-letter, or retry-reconciler**. Crawl output is byte-for-byte what it was, only faster.
- Commit only the files each task lists (explicit `git add`; never `git add -A`); **never** stage `apps/frontend/vite.config.ts` (permanent local proxy edit).
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Do NOT push without explicit user instruction.** Trunk-based: commit directly to `main`.
- English-only identifiers/filenames/exports/types (Vietnamese only in JSX copy + URL slugs).
- New Drizzle column on an **existing** schema file → no `drizzle.config.ts` array change and no `schema/index.ts` barrel change (those are needed only for a *new* schema file). Internal cross-schema imports stay `.ts`.
- Migrations run idempotently on api boot via the drizzle journal. Generate with `pnpm --filter @smanga/db generate` (offline diff) — never hand-write migration SQL.
- Local dev: API `PORT=3010` (OPSWAT holds 3001); db commands need `$env:DATABASE_URL="postgres://smanga:smanga_dev@localhost:5432/smanga"`. The dev postgres + redis run via `pnpm dev:db`.
- Locked defaults (verbatim from spec): `crawlRps` default **4**, clamp **[0.1, 20]**; `CRAWLER_FETCH_CONCURRENCY` default **6**, clamp **[1, 32]**; circuit-breaker **≥5 hits in 60 s → 60 s cooldown**.

**Spec:** `docs/superpowers/specs/2026-06-20-auto-crawl-throughput-design.md`

---

## Task 1: `RateGovernor` — buckets + live rps + circuit-breaker

**Files:**
- Create: `packages/crawler/src/rate-governor.ts`
- Create: `packages/crawler/tests/rate-governor.test.ts`
- Modify: `packages/crawler/src/index.ts` (export the governor)

**Interfaces — Produces:**
- `class RateGovernor` with `acquire(sourceId: string, fallbackRps: number): Promise<void>`, `recordRateLimit(sourceId: string, fallbackRps?: number): void`, `setGlobalRps(rps: number): void`, `isOpen(sourceId: string): boolean`.
- `const rateGovernor: RateGovernor` — process-wide singleton.
- `interface BreakerConfig { threshold: number; windowMs: number; cooldownMs: number }`.

- [ ] **Step 1: Write the failing tests**

Create `packages/crawler/tests/rate-governor.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { RateGovernor } from '../src/rate-governor.js';

describe('RateGovernor', () => {
  it('applies a global rps override (rebuilds the bucket at the new rate)', async () => {
    const g = new RateGovernor();
    // Fallback rps=1, burst=1 → the 2nd acquire would wait ~1s. Override to
    // 100 rps → both acquires resolve immediately from the burst.
    g.setGlobalRps(100);
    const start = Date.now();
    await g.acquire('truyenfull', 1);
    await g.acquire('truyenfull', 1);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('falls back to the per-call rps when no global override is set', async () => {
    vi.useFakeTimers();
    try {
      const g = new RateGovernor(); // no override → fallback 2 rps, burst 2
      await g.acquire('truyenfull', 2); // burst token #1
      await g.acquire('truyenfull', 2); // burst token #2
      const pending = g.acquire('truyenfull', 2); // must wait ~500ms
      let resolved = false;
      pending.then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(400);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      await pending;
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays closed below the breaker threshold', () => {
    const g = new RateGovernor({ threshold: 5, windowMs: 60_000, cooldownMs: 60_000 });
    g.recordRateLimit('truyenfull', 1);
    g.recordRateLimit('truyenfull', 1);
    expect(g.isOpen('truyenfull')).toBe(false);
  });

  it('opens after the threshold and pauses acquire for the cooldown, then half-opens', async () => {
    vi.useFakeTimers();
    try {
      const g = new RateGovernor({ threshold: 3, windowMs: 60_000, cooldownMs: 60_000 });
      g.setGlobalRps(100); // take bucket delay out of the picture
      for (let i = 0; i < 3; i += 1) g.recordRateLimit('truyenfull', 1);
      expect(g.isOpen('truyenfull')).toBe(true);

      const pending = g.acquire('truyenfull', 1);
      let resolved = false;
      pending.then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(59_000);
      expect(resolved).toBe(false); // still paused inside the cooldown
      await vi.advanceTimersByTimeAsync(2_000); // past the 60s cooldown
      await pending;
      expect(resolved).toBe(true);
      expect(g.isOpen('truyenfull')).toBe(false); // half-open cleared the window
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @smanga/crawler test rate-governor`
Expected: FAIL — `Cannot find module '../src/rate-governor.js'` (file not created yet).

- [ ] **Step 3: Implement `RateGovernor`**

Create `packages/crawler/src/rate-governor.ts`:
```ts
import { TokenBucket } from './rate-limit.ts';

export interface BreakerConfig {
  /** Number of rate-limit (429/503) hits within windowMs that opens the breaker. */
  threshold: number;
  windowMs: number;
  cooldownMs: number;
}

const DEFAULT_BREAKER: BreakerConfig = { threshold: 5, windowMs: 60_000, cooldownMs: 60_000 };

interface SourceState {
  bucket: TokenBucket;
  rps: number;
  hits: number[]; // epoch-ms timestamps of recent rate-limit hits (rolling window)
  openUntil: number; // epoch ms the breaker stays open until; 0 = closed
}

/**
 * Per-source rate control: a token bucket plus a circuit-breaker, with a live
 * global rps override the host (api) pushes from app_setting.crawlRps. The CLI
 * leaves the override unset and each call falls back to the static adapter rps.
 *
 * This is the seam for A2 (a dedicated worker container): swap this in-process
 * singleton for a Redis-coordinated impl behind acquire()/recordRateLimit()
 * without touching the engine or processors.
 */
export class RateGovernor {
  private readonly sources = new Map<string, SourceState>();
  private globalRps: number | null = null;

  constructor(private readonly breaker: BreakerConfig = DEFAULT_BREAKER) {}

  /** Host pushes the live rps (e.g. from app_setting.crawlRps). <=0 clears it. */
  setGlobalRps(rps: number): void {
    this.globalRps = rps > 0 ? rps : null;
  }

  private stateFor(sourceId: string, fallbackRps: number): SourceState {
    const rps = this.globalRps ?? fallbackRps;
    const existing = this.sources.get(sourceId);
    if (existing && existing.rps === rps) return existing;
    // rps changed (override edit) or first use → fresh bucket; carry breaker state.
    const fresh: SourceState = {
      bucket: new TokenBucket({ ratePerSecond: rps, burst: Math.max(1, Math.ceil(rps)) }),
      rps,
      hits: existing?.hits ?? [],
      openUntil: existing?.openUntil ?? 0,
    };
    this.sources.set(sourceId, fresh);
    return fresh;
  }

  /** Block until a token is available; if the breaker is open, sleep the cooldown first. */
  async acquire(sourceId: string, fallbackRps: number): Promise<void> {
    const st = this.stateFor(sourceId, fallbackRps);
    const now = Date.now();
    if (st.openUntil > now) {
      await new Promise<void>((resolve) => setTimeout(resolve, st.openUntil - now));
      st.openUntil = 0; // half-open: let the next request probe the source
      st.hits = []; // fresh window after the cooldown
    }
    await st.bucket.acquire();
  }

  /** Record a 429/503 from the source. Opens the breaker once threshold hits land in the window. */
  recordRateLimit(sourceId: string, fallbackRps = 1): void {
    const st = this.stateFor(sourceId, fallbackRps);
    const now = Date.now();
    st.hits = st.hits.filter((t) => now - t < this.breaker.windowMs);
    st.hits.push(now);
    if (st.hits.length >= this.breaker.threshold) {
      st.openUntil = now + this.breaker.cooldownMs;
      st.hits = [];
    }
  }

  isOpen(sourceId: string): boolean {
    const st = this.sources.get(sourceId);
    return !!st && st.openUntil > Date.now();
  }
}

/**
 * Process-wide singleton used by the engine. A2 swaps this for a Redis-backed
 * RateGovernor behind the same surface.
 */
export const rateGovernor = new RateGovernor();
```

- [ ] **Step 4: Export from the crawler package barrel**

In `packages/crawler/src/index.ts`, add after the existing `export * from './engine.ts';` line:
```ts
export * from './rate-governor.ts';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @smanga/crawler test rate-governor`
Expected: PASS (4 tests). Then `pnpm --filter @smanga/crawler typecheck` → clean.

- [ ] **Step 6: Commit**
```powershell
git add packages/crawler/src/rate-governor.ts packages/crawler/tests/rate-governor.test.ts packages/crawler/src/index.ts
git commit -m "feat(crawler): RateGovernor — live rps override + circuit-breaker (A2-ready seam)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Route the engine through the governor + record 429/503

**Files:**
- Modify: `packages/crawler/src/engine.ts` (replace `bucketFor` with `rateGovernor`; record `RateLimitError` in `fetchChapterById`)
- Create: `packages/crawler/tests/engine-governor.test.ts`

**Interfaces — Consumes:** `rateGovernor.acquire(sourceId, fallbackRps)`, `rateGovernor.recordRateLimit(sourceId, fallbackRps)` from Task 1. **Produces:** every source HTTP request is metered through the governor; a `RateLimitError` from a chapter fetch feeds the breaker.

- [ ] **Step 1: Write the failing test**

Create `packages/crawler/tests/engine-governor.test.ts`:
```ts
import { RateLimitError } from '@smanga/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the network layer so no real HTTP happens; force a rate-limit error.
vi.mock('../src/fetcher.ts', () => ({
  fetchHtml: vi.fn().mockRejectedValue(new RateLimitError('rate limited (503) fetching x')),
  fetchBytes: vi.fn(),
}));

import { fetchChapterById, rateGovernor } from '../src/index.js';

function fakeDb() {
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    limit: () =>
      Promise.resolve([
        { id: 'c1', sourceId: 'truyenfull', externalUrl: 'https://truyenfull.today/s/chuong-1/' },
      ]),
  };
  const updateChain = { set: () => updateChain, where: () => Promise.resolve() };
  return { select: () => selectChain, update: () => updateChain } as never;
}

afterEach(() => vi.restoreAllMocks());

describe('fetchChapterById rate-limit recording', () => {
  it('feeds the governor and rethrows when the source returns 429/503', async () => {
    const spy = vi.spyOn(rateGovernor, 'recordRateLimit');
    await expect(fetchChapterById(fakeDb(), 'c1')).rejects.toBeInstanceOf(RateLimitError);
    expect(spy).toHaveBeenCalledWith('truyenfull', 1); // fallback rps = adapter default
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @smanga/crawler test engine-governor`
Expected: FAIL — `recordRateLimit` is not called (engine still uses the old `bucketFor`, no breaker recording).

- [ ] **Step 3: Replace `bucketFor` with the governor in `engine.ts`**

In `packages/crawler/src/engine.ts`:

(a) Extend the shared import to include `RateLimitError`. Change:
```ts
import { type CatalogPage, type StoryMetadata, storyMetadataSchema } from '@smanga/shared';
```
to:
```ts
import { type CatalogPage, RateLimitError, type StoryMetadata, storyMetadataSchema } from '@smanga/shared';
```

(b) Replace the rate-limit import + the `buckets` Map + `bucketFor` (the block currently at lines ~19–30). Remove:
```ts
import { TokenBucket } from './rate-limit.ts';
import { getAdapter, resolveAdapterForUrl } from './registry.ts';

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
with:
```ts
import { rateGovernor } from './rate-governor.ts';
import { getAdapter, resolveAdapterForUrl } from './registry.ts';
```

(c) Replace every rate acquisition. There are six `await bucket.acquire()` call sites across `importStoryMetadata`, `discoverChapters`, `fetchChapterById`, `browseCatalog`, `searchCatalog`. In each function, delete the `const bucket = bucketFor(adapter.id, adapter.rateLimit.rps);` line and change each `await bucket.acquire();` to:
```ts
await rateGovernor.acquire(adapter.id, adapter.rateLimit.rps);
```
(In `importStoryMetadata` there are three acquisitions — the metadata fetch, the cover-heal fetch, and the cover fetch — change all three to the line above. The inline comments on those lines stay.)

(d) In `fetchChapterById`, record the breaker signal. The `catch` block currently reads:
```ts
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    await db
      .update(chapter)
      .set({ status: 'failed', lastError: msg })
      .where(eq(chapter.id, chapterId));
    throw err;
  }
```
Change it to:
```ts
  } catch (err) {
    if (err instanceof RateLimitError) rateGovernor.recordRateLimit(adapter.id, adapter.rateLimit.rps);
    const msg = (err as Error).message ?? String(err);
    await db
      .update(chapter)
      .set({ status: 'failed', lastError: msg })
      .where(eq(chapter.id, chapterId));
    throw err;
  }
```

- [ ] **Step 4: Run the test + the full crawler suite + typecheck**

Run: `pnpm --filter @smanga/crawler test`
Expected: PASS — the new `engine-governor` test passes, and the existing `rate-limit`, `rate-governor`, `registry`, `truyenfull-parsers`, `cover` suites stay green.
Run: `pnpm --filter @smanga/crawler typecheck`
Expected: clean (no remaining `bucketFor`/`TokenBucket` references in `engine.ts`).

- [ ] **Step 5: Commit**
```powershell
git add packages/crawler/src/engine.ts packages/crawler/tests/engine-governor.test.ts
git commit -m "feat(crawler): meter all source fetches via RateGovernor; record 429/503 to breaker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Connection reuse — undici keep-alive `Agent`

**Files:**
- Modify: `packages/crawler/src/fetcher.ts`
- Create: `packages/crawler/tests/fetcher.test.ts`

**Interfaces — Produces:** `getCrawlerDispatcher(): Agent` — a process-wide keep-alive dispatcher reused by `fetchHtml` + `fetchBytes`.

- [ ] **Step 1: Write the failing test**

Create `packages/crawler/tests/fetcher.test.ts`:
```ts
import { Agent } from 'undici';
import { describe, expect, it } from 'vitest';
import { getCrawlerDispatcher } from '../src/fetcher.js';

describe('crawler dispatcher', () => {
  it('returns a single reused undici Agent (keep-alive pool)', () => {
    const a = getCrawlerDispatcher();
    const b = getCrawlerDispatcher();
    expect(a).toBe(b); // same instance → connections are pooled, not per-request
    expect(a).toBeInstanceOf(Agent);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @smanga/crawler test fetcher`
Expected: FAIL — `getCrawlerDispatcher` is not exported.

- [ ] **Step 3: Add the keep-alive Agent in `fetcher.ts`**

In `packages/crawler/src/fetcher.ts`, change the undici import and add the dispatcher near the top (after the imports). Change:
```ts
import { request } from 'undici';
```
to:
```ts
import { Agent, request } from 'undici';

// Per-origin keep-alive pool: reuse TCP/TLS across requests so higher crawl
// concurrency doesn't pay a handshake per chapter. `connections` bounds the
// per-origin socket count — keep it >= CRAWLER_FETCH_CONCURRENCY.
const crawlerDispatcher = new Agent({
  connections: 16,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

export function getCrawlerDispatcher(): Agent {
  return crawlerDispatcher;
}
```
Then thread the dispatcher into both `request(...)` calls. In `fetchHtml`, change:
```ts
    res = await request(url, {
      method: 'GET',
      headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml' },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
```
to (add the `dispatcher` line):
```ts
    res = await request(url, {
      dispatcher: crawlerDispatcher,
      method: 'GET',
      headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml' },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
```
In `fetchBytes`, change:
```ts
    res = await request(url, {
      method: 'GET',
      headers: { 'user-agent': ua },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
```
to:
```ts
    res = await request(url, {
      dispatcher: crawlerDispatcher,
      method: 'GET',
      headers: { 'user-agent': ua },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
```

- [ ] **Step 4: Run the test + typecheck**

Run: `pnpm --filter @smanga/crawler test fetcher`
Expected: PASS.
Run: `pnpm --filter @smanga/crawler typecheck`
Expected: clean.

- [ ] **Step 5: Commit**
```powershell
git add packages/crawler/src/fetcher.ts packages/crawler/tests/fetcher.test.ts
git commit -m "perf(crawler): reuse a keep-alive undici Agent for all source fetches

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `app_setting.crawlRps` column + migration

**Files:**
- Modify: `packages/db/src/schema/app-setting.ts`
- Create: `packages/db/src/migrations/00NN_*.sql` (generated by drizzle-kit)
- Modify: `packages/db/src/migrations/meta/_journal.json` + `meta/00NN_snapshot.json` (generated)

**Interfaces — Produces:** `appSetting.crawlRps` (float8, NOT NULL, default 4); `AppSetting.crawlRps: number`.

- [ ] **Step 1: Add the column to the schema**

In `packages/db/src/schema/app-setting.ts`, add `doublePrecision` to the import:
```ts
import { boolean, doublePrecision, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
```
Then add the column immediately after the `autoCrawlWatermark` line:
```ts
  /** Live crawl rate (requests/sec) to the source — tunable at /admin/settings
   *  without a redeploy. Default 4 (probe-verified safe on truyenfull). Clamped
   *  [0.1, 20] in the DTO/service. float8 so sub-1 rps stays expressible. */
  crawlRps: doublePrecision('crawl_rps').notNull().default(4),
```

- [ ] **Step 2: Generate the migration**
```powershell
pnpm --filter @smanga/db generate
```
Expected: drizzle-kit writes a new `packages/db/src/migrations/00NN_<name>.sql` (next number after `0017`) and updates `meta/_journal.json`. Open the generated `.sql` and confirm it is exactly:
```sql
ALTER TABLE "app_setting" ADD COLUMN "crawl_rps" double precision DEFAULT 4 NOT NULL;
```
(If drizzle emits anything else — e.g. touching other tables — STOP: the schema diff picked up drift; do not commit. Re-check the schema edit.)

- [ ] **Step 3: Verify migrations apply cleanly on PG17**
```powershell
pnpm --filter @smanga/db test
```
Expected: the db suite passes — the testcontainer applies ALL migrations (0000–00NN) from scratch on `postgres:17-alpine`, including the new column.

- [ ] **Step 4: Commit**
```powershell
git add packages/db/src/schema/app-setting.ts packages/db/src/migrations
git commit -m "feat(db): app_setting.crawl_rps column (live crawl-rate knob, default 4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: API — expose + persist `crawlRps` and push it to the governor

**Files:**
- Modify: `apps/api/src/modules/app-settings/dto/update-auto-crawl.dto.ts`
- Modify: `apps/api/src/modules/app-settings/app-settings.service.ts`
- Modify: `apps/api/src/modules/app-settings/auto-crawl.controller.ts`
- Create: `apps/api/src/modules/app-settings/app-settings.crawl-rps.spec.ts`
- Create: `apps/api/src/modules/app-settings/auto-crawl.controller.e2e-spec.ts`

**Interfaces — Consumes:** `rateGovernor.setGlobalRps(rps)` from Task 1; `appSetting.crawlRps` from Task 4. **Produces:** `GET /admin/settings/auto-crawl` returns `{ autoCrawlEnabled, autoCrawlWatermark, crawlRps }`; `PATCH` accepts `{ enabled, watermark, crawlRps }`, clamps, persists, and pushes the live rps to the governor; boot reads `crawlRps` into the governor.

- [ ] **Step 1: Write the failing service test**

Create `apps/api/src/modules/app-settings/app-settings.crawl-rps.spec.ts`:
```ts
import { rateGovernor } from '@smanga/crawler';
import { describe, expect, it, vi } from 'vitest';
import { AppSettingsService } from './app-settings.service';

function dbReturning(row: unknown) {
  const chain = {
    set: () => chain,
    where: () => chain,
    returning: () => Promise.resolve([row]),
  };
  return { update: () => chain } as never;
}

describe('AppSettingsService.setAutoCrawl crawlRps', () => {
  it('clamps crawlRps to [0.1, 20] and pushes the persisted value to the governor', async () => {
    const persisted = { autoCrawlEnabled: true, autoCrawlWatermark: 500, crawlRps: 20 };
    const svc = new AppSettingsService(dbReturning(persisted), {} as never);
    const spy = vi.spyOn(rateGovernor, 'setGlobalRps');

    const res = await svc.setAutoCrawl(true, 500, 999); // 999 → clamps to 20
    expect(res.crawlRps).toBe(20);
    expect(spy).toHaveBeenCalledWith(20);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @smanga/api test app-settings.crawl-rps`
Expected: FAIL — `setAutoCrawl` currently takes `(enabled, watermark)` and returns no `crawlRps`; `rateGovernor.setGlobalRps` is never called.

- [ ] **Step 3: Extend the DTO**

In `apps/api/src/modules/app-settings/dto/update-auto-crawl.dto.ts`, add `IsNumber` to the import and a `crawlRps` field:
```ts
import { IsBoolean, IsInt, IsNumber, Max, Min } from 'class-validator';

export class UpdateAutoCrawlDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(50)
  @Max(2000)
  watermark!: number;

  @IsNumber()
  @Min(0.1)
  @Max(20)
  crawlRps!: number;
}
```

- [ ] **Step 4: Update the service**

In `apps/api/src/modules/app-settings/app-settings.service.ts`:

(a) Add the governor import next to the other `@smanga/*` imports:
```ts
import { rateGovernor } from '@smanga/crawler';
```

(b) Replace `getAutoCrawl` so it returns `crawlRps` too:
```ts
  async getAutoCrawl(): Promise<{
    autoCrawlEnabled: boolean;
    autoCrawlWatermark: number;
    crawlRps: number;
  }> {
    const s = await this.getOrSeed();
    return {
      autoCrawlEnabled: s.autoCrawlEnabled,
      autoCrawlWatermark: s.autoCrawlWatermark,
      crawlRps: s.crawlRps,
    };
  }
```

(c) Replace `setAutoCrawl` to accept + clamp + persist `crawlRps` and push it to the governor:
```ts
  async setAutoCrawl(
    enabled: boolean,
    watermark: number,
    crawlRps: number,
  ): Promise<{ autoCrawlEnabled: boolean; autoCrawlWatermark: number; crawlRps: number }> {
    // Clamp defensively even though the DTO validates — these are load-bearing
    // safety knobs; never let them be 0 or absurdly large.
    const clampedWatermark = Math.min(2000, Math.max(50, Math.floor(watermark)));
    const clampedRps = Math.min(20, Math.max(0.1, crawlRps));
    const [updated] = await this.db
      .update(appSetting)
      .set({
        autoCrawlEnabled: enabled,
        autoCrawlWatermark: clampedWatermark,
        crawlRps: clampedRps,
        updatedAt: new Date(),
      })
      .where(eq(appSetting.id, 1))
      .returning();
    if (!updated) throw new BadRequestException('app_setting row missing — re-run migrations');
    // Push the live rate to the in-process governor so the engine picks it up
    // immediately (no redeploy, no polling).
    rateGovernor.setGlobalRps(updated.crawlRps);
    return {
      autoCrawlEnabled: updated.autoCrawlEnabled,
      autoCrawlWatermark: updated.autoCrawlWatermark,
      crawlRps: updated.crawlRps,
    };
  }
```

(d) Push the persisted rps into the governor at boot. In `onModuleInit`, after the existing `syncRepeatable(...)` call, add:
```ts
    // Seed the crawl-rate governor from persisted config so the very first
    // crawl after a (re)boot already runs at the operator's chosen rps.
    rateGovernor.setGlobalRps(setting.crawlRps);
```

- [ ] **Step 5: Update the controller**

In `apps/api/src/modules/app-settings/auto-crawl.controller.ts`, change the `update` handler to forward `crawlRps`:
```ts
  @Patch()
  update(@Body() dto: UpdateAutoCrawlDto) {
    return this.settings.setAutoCrawl(dto.enabled, dto.watermark, dto.crawlRps);
  }
```

- [ ] **Step 6: Run the service test**

Run: `pnpm --filter @smanga/api test app-settings.crawl-rps`
Expected: PASS.

- [ ] **Step 7: Write + run the controller-e2e (through the global ValidationPipe)**

This guards the reports-400-class bug: the global pipe (`whitelist + transform + forbidNonWhitelisted`) rejects unknown fields and bad types. Create `apps/api/src/modules/app-settings/auto-crawl.controller.e2e-spec.ts`:
```ts
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { AppSettingsService } from './app-settings.service';
import { AutoCrawlController } from './auto-crawl.controller';

describe('AutoCrawlController (e2e, global pipe)', () => {
  let app: INestApplication;
  const service = {
    getAutoCrawl: vi.fn().mockResolvedValue({
      autoCrawlEnabled: true,
      autoCrawlWatermark: 500,
      crawlRps: 4,
    }),
    setAutoCrawl: vi.fn((enabled: boolean, watermark: number, crawlRps: number) =>
      Promise.resolve({ autoCrawlEnabled: enabled, autoCrawlWatermark: watermark, crawlRps }),
    ),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AutoCrawlController],
      providers: [{ provide: AppSettingsService, useValue: service }],
    })
      // Bypass auth for the test — we are exercising the validation pipe, not the guards.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    // Mirror main.ts exactly so the test catches what prod would reject.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a valid patch with crawlRps', async () => {
    await request(app.getHttpServer())
      .patch('/admin/settings/auto-crawl')
      .send({ enabled: true, watermark: 800, crawlRps: 6 })
      .expect(200);
    expect(service.setAutoCrawl).toHaveBeenCalledWith(true, 800, 6);
  });

  it('rejects crawlRps above the max (400)', async () => {
    await request(app.getHttpServer())
      .patch('/admin/settings/auto-crawl')
      .send({ enabled: true, watermark: 800, crawlRps: 50 })
      .expect(400);
  });

  it('rejects an unknown field (400, forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer())
      .patch('/admin/settings/auto-crawl')
      .send({ enabled: true, watermark: 800, crawlRps: 6, bogus: 1 })
      .expect(400);
  });
});
```
Note: confirm the import path of `RolesGuard` (`@/common/guards/roles.guard`). If the project applies roles via an `APP_GUARD` provider rather than a named `RolesGuard` class on the controller, drop the `.overrideGuard(RolesGuard)` line — only `JwtAuthGuard` is declared on `AutoCrawlController` via `@UseGuards(JwtAuthGuard)`, so overriding that one is sufficient; the `@Roles` decorator is inert without its guard registered in this minimal module.

Run: `pnpm --filter @smanga/api test auto-crawl.controller.e2e`
Expected: PASS (3 cases). If the `RolesGuard` import fails to resolve, remove that `.overrideGuard` line per the note and re-run.

- [ ] **Step 8: Typecheck + commit**

Run: `pnpm --filter @smanga/api typecheck`
Expected: clean.
```powershell
git add apps/api/src/modules/app-settings/dto/update-auto-crawl.dto.ts apps/api/src/modules/app-settings/app-settings.service.ts apps/api/src/modules/app-settings/auto-crawl.controller.ts apps/api/src/modules/app-settings/app-settings.crawl-rps.spec.ts apps/api/src/modules/app-settings/auto-crawl.controller.e2e-spec.ts
git commit -m "feat(api): live crawlRps knob on /admin/settings/auto-crawl → RateGovernor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Worker concurrency from env

**Files:**
- Modify: `apps/api/src/modules/crawler-jobs/fetch-chapter.processor.ts`
- Modify: `apps/api/src/config/env.ts`
- Create: `apps/api/src/modules/crawler-jobs/fetch-chapter.concurrency.spec.ts`

**Interfaces — Produces:** `resolveFetchConcurrency(raw: string | undefined): number` (clamped [1,32], default 6); the `fetch-chapter` processor registers with that concurrency.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/crawler-jobs/fetch-chapter.concurrency.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolveFetchConcurrency } from './fetch-chapter.processor';

describe('resolveFetchConcurrency', () => {
  it('defaults to 6 when unset or unparseable', () => {
    expect(resolveFetchConcurrency(undefined)).toBe(6);
    expect(resolveFetchConcurrency('abc')).toBe(6);
    expect(resolveFetchConcurrency('')).toBe(6);
  });
  it('uses the env value within bounds', () => {
    expect(resolveFetchConcurrency('10')).toBe(10);
    expect(resolveFetchConcurrency('1')).toBe(1);
  });
  it('clamps to [1, 32]', () => {
    expect(resolveFetchConcurrency('0')).toBe(1);
    expect(resolveFetchConcurrency('-5')).toBe(1);
    expect(resolveFetchConcurrency('999')).toBe(32);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @smanga/api test fetch-chapter.concurrency`
Expected: FAIL — `resolveFetchConcurrency` is not exported.

- [ ] **Step 3: Implement in the processor**

In `apps/api/src/modules/crawler-jobs/fetch-chapter.processor.ts`, add the resolver above the class and apply it to the `@Process` decorator. The decorator is evaluated at import time, so the concurrency is read from `process.env` directly here (it cannot use NestJS config which initializes later). Change the file to:
```ts
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  type FetchChapterJobData,
  JOB_FETCH_CHAPTER,
  QUEUE_CRAWLER,
} from '@/modules/queue/queue.constants';
import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { fetchChapterById } from '@smanga/crawler';
import type { Database } from '@smanga/db';
import type { Job } from 'bull';

/**
 * Number of fetch-chapter jobs processed in parallel. Read from the env at
 * import time because Bull fixes a processor's concurrency at registration
 * (the @Process decorator runs before NestJS config is available). Restart to
 * change it — the live throughput knob is app_setting.crawlRps, not this.
 */
export function resolveFetchConcurrency(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 6;
  return Math.min(32, Math.max(1, Math.floor(n)));
}

const FETCH_CONCURRENCY = resolveFetchConcurrency(process.env.CRAWLER_FETCH_CONCURRENCY);

@Processor(QUEUE_CRAWLER)
export class FetchChapterProcessor {
  private readonly logger = new Logger(FetchChapterProcessor.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Process({ name: JOB_FETCH_CHAPTER, concurrency: FETCH_CONCURRENCY })
  async handle(job: Job<FetchChapterJobData>): Promise<void> {
    this.logger.log(`fetch-chapter start ${job.id} chapterId=${job.data.chapterId}`);
    await fetchChapterById(this.db, job.data.chapterId);
    this.logger.log(`fetch-chapter done ${job.id}`);
  }
}
```

- [ ] **Step 4: Document the env var**

In `apps/api/src/config/env.ts`, add to the zod schema (after `DB_POOL_MAX`):
```ts
  CRAWLER_FETCH_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(6),
```
(This validates + documents it at boot. The processor still reads `process.env` directly due to decorator timing; the default matches `resolveFetchConcurrency`.)

- [ ] **Step 5: Run the test + typecheck**

Run: `pnpm --filter @smanga/api test fetch-chapter.concurrency`
Expected: PASS.
Run: `pnpm --filter @smanga/api typecheck`
Expected: clean.

- [ ] **Step 6: Commit**
```powershell
git add apps/api/src/modules/crawler-jobs/fetch-chapter.processor.ts apps/api/src/config/env.ts apps/api/src/modules/crawler-jobs/fetch-chapter.concurrency.spec.ts
git commit -m "feat(api): fetch-chapter worker concurrency from CRAWLER_FETCH_CONCURRENCY (default 6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Frontend — rps field on the Auto-Crawl settings card

**Files:**
- Modify: `apps/frontend/src/api/settings.ts`
- Modify: `apps/frontend/src/routes/admin/settings.tsx`

**Interfaces — Consumes:** the `GET`/`PATCH /admin/settings/auto-crawl` contract from Task 5 (`crawlRps` in both). **Produces:** an operator number input for crawl rate.

- [ ] **Step 1: Extend the API client types**

In `apps/frontend/src/api/settings.ts`, add `crawlRps` to both the setting and the patch:
```ts
export interface AutoCrawlSetting {
  autoCrawlEnabled: boolean;
  autoCrawlWatermark: number;
  crawlRps: number;
}

export interface UpdateAutoCrawlPatch {
  enabled?: boolean;
  watermark?: number;
  crawlRps?: number;
}
```

- [ ] **Step 2: Add the rps control to `AutoCrawlCard`**

In `apps/frontend/src/routes/admin/settings.tsx`, inside `AutoCrawlCard`:

(a) Add state next to `watermark`:
```tsx
  const [crawlRps, setCrawlRps] = useState(setting.crawlRps);
```
(b) Reset it in the `useEffect` (extend the body + the deps array):
```tsx
  useEffect(() => {
    setEnabled(setting.autoCrawlEnabled);
    setWatermark(setting.autoCrawlWatermark);
    setCrawlRps(setting.crawlRps);
  }, [setting.autoCrawlEnabled, setting.autoCrawlWatermark, setting.crawlRps]);
```
(c) Send it in the mutation:
```tsx
  const saveM = useMutation({
    mutationFn: () => updateAutoCrawl({ enabled, watermark, crawlRps }),
    onSuccess: () => {
      setOkFlash(true);
      setTimeout(() => setOkFlash(false), 2500);
      onUpdated();
    },
  });
```
(d) Extend the dirty check:
```tsx
  const dirty =
    enabled !== setting.autoCrawlEnabled ||
    watermark !== setting.autoCrawlWatermark ||
    crawlRps !== setting.crawlRps;
```
(e) Add the input markup. Immediately after the watermark `</label>` block (before `{errorText && ...}`), insert:
```tsx
        <label className="space-y-1.5 block max-w-xs">
          <span className="text-[11px] font-medium text-fg/80 uppercase tracking-[0.18em]">
            Tốc độ crawl (request/giây)
          </span>
          <input
            type="number"
            min={0.1}
            max={20}
            step={0.5}
            value={crawlRps}
            onChange={(e) => setCrawlRps(Number(e.target.value))}
            className="w-full h-10 px-3 rounded-md border border-border bg-bg text-sm tabular-nums focus:outline-none focus:border-fg/40 focus:ring-2 focus:ring-accent/20 transition-all duration-200"
          />
          <span className="block text-xs text-fg-muted">
            Cao hơn = nhanh hơn nhưng rủi ro bị nguồn chặn. Mặc định 4 (giới hạn 0.1–20). Tăng dần
            và theo dõi tỷ lệ lỗi ở /admin/jobs.
          </span>
        </label>
```
(f) Update the card's description line so it no longer hard-codes "1 chương/giây". Change the `<p>` under the heading (`Tự động crawl dần các chương "Cần crawl" ...`) to:
```tsx
            Tự động crawl dần các chương "Cần crawl" (mới nhất trước) ở tốc độ cấu hình bên dưới, ưu
            tiên thấp nhất nên không ảnh hưởng thao tác tay hay người đọc. Hết backlog thì tự dừng.
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: clean (the route-tree generates, then `tsc --noEmit` passes with the new `crawlRps` on `AutoCrawlSetting`).
Run: `pnpm --filter @smanga/frontend build`
Expected: build succeeds.

- [ ] **Step 4: Lint the changed files (CRLF-safe per-file biome)**

Run: `pnpm exec biome check --write apps/frontend/src/api/settings.ts apps/frontend/src/routes/admin/settings.tsx`
Expected: no errors (auto-formats if needed).

- [ ] **Step 5: Commit**
```powershell
git add apps/frontend/src/api/settings.ts apps/frontend/src/routes/admin/settings.tsx
git commit -m "feat(frontend): crawl-rate (rps) control on the auto-crawl settings card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Full-suite gate + operator notes (no new code)

**Files:** none (verification + documentation only).

- [ ] **Step 1: Run the whole monorepo suite + typecheck + lint**
```powershell
$env:DATABASE_URL="postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm test
pnpm -r typecheck
```
Expected: all suites green (the existing ~190 tests plus the new `rate-governor`, `engine-governor`, `fetcher`, `app-settings.crawl-rps`, `auto-crawl.controller.e2e`, `fetch-chapter.concurrency` cases); typecheck clean across all packages.

- [ ] **Step 2: Record the operator follow-ups (NOT committed code — for the handoff/PR description)**

These are host actions on the laptop, applied out-of-band (like the PG re-init and Phase-4 tuning):
1. **Optional concurrency bump:** to raise parallelism beyond the default 6, set `CRAWLER_FETCH_CONCURRENCY` in the prod compose `api` service env and restart. Keep it ≤ the fetcher Agent's `connections` (16) and ensure `DB_POOL_MAX` ≥ concurrency + web headroom (ties into the pending Phase-4 `DB_POOL_MAX=25`).
2. **Ramp rps live:** after deploy, open `/admin/settings`, raise *Tốc độ crawl* from 4 in steps (e.g. 4 → 6 → 8), watching `/admin/jobs` throughput rise while the failed count stays flat. Back off if 429/503 climb (the breaker will also auto-pause).
3. **Watermark:** if rps is pushed past ~8, raise *Watermark* so the queue doesn't idle between the feeder's `*/1` ticks.
4. **Disk:** draining ~2.9M chapters adds ~38 GB to `/mnt/hdd` — already accepted.

- [ ] **Step 3: Update the knowledge graph (code changed)**
```powershell
graphify update .
```

- [ ] **Step 4: On-push verification (gated on explicit user instruction — do NOT push otherwise)**

After the user authorizes the push: push `main`, watch CI (`gh run list --branch main --limit 3`, then `gh run watch <id> --exit-status`) — confirm `test` passes then `image-api`/`image-frontend` build (the gate from the pipeline-hardening work), and that Watchtower deploys. Then log into prod (`/admin/settings`), confirm the new *Tốc độ crawl* field shows 4, bump it, and confirm `/api/v1/jobs/stats` `completed`/min rises with `failed` flat.

---

## Self-Review

**Spec coverage:**
- AC1 (live `crawlRps`, default 4, no-redeploy, picked up immediately) → Task 4 (column) + Task 5 (DTO/service/controller + boot seed + governor push) ✓. Refinement vs spec's "5s TTL cache": replaced with **push-on-change + read-on-boot** — instant, no polling, functionally stronger; single-process (A1) correct. Noted here intentionally, not a gap.
- AC2 (concurrency from `CRAWLER_FETCH_CONCURRENCY`, default 6; raising rps+concurrency lifts throughput) → Task 6 + Task 8 Step 2/4 ✓.
- AC3 (single `RateGovernor` seam; swappable for Redis without engine/processor change) → Task 1 + Task 2 ✓.
- AC4 (per-host keep-alive pool; behavior/headers/timeouts/error-map unchanged) → Task 3 ✓ (only adds `dispatcher`).
- AC5 (429/503 burst opens breaker: global pause + cooldown + half-open; per-job retry/dead-letter unchanged) → Task 1 (breaker) + Task 2 (recording) ✓.
- AC6 (no change to parsing/feeder ordering/prioritization/cap/dead-letter/reconciler) → respected; only rate-path files touched ✓.

**Placeholder scan:** none — full code for every step, exact paths, exact commands + expected output. The one conditional (`RolesGuard` override in Task 5 Step 7) carries an explicit fallback instruction, not a TODO. The migration filename is `00NN` because drizzle-kit auto-numbers/names it — the exact SQL to verify is given.

**Type/consistency:** `rateGovernor` surface (`acquire(sourceId, fallbackRps)`, `recordRateLimit(sourceId, fallbackRps)`, `setGlobalRps(rps)`, `isOpen`) is identical across Tasks 1, 2, 5. `crawlRps: number` is consistent across the schema (Task 4), service return + DTO (Task 5), and frontend `AutoCrawlSetting`/`UpdateAutoCrawlPatch` (Task 7). `setAutoCrawl(enabled, watermark, crawlRps)` arity matches between service (Task 5 Step 4), controller (Task 5 Step 5), service test (Task 5 Step 1), and e2e (Task 5 Step 7). `resolveFetchConcurrency` signature matches between processor (Task 6 Step 3) and its test (Task 6 Step 1). `getCrawlerDispatcher` matches between fetcher (Task 3 Step 3) and its test (Task 3 Step 1).
