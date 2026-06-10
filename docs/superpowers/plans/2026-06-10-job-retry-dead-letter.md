# Job Retry & Dead-Letter Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically recover *transient* crawler-job failures within tight, incident-proof caps, while durably recording *permanent* failures in Postgres and surfacing both in a `/admin/jobs` "Needs Attention / Dead Letter" panel.

**Architecture:** A Postgres `job_failure` table is the retry "brain" (not Redis). A Bull `@OnQueueFailed` listener classifies each *terminal* failure (transient vs permanent) and upserts a row keyed by a natural `dedupKey`. A Bull-repeatable reconciler fires every 5 minutes, re-enqueues due transient rows into the existing crawler queue under hard caps (200/run, capacity gate, `auto_retry_enabled` kill switch, give-up at generation 5), and `@OnQueueCompleted` resolves rows when work finally succeeds.

**Tech Stack:** NestJS 11, `@nestjs/bull` 11 + Bull 4 (Redis), Drizzle ORM + Postgres, `@smanga/shared` (Zod + error classes), Vitest, Vite + React 19 + TanStack Query/Router (frontend).

**Spec:** `docs/superpowers/specs/2026-06-10-job-retry-dead-letter-design.md` — read it in full before starting.

---

## Running tests (authoritative — overrides any inline command below)

This monorepo uses **per-package vitest configs**, not a single root runner. The root `vitest.config.ts` has NO path aliases and runs node env, so `pnpm exec vitest run <path>` from the repo root **cannot** run `apps/api` specs (they import via `@/` — collection fails) or `apps/frontend` specs (they need jsdom). Wherever a step below says `pnpm exec vitest run <repo-relative-path>`, translate it to the matching per-package command:

| Package | Run one spec |
|---|---|
| `@smanga/shared` | `pnpm --filter @smanga/shared exec vitest run tests/<file>` |
| `@smanga/db` | `pnpm --filter @smanga/db exec vitest run tests/<file>` |
| `@smanga/crawler` | `pnpm --filter @smanga/crawler exec vitest run` |
| `@smanga/api` | `pnpm --filter @smanga/api exec vitest run src/modules/<...>/<file>` (api config supplies `@/` + `@smanga/*` aliases + SWC decorators; collection ~20s) |
| all packages | `pnpm test` (= `pnpm -r --workspace-concurrency=1 test`) — canonical full suite |

Typecheck: `pnpm --filter @smanga/<pkg> typecheck`. Generate migration: `pnpm --filter @smanga/db generate`. Apply locally: `pnpm db:migrate` (needs `DATABASE_URL` + running Postgres).

**Pre-commit hook:** `lefthook` runs `biome check` + `tsc` on staged files. Before each `git commit`, run `pnpm exec biome check --write <changed files>` and re-stage so lint/format doesn't fail the commit. Never bypass with `--no-verify`.

---

## Design refinements (read first — these resolve ambiguities in the spec)

The spec is the source of truth, but three details were under-specified. This plan resolves them; the code and tests below assume these resolutions.

1. **The `failed` event fires on EVERY attempt, not just the terminal one.** Verified in Bull 4.16.5: `Job.moveToFailed` (job.js:298) re-queues to delayed/retry whenever `attemptsMade < attempts`, and `handleFailed` (queue.js:1197) emits `'failed'` after *every* `moveToFailed`. Therefore `@OnQueueFailed(job, err)` must **return early unless `job.attemptsMade >= (job.opts.attempts ?? 1)`** — otherwise a job with one retry left would be dead-lettered prematurely. This guard is load-bearing and has a dedicated test (Task 5).

2. **The reconciler picks rows by `status = 'pending'`, NOT by `classification`.** The listener routes *permanent* failures to `needs_attention` (never `pending`), so in the automatic flow every `pending` row is already transient — the `classification` filter the spec mentions in §10 is redundant with `status`. Keying the picker off `status='pending' AND next_retry_at <= now` is also what makes the operator "Retry now" action work on a *permanent* (`needs_attention`) or `dead` row: it simply flips the row to `pending` with `next_retry_at = now`. The reconciler index is therefore `(status, next_retry_at)`.

3. **Only three job types are dead-lettered:** `fetch-chapter`, `discover-chapters`, `import-story`. `discover-all-source` (re-running it fans out into thousands of imports — a flood vector), `refresh-all-stories` (a cron orchestrator that re-runs on its own schedule), and `retry-reconciler` itself (self-retry loop) all return `null` from `dedupKeyForJob` and are skipped. This keeps the system bounded by construction.

4. **`retryGeneration` semantics:** it counts how many times the *reconciler* has re-enqueued the work. A fresh terminal failure starts at `0`. The reconciler increments it on each re-enqueue. The backoff for the *next* attempt is `backoffForGeneration(retryGeneration + 1)`, so a fresh failure (`gen 0`) is scheduled `now + backoffForGeneration(1) = now + 10m`. Give-up: when a row at `retryGeneration >= MAX_RETRY_GENERATIONS (5)` fails again, the listener sets it `dead`.

---

## File structure

**`packages/shared`** (pure, no NestJS/DB deps)
- `src/errors.ts` — MODIFY: give `FetchError` a `statusCode?: number`.
- `src/retry-policy.ts` — NEW: `classifyCrawlerError`, `backoffForGeneration`, `RETRY_BACKOFF_MINUTES`, `MAX_RETRY_GENERATIONS`, `FailureClass`.
- `src/index.ts` — MODIFY: re-export `retry-policy.ts`.
- `tests/errors.test.ts`, `tests/retry-policy.test.ts` — NEW.

**`packages/crawler`**
- `src/fetcher.ts` — MODIFY: populate `FetchError.statusCode` from `res.statusCode` at all four throw sites.

**`packages/db`**
- `src/schema/job-failure.ts` — NEW: two pgEnums + `job_failure` table.
- `src/schema/app-setting.ts` — MODIFY: add `autoRetryEnabled` column.
- `src/schema/index.ts` — MODIFY: export the new schema file (`.js`).
- `drizzle.config.ts` — MODIFY: append the new file to the `schema:` array (`.ts`).
- `src/migrations/0012_*.sql` + journal — NEW (generated by drizzle-kit).
- `tests/job-failure-schema.test.ts` — NEW: assert columns + enum values.

**`apps/api`**
- `src/modules/queue/queue.constants.ts` — MODIFY: add `JOB_RETRY_RECONCILER` + `JOB_PRIORITY.RETRY_RECONCILER`.
- `src/modules/jobs/dead-letter.util.ts` — NEW: `dedupKeyForJob`, `priorityForJob`.
- `src/modules/jobs/dead-letter.util.spec.ts` — NEW.
- `src/modules/jobs/job-failure.listener.ts` — NEW: `@OnQueueFailed` upsert + `@OnQueueCompleted` resolve.
- `src/modules/jobs/job-failure.listener.spec.ts` — NEW.
- `src/modules/jobs/retry-reconciler.service.ts` — NEW: Bull-repeatable bounded re-enqueue.
- `src/modules/jobs/retry-reconciler.service.spec.ts` — NEW.
- `src/modules/jobs/jobs.service.ts` — MODIFY: dead-letter list / retry-now / dismiss / retry-all.
- `src/modules/jobs/jobs.controller.ts` — MODIFY: dead-letter endpoints.
- `src/modules/jobs/jobs.module.ts` — MODIFY: register listener + reconciler providers.
- `src/modules/app-settings/app-settings.service.ts` — MODIFY: `getAutoRetry` / `setAutoRetry`.
- `src/modules/app-settings/dto/update-auto-retry.dto.ts` — NEW.
- `src/modules/app-settings/auto-retry.controller.ts` — NEW.
- `src/modules/app-settings/app-settings.module.ts` — MODIFY: register the new controller.

**`apps/frontend`**
- `src/api/jobs.ts` — MODIFY: dead-letter + auto-retry API calls + types.
- `src/components/admin/DeadLetterPanel.tsx` — NEW.
- `src/routes/admin/jobs.tsx` — MODIFY: render the panel.
- `design-system/smanga/pages/admin-jobs.md` — NEW (generated).

---

## Task 1: `FetchError.statusCode` (shared errors)

The classifier must tell a 404 (permanent) from a 503 (transient). Today the status lives only in the message string. Add a typed field. `FetchError` is the only error class whose constructor changes, and the only call sites are in `packages/crawler/src/fetcher.ts` (verified by grep — other matches are in plan docs, not code).

**Files:**
- Modify: `packages/shared/src/errors.ts`
- Test: `packages/shared/tests/errors.test.ts` (Create)

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/errors.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { CrawlerError, FetchError } from '../src/errors.js';

describe('FetchError', () => {
  it('carries an optional statusCode', () => {
    const err = new FetchError('http 404 fetching x', { statusCode: 404 });
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('http 404 fetching x');
    expect(err.name).toBe('FetchError');
    expect(err).toBeInstanceOf(CrawlerError);
  });

  it('preserves cause and leaves statusCode undefined for network errors', () => {
    const cause = new Error('ECONNRESET');
    const err = new FetchError('network error fetching x', { cause });
    expect(err.statusCode).toBeUndefined();
    expect(err.cause).toBe(cause);
  });

  it('works with no options', () => {
    const err = new FetchError('boom');
    expect(err.statusCode).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

From repo root:
Run: `pnpm exec vitest run packages/shared/tests/errors.test.ts`
Expected: FAIL — current `FetchError` is `extends CrawlerError {}` with no `statusCode` and a `(message, cause?)` positional signature, so `new FetchError('x', { statusCode: 404 }).statusCode` is `undefined` and the second arg is mis-read as `cause`.

- [ ] **Step 3: Write minimal implementation**

Edit `packages/shared/src/errors.ts`. Replace the line `export class FetchError extends CrawlerError {}` with:

```typescript
export class FetchError extends CrawlerError {
  /** HTTP status when the failure was an HTTP response (>= 400). Undefined
   * for network errors / timeouts — the classifier treats undefined as
   * transient. */
  readonly statusCode?: number;
  constructor(message: string, opts?: { cause?: unknown; statusCode?: number }) {
    super(message, opts?.cause);
    this.statusCode = opts?.statusCode;
  }
}
```

Leave `CrawlerError`, `RateLimitError`, `ParserError`, and `AdapterNotFoundError` unchanged. The full file becomes:

```typescript
export class CrawlerError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause;
  }
}

export class FetchError extends CrawlerError {
  readonly statusCode?: number;
  constructor(message: string, opts?: { cause?: unknown; statusCode?: number }) {
    super(message, opts?.cause);
    this.statusCode = opts?.statusCode;
  }
}
export class RateLimitError extends CrawlerError {}
export class ParserError extends CrawlerError {}
export class AdapterNotFoundError extends CrawlerError {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/shared/tests/errors.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/errors.ts packages/shared/tests/errors.test.ts
git commit -m "feat(shared): add statusCode field to FetchError"
```

---

## Task 2: Populate `FetchError.statusCode` in the fetcher

`packages/crawler/src/fetcher.ts` throws `FetchError` at four sites (lines 31, 38, 58, 61) and `RateLimitError` at one (line 35, unchanged). Two of the `FetchError` sites are HTTP-status failures (must set `statusCode`); two are network failures (must pass `cause` via the new options object). This is a mechanical signature migration — there is no unit test for the fetcher (it needs live HTTP), so verification is via typecheck + the existing crawler test suite.

**Files:**
- Modify: `packages/crawler/src/fetcher.ts:31,38,58,61`

- [ ] **Step 1: Update the `fetchHtml` throw sites**

In `packages/crawler/src/fetcher.ts`, change the network-error throw (currently `throw new FetchError(\`network error fetching ${url}\`, err);`) inside `fetchHtml` to:

```typescript
    throw new FetchError(`network error fetching ${url}`, { cause: err });
```

And change the HTTP-error throw (currently `throw new FetchError(\`http ${res.statusCode} fetching ${url}\`);`) inside `fetchHtml` to:

```typescript
  if (res.statusCode >= 400) {
    throw new FetchError(`http ${res.statusCode} fetching ${url}`, { statusCode: res.statusCode });
  }
```

Leave the `RateLimitError` throw (line 35) exactly as-is.

- [ ] **Step 2: Update the `fetchBytes` throw sites**

In the same file, inside `fetchBytes`, change the network-error throw to:

```typescript
    throw new FetchError(`network error fetching ${url}`, { cause: err });
```

and the HTTP-error throw to:

```typescript
  if (res.statusCode >= 400) {
    throw new FetchError(`http ${res.statusCode} fetching ${url}`, { statusCode: res.statusCode });
  }
```

- [ ] **Step 3: Typecheck the crawler package**

Run: `pnpm --filter @smanga/crawler typecheck`
Expected: PASS (no errors). If the package name differs, use `pnpm --filter ./packages/crawler typecheck`.

- [ ] **Step 4: Run the existing crawler tests**

Run: `pnpm exec vitest run packages/crawler`
Expected: PASS — the existing fixture-driven parser/engine tests are unaffected; this confirms no throw site regressed.

- [ ] **Step 5: Commit**

```bash
git add packages/crawler/src/fetcher.ts
git commit -m "feat(crawler): populate FetchError.statusCode from res.statusCode"
```

---

## Task 3: Classification + backoff policy (`retry-policy.ts`)

A pure, fully unit-tested module in `@smanga/shared`. It maps an error instance to `'transient' | 'permanent'` and exposes the per-generation backoff ladder. It lives in `shared` (not `apps/api`) because it depends only on the error classes and must be importable by both the API and any future worker.

**Files:**
- Create: `packages/shared/src/retry-policy.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/retry-policy.test.ts` (Create)

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/retry-policy.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  AdapterNotFoundError,
  FetchError,
  ParserError,
  RateLimitError,
} from '../src/errors.js';
import {
  MAX_RETRY_GENERATIONS,
  RETRY_BACKOFF_MINUTES,
  backoffForGeneration,
  classifyCrawlerError,
} from '../src/retry-policy.js';

describe('classifyCrawlerError', () => {
  it('treats rate-limit (429/503) as transient', () => {
    expect(classifyCrawlerError(new RateLimitError('rate limited (429)'))).toBe('transient');
  });

  it('treats network errors (no statusCode) as transient', () => {
    expect(classifyCrawlerError(new FetchError('network error', { cause: new Error('x') }))).toBe(
      'transient',
    );
  });

  it('treats HTTP 5xx and 408 as transient', () => {
    expect(classifyCrawlerError(new FetchError('http 503', { statusCode: 503 }))).toBe('transient');
    expect(classifyCrawlerError(new FetchError('http 500', { statusCode: 500 }))).toBe('transient');
    expect(classifyCrawlerError(new FetchError('http 408', { statusCode: 408 }))).toBe('transient');
  });

  it('treats HTTP 4xx (except 408) as permanent', () => {
    expect(classifyCrawlerError(new FetchError('http 404', { statusCode: 404 }))).toBe('permanent');
    expect(classifyCrawlerError(new FetchError('http 403', { statusCode: 403 }))).toBe('permanent');
    expect(classifyCrawlerError(new FetchError('http 400', { statusCode: 400 }))).toBe('permanent');
  });

  it('treats ParserError and AdapterNotFoundError as permanent', () => {
    expect(classifyCrawlerError(new ParserError('html changed'))).toBe('permanent');
    expect(classifyCrawlerError(new AdapterNotFoundError('no adapter'))).toBe('permanent');
  });

  it('treats unknown / generic errors as permanent (conservative)', () => {
    expect(classifyCrawlerError(new Error('???'))).toBe('permanent');
    expect(classifyCrawlerError('a string')).toBe('permanent');
    expect(classifyCrawlerError(undefined)).toBe('permanent');
  });

  it('falls back to error name when prototype identity is lost', () => {
    // Simulates an error that crossed a module boundary and lost instanceof.
    const fakeRateLimit = Object.assign(new Error('rate limited'), { name: 'RateLimitError' });
    expect(classifyCrawlerError(fakeRateLimit)).toBe('transient');
    const fakeParser = Object.assign(new Error('parse fail'), { name: 'ParserError' });
    expect(classifyCrawlerError(fakeParser)).toBe('permanent');
  });
});

describe('backoffForGeneration', () => {
  it('returns the documented ladder (minutes) for generations 1..5', () => {
    expect(RETRY_BACKOFF_MINUTES).toEqual([10, 30, 120, 360, 1440]);
    expect(backoffForGeneration(1)).toBe(10);
    expect(backoffForGeneration(2)).toBe(30);
    expect(backoffForGeneration(3)).toBe(120);
    expect(backoffForGeneration(4)).toBe(360);
    expect(backoffForGeneration(5)).toBe(1440);
  });

  it('clamps out-of-range generations to the nearest ladder value', () => {
    expect(backoffForGeneration(0)).toBe(10);
    expect(backoffForGeneration(-3)).toBe(10);
    expect(backoffForGeneration(6)).toBe(1440);
    expect(backoffForGeneration(99)).toBe(1440);
  });

  it('MAX_RETRY_GENERATIONS matches the ladder length', () => {
    expect(MAX_RETRY_GENERATIONS).toBe(5);
    expect(MAX_RETRY_GENERATIONS).toBe(RETRY_BACKOFF_MINUTES.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/shared/tests/retry-policy.test.ts`
Expected: FAIL — `Cannot find module '../src/retry-policy.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/shared/src/retry-policy.ts`:

```typescript
import {
  AdapterNotFoundError,
  FetchError,
  ParserError,
  RateLimitError,
} from './errors.js';

export type FailureClass = 'transient' | 'permanent';

/**
 * Coarse per-generation backoff ladder for the dead-letter reconciler, on
 * top of Bull's fine 30s in-process exponential. Index 0 = generation 1.
 * Minutes: 10m / 30m / 2h / 6h / 24h. After generation 5 the row is `dead`.
 */
export const RETRY_BACKOFF_MINUTES = [10, 30, 120, 360, 1440] as const;

export const MAX_RETRY_GENERATIONS = RETRY_BACKOFF_MINUTES.length; // 5

/** Backoff (in minutes) before the given 1-based reconciler generation. */
export function backoffForGeneration(generation: number): number {
  if (generation < 1) return RETRY_BACKOFF_MINUTES[0];
  if (generation > RETRY_BACKOFF_MINUTES.length) {
    return RETRY_BACKOFF_MINUTES[RETRY_BACKOFF_MINUTES.length - 1];
  }
  return RETRY_BACKOFF_MINUTES[generation - 1];
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : '';
}

/**
 * Decide whether a terminal crawler failure is worth retrying.
 * Primary path uses `instanceof` (reliable in-process — the single API
 * process runs producer + workers and `@smanga/shared` is bundled once).
 * A `.name` fallback covers the unlikely case where an error crossed a
 * module boundary and lost its prototype chain.
 */
export function classifyCrawlerError(err: unknown): FailureClass {
  if (err instanceof RateLimitError) return 'transient';
  if (err instanceof FetchError) return classifyFetch(err.statusCode);
  if (err instanceof ParserError) return 'permanent';
  if (err instanceof AdapterNotFoundError) return 'permanent';

  // Name-based fallback (prototype identity lost).
  switch (errorName(err)) {
    case 'RateLimitError':
      return 'transient';
    case 'FetchError':
      // statusCode is unreadable in this path — be conservative-transient,
      // since a FetchError is most often a network blip or 5xx.
      return 'transient';
    case 'ParserError':
    case 'AdapterNotFoundError':
      return 'permanent';
    default:
      // Unknown / generic Error: surface it, never loop on something we
      // don't understand.
      return 'permanent';
  }
}

function classifyFetch(statusCode: number | undefined): FailureClass {
  if (statusCode === undefined) return 'transient'; // network error / timeout
  if (statusCode === 408 || statusCode >= 500) return 'transient'; // upstream hiccup
  if (statusCode >= 400) return 'permanent'; // 4xx — gone / forbidden / bad
  return 'transient'; // unreachable in practice (FetchError thrown only for >=400)
}
```

Edit `packages/shared/src/index.ts` to add the new export (append after the existing lines):

```typescript
export * from './adapter.ts';
export * from './errors.ts';
export * from './jobs.ts';
export * from './retry-policy.ts';
```

(Note: `index.ts` re-exports use `.ts` extensions in this package — match the existing three lines.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/shared/tests/retry-policy.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/retry-policy.ts packages/shared/src/index.ts packages/shared/tests/retry-policy.test.ts
git commit -m "feat(shared): classifyCrawlerError + backoffForGeneration retry policy"
```

---

## Task 4: `job_failure` schema + `auto_retry_enabled` column + migration

Add the new Drizzle table (two pgEnums, defined inline — the table has no foreign keys, so no cross-schema `.ts` imports are needed) and one boolean column on the existing `app_setting` singleton. Both schema changes generate into a single migration.

**Files:**
- Create: `packages/db/src/schema/job-failure.ts`
- Modify: `packages/db/src/schema/app-setting.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/drizzle.config.ts`
- Test: `packages/db/tests/job-failure-schema.test.ts` (Create)
- Generated: `packages/db/src/migrations/0012_*.sql` + `meta/_journal.json`

- [ ] **Step 1: Write the failing test**

Create `packages/db/tests/job-failure-schema.test.ts`:

```typescript
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  jobFailure,
  jobFailureClassEnum,
  jobFailureStatusEnum,
} from '../src/schema/job-failure.js';

describe('job_failure schema', () => {
  it('exposes the expected columns', () => {
    const cols = Object.keys(getTableColumns(jobFailure)).sort();
    expect(cols).toEqual(
      [
        'id',
        'dedupKey',
        'queue',
        'jobName',
        'jobData',
        'errorClass',
        'classification',
        'failedReason',
        'attemptsMade',
        'retryGeneration',
        'status',
        'firstFailedAt',
        'lastFailedAt',
        'nextRetryAt',
        'resolvedAt',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
  });

  it('declares the two enums with the right values', () => {
    expect(jobFailureClassEnum.enumValues).toEqual(['transient', 'permanent']);
    expect(jobFailureStatusEnum.enumValues).toEqual([
      'pending',
      'retrying',
      'needs_attention',
      'dead',
      'resolved',
    ]);
  });

  it('maps to the job_failure table with a unique dedup_key index', () => {
    const cfg = getTableConfig(jobFailure);
    expect(cfg.name).toBe('job_failure');
    const uniqueIdx = cfg.indexes.find((i) => i.config.unique);
    expect(uniqueIdx?.config.columns.map((c) => (c as { name: string }).name)).toEqual([
      'dedup_key',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/db/tests/job-failure-schema.test.ts`
Expected: FAIL — `Cannot find module '../src/schema/job-failure.js'`.

- [ ] **Step 3: Write the schema file**

Create `packages/db/src/schema/job-failure.ts`:

```typescript
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const jobFailureClassEnum = pgEnum('job_failure_class', ['transient', 'permanent']);

export const jobFailureStatusEnum = pgEnum('job_failure_status', [
  'pending',
  'retrying',
  'needs_attention',
  'dead',
  'resolved',
]);

/**
 * Postgres-backed dead-letter queue for crawler jobs. One row per unit of
 * underlying work (keyed by `dedupKey`), surviving Redis's removeOnFail
 * trim and process restarts. The retry "brain" — see
 * docs/superpowers/specs/2026-06-10-job-retry-dead-letter-design.md.
 */
export const jobFailure = pgTable(
  'job_failure',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Natural key for the work, e.g. `fetch-chapter:<chapterId>`. Upsert
     * target — repeated failures of the same work update one row. */
    dedupKey: text('dedup_key').notNull(),
    queue: text('queue').notNull().default('crawler'),
    jobName: text('job_name').notNull(),
    /** Exact Bull payload needed to re-enqueue. */
    jobData: jsonb('job_data').notNull(),
    errorClass: text('error_class').notNull(),
    classification: jobFailureClassEnum('classification').notNull(),
    failedReason: text('failed_reason'),
    attemptsMade: integer('attempts_made').notNull().default(0),
    /** Reconciler re-enqueue count. Drives backoff + give-up. */
    retryGeneration: integer('retry_generation').notNull().default(0),
    status: jobFailureStatusEnum('status').notNull(),
    firstFailedAt: timestamp('first_failed_at', { withTimezone: true }).notNull().defaultNow(),
    lastFailedAt: timestamp('last_failed_at', { withTimezone: true }).notNull().defaultNow(),
    /** Reconciler picks rows where status='pending' AND next_retry_at <= now.
     * Null for permanent / dead / resolved. */
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dedupKeyUnique: uniqueIndex('job_failure_dedup_key_unique').on(t.dedupKey),
    // Serves the reconciler picker: status='pending' AND next_retry_at <= now.
    reconcilerIdx: index('job_failure_reconciler_idx').on(t.status, t.nextRetryAt),
  }),
);

export type JobFailure = typeof jobFailure.$inferSelect;
export type NewJobFailure = typeof jobFailure.$inferInsert;
```

- [ ] **Step 4: Add the `autoRetryEnabled` column to `app_setting`**

Edit `packages/db/src/schema/app-setting.ts`. Add the new column after `autoRefreshConcurrency` (before `lastRunAt`):

```typescript
  autoRefreshConcurrency: integer('auto_refresh_concurrency').notNull().default(5),
  /** Kill switch for the dead-letter retry reconciler. Default ON — flip off
   * to instantly disable auto-retry during an incident. */
  autoRetryEnabled: boolean('auto_retry_enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
```

(`boolean` is already imported in that file.)

- [ ] **Step 5: Register the schema file in the barrel and drizzle config**

Edit `packages/db/src/schema/index.ts` — append (use `.js`, matching the other lines):

```typescript
export * from './job-failure.js';
```

Edit `packages/db/drizzle.config.ts` — append to the `schema:` array (use `.ts`), after the `comment.ts` entry:

```typescript
    './src/schema/comment.ts', // Plan E: comments + reactions + notifications
    './src/schema/job-failure.ts', // dead-letter queue
```

- [ ] **Step 6: Run the schema test to verify it passes**

Run: `pnpm exec vitest run packages/db/tests/job-failure-schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Generate the migration**

Run: `pnpm --filter @smanga/db generate`
Expected: drizzle-kit creates `packages/db/src/migrations/0012_<random>.sql` and updates `meta/_journal.json` + a `0012_snapshot.json`. The SQL should `CREATE TYPE "public"."job_failure_class"`, `CREATE TYPE "public"."job_failure_status"`, `CREATE TABLE "job_failure"`, the two indexes, and `ALTER TABLE "app_setting" ADD COLUMN "auto_retry_enabled" boolean DEFAULT true NOT NULL`. No interactive rename prompt should appear (all changes are additive).

- [ ] **Step 8: Apply the migration locally and verify**

Ensure local Postgres is up (`pnpm dev:db`), then from repo root:
```powershell
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:migrate
```
Expected: log ends with `migrations applied`. Confirm the table exists:
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "\d job_failure"
```
Expected: the table prints with all 17 columns and both indexes.

- [ ] **Step 9: Commit**

```bash
git add packages/db/src/schema/job-failure.ts packages/db/src/schema/app-setting.ts packages/db/src/schema/index.ts packages/db/drizzle.config.ts packages/db/src/migrations/ packages/db/tests/job-failure-schema.test.ts
git commit -m "feat(db): job_failure dead-letter table + auto_retry_enabled setting"
```

---

## Task 5: `dead-letter.util.ts` — dedup keys + priority

Pure helpers (no DI) that map a Bull job's `(name, data)` to its `dedupKey` and re-enqueue priority. Returning `null` from `dedupKeyForJob` is the gate that excludes orchestrator/reconciler jobs from dead-lettering (see Design Refinement #3).

**Files:**
- Create: `apps/api/src/modules/jobs/dead-letter.util.ts`
- Test: `apps/api/src/modules/jobs/dead-letter.util.spec.ts` (Create)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/jobs/dead-letter.util.spec.ts`:

```typescript
import { JOB_PRIORITY } from '@/modules/queue/queue.constants';
import { describe, expect, it } from 'vitest';
import { dedupKeyForJob, priorityForJob } from './dead-letter.util';

describe('dedupKeyForJob', () => {
  it('keys fetch-chapter by chapterId', () => {
    expect(dedupKeyForJob('fetch-chapter', { chapterId: 'c1' })).toBe('fetch-chapter:c1');
  });

  it('keys discover-chapters by storyId', () => {
    expect(dedupKeyForJob('discover-chapters', { storyId: 's1' })).toBe('discover-chapters:s1');
  });

  it('keys import-story by url', () => {
    expect(dedupKeyForJob('import-story', { url: 'https://x.test/a/' })).toBe(
      'import-story:https://x.test/a/',
    );
  });

  it('returns null for job types that must not be dead-lettered', () => {
    expect(dedupKeyForJob('discover-all-source', { sourceId: 's', feedId: 'f' })).toBeNull();
    expect(dedupKeyForJob('refresh-all-stories', {})).toBeNull();
    expect(dedupKeyForJob('retry-reconciler', {})).toBeNull();
    expect(dedupKeyForJob('unknown-job', {})).toBeNull();
  });

  it('returns null when the natural identifier is missing', () => {
    expect(dedupKeyForJob('fetch-chapter', {})).toBeNull();
    expect(dedupKeyForJob('fetch-chapter', undefined)).toBeNull();
  });
});

describe('priorityForJob', () => {
  it('returns the matching JOB_PRIORITY for dead-letterable jobs', () => {
    expect(priorityForJob('fetch-chapter')).toBe(JOB_PRIORITY.FETCH_CHAPTER);
    expect(priorityForJob('discover-chapters')).toBe(JOB_PRIORITY.DISCOVER_CHAPTERS);
    expect(priorityForJob('import-story')).toBe(JOB_PRIORITY.IMPORT_STORY);
  });

  it('returns undefined for everything else', () => {
    expect(priorityForJob('discover-all-source')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/api/src/modules/jobs/dead-letter.util.spec.ts`
Expected: FAIL — module `./dead-letter.util` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/modules/jobs/dead-letter.util.ts`:

```typescript
import {
  JOB_DISCOVER_CHAPTERS,
  JOB_FETCH_CHAPTER,
  JOB_IMPORT_STORY,
  JOB_PRIORITY,
} from '@/modules/queue/queue.constants';

/**
 * Natural dedup key for a crawler job, or null if the job type must NOT be
 * dead-lettered. Only the three retryable work units qualify; orchestrators
 * (discover-all-source, refresh-all-stories) and the reconciler itself are
 * excluded by design — see the plan's Design Refinement #3. The key doubles
 * as the re-enqueue jobId (idempotent), matching the existing colon-joined
 * jobId conventions in jobs.service.ts / the crawler processors.
 */
export function dedupKeyForJob(name: string, data: unknown): string | null {
  const d = (data ?? {}) as Record<string, unknown>;
  switch (name) {
    case JOB_FETCH_CHAPTER:
      return d.chapterId ? `${JOB_FETCH_CHAPTER}:${String(d.chapterId)}` : null;
    case JOB_DISCOVER_CHAPTERS:
      return d.storyId ? `${JOB_DISCOVER_CHAPTERS}:${String(d.storyId)}` : null;
    case JOB_IMPORT_STORY:
      return d.url ? `${JOB_IMPORT_STORY}:${String(d.url)}` : null;
    default:
      return null;
  }
}

/** Bull priority to re-enqueue a dead-lettered job with, or undefined. */
export function priorityForJob(name: string): number | undefined {
  switch (name) {
    case JOB_FETCH_CHAPTER:
      return JOB_PRIORITY.FETCH_CHAPTER;
    case JOB_DISCOVER_CHAPTERS:
      return JOB_PRIORITY.DISCOVER_CHAPTERS;
    case JOB_IMPORT_STORY:
      return JOB_PRIORITY.IMPORT_STORY;
    default:
      return undefined;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/api/src/modules/jobs/dead-letter.util.spec.ts`
Expected: PASS (both describe blocks).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/jobs/dead-letter.util.ts apps/api/src/modules/jobs/dead-letter.util.spec.ts
git commit -m "feat(api): dead-letter dedup-key + priority helpers"
```

---

## Task 6: `JobFailureListener` — upsert on terminal failure, resolve on success

A listener-only `@Processor(QUEUE_CRAWLER)` class (no `@Process` handler). `@OnQueueFailed` upserts a `job_failure` row **only on the terminal attempt** (Design Refinement #1). `@OnQueueCompleted` resolves any matching row. Both inject the global `DRIZZLE` token.

**Files:**
- Create: `apps/api/src/modules/jobs/job-failure.listener.ts`
- Test: `apps/api/src/modules/jobs/job-failure.listener.spec.ts` (Create)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/jobs/job-failure.listener.spec.ts`:

```typescript
import { FetchError, ParserError } from '@smanga/shared';
import { describe, expect, it, vi } from 'vitest';
import { JobFailureListener } from './job-failure.listener';

/** Mock the drizzle select().from().where().limit() chain → resolves rows. */
function selectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return () => chain;
}

function makeJob(over: Record<string, unknown> = {}) {
  return {
    name: 'fetch-chapter',
    data: { chapterId: 'c1' },
    attemptsMade: 2,
    opts: { attempts: 2 },
    ...over,
  } as never;
}

describe('JobFailureListener.onFailed', () => {
  it('does NOT dead-letter while in-process retries remain', async () => {
    const insert = vi.fn();
    const db = { select: vi.fn(selectChain([])), insert } as never;
    const listener = new JobFailureListener(db);

    // attemptsMade 1 < attempts 2 → not terminal yet.
    await listener.onFailed(makeJob({ attemptsMade: 1 }), new FetchError('http 500', { statusCode: 500 }));

    expect(insert).not.toHaveBeenCalled();
  });

  it('upserts a transient terminal failure as pending with a 10m backoff (fresh row)', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const db = { select: vi.fn(selectChain([])), insert } as never; // no existing row → gen 0
    const listener = new JobFailureListener(db);

    const before = Date.now();
    await listener.onFailed(makeJob(), new FetchError('http 503', { statusCode: 503 }));

    expect(insert).toHaveBeenCalledTimes(1);
    const inserted = values.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.dedupKey).toBe('fetch-chapter:c1');
    expect(inserted.classification).toBe('transient');
    expect(inserted.status).toBe('pending');
    expect(inserted.retryGeneration).toBe(0);
    const next = (inserted.nextRetryAt as Date).getTime();
    expect(next - before).toBeGreaterThanOrEqual(10 * 60_000 - 1000);
    expect(next - before).toBeLessThan(11 * 60_000);
  });

  it('routes permanent failures to needs_attention with no nextRetryAt', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const db = { select: vi.fn(selectChain([])), insert } as never;
    const listener = new JobFailureListener(db);

    await listener.onFailed(makeJob(), new ParserError('html changed'));

    const inserted = values.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.classification).toBe('permanent');
    expect(inserted.status).toBe('needs_attention');
    expect(inserted.nextRetryAt).toBeNull();
  });

  it('marks a transient row dead once it has exhausted MAX generations', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    // Existing row already at generation 5 → next failure gives up.
    const db = { select: vi.fn(selectChain([{ retryGeneration: 5 }])), insert } as never;
    const listener = new JobFailureListener(db);

    await listener.onFailed(makeJob(), new FetchError('http 500', { statusCode: 500 }));

    const inserted = values.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.status).toBe('dead');
    expect(inserted.nextRetryAt).toBeNull();
  });

  it('ignores job types that are not dead-letterable', async () => {
    const insert = vi.fn();
    const db = { select: vi.fn(), insert } as never;
    const listener = new JobFailureListener(db);

    await listener.onFailed(
      makeJob({ name: 'refresh-all-stories', data: {} }),
      new FetchError('http 500', { statusCode: 500 }),
    );

    expect(insert).not.toHaveBeenCalled();
  });
});

describe('JobFailureListener.onCompleted', () => {
  it('resolves a matching row by dedupKey', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const db = { update } as never;
    const listener = new JobFailureListener(db);

    await listener.onCompleted(makeJob());

    expect(update).toHaveBeenCalledTimes(1);
    const patch = set.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch.status).toBe('resolved');
    expect(patch.resolvedAt).toBeInstanceOf(Date);
  });

  it('does nothing for non-dead-letterable job types', async () => {
    const update = vi.fn();
    const db = { update } as never;
    const listener = new JobFailureListener(db);
    await listener.onCompleted(makeJob({ name: 'retry-reconciler', data: {} }));
    expect(update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/api/src/modules/jobs/job-failure.listener.spec.ts`
Expected: FAIL — module `./job-failure.listener` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/modules/jobs/job-failure.listener.ts`:

```typescript
import { DRIZZLE } from '@/modules/db/db.provider';
import { QUEUE_CRAWLER } from '@/modules/queue/queue.constants';
import { OnQueueCompleted, OnQueueFailed, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { jobFailure } from '@smanga/db/schema';
import { MAX_RETRY_GENERATIONS, backoffForGeneration, classifyCrawlerError } from '@smanga/shared';
import type { Job } from 'bull';
import { and, eq, inArray } from 'drizzle-orm';
import { dedupKeyForJob } from './dead-letter.util';

/**
 * Listener-only processor for the crawler queue. Runs in the single API
 * process (producer + workers), so `@OnQueueFailed` receives the real Error
 * instance and `classifyCrawlerError`'s `instanceof` checks are reliable.
 */
@Processor(QUEUE_CRAWLER)
export class JobFailureListener {
  private readonly logger = new Logger(JobFailureListener.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @OnQueueFailed()
  async onFailed(job: Job, err: Error): Promise<void> {
    // Bull emits 'failed' on EVERY attempt. Only dead-letter once Bull's
    // in-process retries are exhausted (terminal failure).
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;

    const dedupKey = dedupKeyForJob(job.name, job.data);
    if (!dedupKey) return;

    const classification = classifyCrawlerError(err);
    const reason = err?.message ?? String(err);
    const errorClass = err?.name ?? 'Error';
    const now = new Date();

    // Read the current generation to decide the next state. retryGeneration
    // is only ever advanced by the reconciler, never here.
    const [existing] = await this.db
      .select({ retryGeneration: jobFailure.retryGeneration })
      .from(jobFailure)
      .where(eq(jobFailure.dedupKey, dedupKey))
      .limit(1);
    const gen = existing?.retryGeneration ?? 0;

    let status: 'pending' | 'needs_attention' | 'dead';
    let nextRetryAt: Date | null;
    if (classification === 'permanent') {
      status = 'needs_attention';
      nextRetryAt = null;
    } else if (gen >= MAX_RETRY_GENERATIONS) {
      status = 'dead';
      nextRetryAt = null;
    } else {
      status = 'pending';
      nextRetryAt = new Date(now.getTime() + backoffForGeneration(gen + 1) * 60_000);
    }

    await this.db
      .insert(jobFailure)
      .values({
        dedupKey,
        jobName: job.name,
        jobData: job.data,
        errorClass,
        classification,
        failedReason: reason,
        attemptsMade: job.attemptsMade,
        retryGeneration: 0,
        status,
        firstFailedAt: now,
        lastFailedAt: now,
        nextRetryAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: jobFailure.dedupKey,
        set: {
          jobName: job.name,
          jobData: job.data,
          errorClass,
          classification,
          failedReason: reason,
          attemptsMade: job.attemptsMade,
          status,
          lastFailedAt: now,
          nextRetryAt,
          updatedAt: now,
        },
      });

    this.logger.warn(
      `dead-letter ${status} key=${dedupKey} class=${classification} gen=${gen} reason="${reason}"`,
    );
  }

  @OnQueueCompleted()
  async onCompleted(job: Job): Promise<void> {
    const dedupKey = dedupKeyForJob(job.name, job.data);
    if (!dedupKey) return;
    const now = new Date();
    await this.db
      .update(jobFailure)
      .set({ status: 'resolved', resolvedAt: now, nextRetryAt: null, updatedAt: now })
      .where(
        and(
          eq(jobFailure.dedupKey, dedupKey),
          inArray(jobFailure.status, ['pending', 'retrying', 'needs_attention', 'dead']),
        ),
      );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/api/src/modules/jobs/job-failure.listener.spec.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/jobs/job-failure.listener.ts apps/api/src/modules/jobs/job-failure.listener.spec.ts
git commit -m "feat(api): job-failure listener (upsert on terminal failure, resolve on complete)"
```

---

## Task 7: Add reconciler queue constants

The reconciler is a Bull-repeatable job in the existing crawler queue (Design Refinement: scheduling is Bull-repeatable, not `@nestjs/schedule`). Add its name + priority constants. Priority `2` keeps it just below user-facing `fetch-chapter` (1) — it runs promptly during normal operation; when the queue is flooded it would queue behind crawl work, which is fine because the reconciler's own high-water gate would skip the run anyway.

**Files:**
- Modify: `apps/api/src/modules/queue/queue.constants.ts`

- [ ] **Step 1: Add the job name constant**

Edit `apps/api/src/modules/queue/queue.constants.ts`. After the `JOB_DISCOVER_ALL_SOURCE` line, add:

```typescript
export const JOB_DISCOVER_ALL_SOURCE = 'discover-all-source';
export const JOB_RETRY_RECONCILER = 'retry-reconciler';
```

- [ ] **Step 2: Add the priority rung**

In the same file, add `RETRY_RECONCILER` to the `JOB_PRIORITY` object (between `FETCH_CHAPTER` and `DISCOVER_CHAPTERS`):

```typescript
export const JOB_PRIORITY = {
  FETCH_CHAPTER: 1,
  RETRY_RECONCILER: 2,
  DISCOVER_CHAPTERS: 5,
  DISCOVER_ALL_SOURCE: 8,
  IMPORT_STORY: 10,
  REFRESH_ALL_STORIES: 20,
} as const;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @smanga/api typecheck` (or `pnpm --filter ./apps/api typecheck` if the named filter fails)
Expected: PASS. If `apps/api` has no `typecheck` script, skip — it is covered by the build in Task 12.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/queue/queue.constants.ts
git commit -m "feat(api): add retry-reconciler job name + priority rung"
```

---

## Task 8: `RetryReconcilerService` — bounded scheduled re-enqueue

A `@Processor(QUEUE_CRAWLER)` class that (a) installs its own 5-minute Bull repeatable at boot and (b) processes each tick: kill-switch check → capacity gate → pick ≤200 due `pending` rows → re-enqueue each into the crawler queue → flip the row to `retrying` and bump `retryGeneration`.

**Files:**
- Create: `apps/api/src/modules/jobs/retry-reconciler.service.ts`
- Test: `apps/api/src/modules/jobs/retry-reconciler.service.spec.ts` (Create)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/jobs/retry-reconciler.service.spec.ts`:

```typescript
import { _resetCapacityCache } from '@/modules/queue/queue-capacity';
import { JOB_PRIORITY } from '@/modules/queue/queue.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryReconcilerService } from './retry-reconciler.service';

/**
 * Mock the two drizzle select chains the reconciler runs in order:
 *   1) select().from(appSetting).where().limit(1)
 *   2) select().from(jobFailure).where().orderBy().limit(cap)
 * `results[0]` feeds the first `.limit()`, `results[1]` the second.
 */
function makeSelect(results: unknown[][]) {
  let call = 0;
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(results[call++] ?? []),
  };
  return vi.fn(() => chain);
}

function updateMock() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { update, set, where };
}

describe('RetryReconcilerService.handle', () => {
  beforeEach(() => _resetCapacityCache());

  it('no-ops when auto_retry_enabled is false', async () => {
    const add = vi.fn();
    const getWaitingCount = vi.fn().mockResolvedValue(0);
    const queue = { add, getWaitingCount } as never;
    const db = { select: makeSelect([[{ autoRetryEnabled: false }]]) } as never;
    const svc = new RetryReconcilerService(db, queue);

    const res = await svc.handle({} as never);
    expect(res).toEqual({ reEnqueued: 0, skipped: true });
    expect(add).not.toHaveBeenCalled();
  });

  it('skips the entire run when the queue is at/over capacity', async () => {
    const add = vi.fn();
    const getWaitingCount = vi.fn().mockResolvedValue(10_000); // QUEUE_WAITING_CAP
    const queue = { add, getWaitingCount } as never;
    const db = { select: makeSelect([[{ autoRetryEnabled: true }]]) } as never;
    const svc = new RetryReconcilerService(db, queue);

    const res = await svc.handle({} as never);
    expect(res).toEqual({ reEnqueued: 0, skipped: true });
    expect(add).not.toHaveBeenCalled();
  });

  it('re-enqueues each due row and flips it to retrying with gen+1', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'x' });
    const getJob = vi.fn().mockResolvedValue(null);
    const getWaitingCount = vi.fn().mockResolvedValue(100);
    const queue = { add, getJob, getWaitingCount } as never;
    const due = [
      { id: 'r1', dedupKey: 'fetch-chapter:c1', jobName: 'fetch-chapter', jobData: { chapterId: 'c1' }, retryGeneration: 0 },
      { id: 'r2', dedupKey: 'import-story:u', jobName: 'import-story', jobData: { url: 'u' }, retryGeneration: 1 },
    ];
    const { update, set } = updateMock();
    const db = { select: makeSelect([[{ autoRetryEnabled: true }], due]), update } as never;
    const svc = new RetryReconcilerService(db, queue);

    const res = await svc.handle({} as never);

    expect(res.reEnqueued).toBe(2);
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledWith(
      'fetch-chapter',
      { chapterId: 'c1' },
      { jobId: 'fetch-chapter:c1', priority: JOB_PRIORITY.FETCH_CHAPTER },
    );
    // First row: gen 0 -> 1, status retrying.
    expect(set.mock.calls[0]![0]).toMatchObject({ status: 'retrying', retryGeneration: 1 });
    expect(set.mock.calls[1]![0]).toMatchObject({ status: 'retrying', retryGeneration: 2 });
  });

  it('removes a lingering Bull job with the same id before re-enqueue', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const add = vi.fn().mockResolvedValue({ id: 'x' });
    const getJob = vi.fn().mockResolvedValue({ remove });
    const getWaitingCount = vi.fn().mockResolvedValue(0);
    const queue = { add, getJob, getWaitingCount } as never;
    const due = [
      { id: 'r1', dedupKey: 'fetch-chapter:c1', jobName: 'fetch-chapter', jobData: { chapterId: 'c1' }, retryGeneration: 0 },
    ];
    const { update } = updateMock();
    const db = { select: makeSelect([[{ autoRetryEnabled: true }], due]), update } as never;
    const svc = new RetryReconcilerService(db, queue);

    await svc.handle({} as never);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/api/src/modules/jobs/retry-reconciler.service.spec.ts`
Expected: FAIL — module `./retry-reconciler.service` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/modules/jobs/retry-reconciler.service.ts`:

```typescript
import { DRIZZLE } from '@/modules/db/db.provider';
import { isQueueAtCapacity } from '@/modules/queue/queue-capacity';
import {
  JOB_PRIORITY,
  JOB_RETRY_RECONCILER,
  QUEUE_CRAWLER,
} from '@/modules/queue/queue.constants';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Inject, Logger, type OnModuleInit } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { appSetting, jobFailure } from '@smanga/db/schema';
import type { Job, Queue } from 'bull';
import { and, asc, eq, lte } from 'drizzle-orm';
import { priorityForJob } from './dead-letter.util';

const RECONCILER_REPEATABLE_KEY = 'retry-reconciler-cron';
const RECONCILER_CRON = '*/5 * * * *'; // every 5 minutes
const RECONCILER_BATCH_CAP = 200; // hard re-enqueue cap per run

@Processor(QUEUE_CRAWLER)
export class RetryReconcilerService implements OnModuleInit {
  private readonly logger = new Logger(RetryReconcilerService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  /**
   * Install the repeatable once at boot. The kill switch is checked inside
   * handle(), so toggling auto-retry off never touches the registry — the
   * tick simply no-ops.
   */
  async onModuleInit(): Promise<void> {
    try {
      const repeatables = await this.queue.getRepeatableJobs();
      for (const r of repeatables) {
        if (r.id === RECONCILER_REPEATABLE_KEY) {
          await this.queue.removeRepeatableByKey(r.key);
        }
      }
    } catch (err) {
      this.logger.warn(`reconciler repeatable cleanup failed: ${(err as Error).message}`);
    }
    await this.queue.add(
      JOB_RETRY_RECONCILER,
      {},
      {
        repeat: { cron: RECONCILER_CRON, tz: 'Asia/Ho_Chi_Minh' },
        jobId: RECONCILER_REPEATABLE_KEY,
        priority: JOB_PRIORITY.RETRY_RECONCILER,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    this.logger.log(`retry-reconciler repeatable installed cron="${RECONCILER_CRON}"`);
  }

  @Process(JOB_RETRY_RECONCILER)
  async handle(_job: Job): Promise<{ reEnqueued: number; skipped: boolean }> {
    const [config] = await this.db
      .select({ autoRetryEnabled: appSetting.autoRetryEnabled })
      .from(appSetting)
      .where(eq(appSetting.id, 1))
      .limit(1);
    if (!config?.autoRetryEnabled) {
      this.logger.log('retry-reconciler skipped — auto retry disabled');
      return { reEnqueued: 0, skipped: true };
    }

    // Never pile onto a backed-up queue (RECONCILER_SKIP_OVER_WAITING ===
    // QUEUE_WAITING_CAP === 10_000).
    if (await isQueueAtCapacity(this.queue)) {
      this.logger.warn('retry-reconciler skipped — queue at/over capacity');
      return { reEnqueued: 0, skipped: true };
    }

    const now = new Date();
    const due = await this.db
      .select()
      .from(jobFailure)
      .where(and(eq(jobFailure.status, 'pending'), lte(jobFailure.nextRetryAt, now)))
      .orderBy(asc(jobFailure.nextRetryAt))
      .limit(RECONCILER_BATCH_CAP);

    let reEnqueued = 0;
    for (const row of due) {
      try {
        const jobId = row.dedupKey;
        const priority = priorityForJob(row.jobName);
        // Drop any lingering Bull job under the same id (e.g. in completed/
        // failed) so the re-add isn't deduped into a no-op — mirrors the
        // clone-fallback in jobs.service.ts.
        const existing = await this.queue.getJob(jobId);
        if (existing) await existing.remove().catch(() => {});
        await this.queue.add(row.jobName, row.jobData as object, { jobId, priority });
        await this.db
          .update(jobFailure)
          .set({
            status: 'retrying',
            retryGeneration: row.retryGeneration + 1,
            nextRetryAt: null,
            updatedAt: new Date(),
          })
          .where(eq(jobFailure.id, row.id));
        reEnqueued += 1;
      } catch (err) {
        this.logger.error(
          `reconciler re-enqueue failed key=${row.dedupKey}: ${(err as Error).message}`,
        );
      }
    }

    if (due.length === RECONCILER_BATCH_CAP) {
      this.logger.warn(
        `retry-reconciler hit batch cap (${RECONCILER_BATCH_CAP}); more rows remain for next tick`,
      );
    }
    this.logger.log(`retry-reconciler re-enqueued ${reEnqueued}/${due.length}`);
    return { reEnqueued, skipped: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/api/src/modules/jobs/retry-reconciler.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/jobs/retry-reconciler.service.ts apps/api/src/modules/jobs/retry-reconciler.service.spec.ts
git commit -m "feat(api): bounded retry reconciler (5m repeatable, 200/run cap, capacity gate)"
```

---

## Task 9: Dead-letter operator actions in `JobsService` + controller

Operator-facing read + actions. These touch only the `job_failure` table — they re-arm rows; the reconciler does the actual enqueue (so all enqueues stay behind the capacity gate). `JobsService` already injects `DRIZZLE` as `this.db`.

**Files:**
- Modify: `apps/api/src/modules/jobs/jobs.service.ts`
- Modify: `apps/api/src/modules/jobs/jobs.controller.ts`
- Test: `apps/api/src/modules/jobs/jobs.service.dead-letter.spec.ts` (Create)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/jobs/jobs.service.dead-letter.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { JobsService } from './jobs.service';

function selectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return () => chain;
}

function updateReturning(returned: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returned);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { update, set, where, returning };
}

describe('JobsService dead-letter actions', () => {
  it('listDeadLetter returns rows from the query', async () => {
    const rows = [{ id: 'r1' }];
    const db = { select: vi.fn(selectChain(rows)) } as never;
    const svc = new JobsService(db, {} as never);
    expect(await svc.listDeadLetter()).toBe(rows);
  });

  it('deadLetterRetryNow re-arms a row to pending with nextRetryAt=now', async () => {
    const { update, set } = updateReturning([{ id: 'r1' }]);
    const db = { update } as never;
    const svc = new JobsService(db, {} as never);
    const res = await svc.deadLetterRetryNow('r1');
    expect(res).toEqual({ ok: true });
    expect(set.mock.calls[0]![0]).toMatchObject({ status: 'pending' });
    expect((set.mock.calls[0]![0] as Record<string, unknown>).nextRetryAt).toBeInstanceOf(Date);
  });

  it('deadLetterRetryNow returns ok:false when no row matched', async () => {
    const { update } = updateReturning([]);
    const db = { update } as never;
    const svc = new JobsService(db, {} as never);
    expect(await svc.deadLetterRetryNow('missing')).toEqual({ ok: false });
  });

  it('deadLetterDismiss resolves a row', async () => {
    const { update, set } = updateReturning([{ id: 'r1' }]);
    const db = { update } as never;
    const svc = new JobsService(db, {} as never);
    const res = await svc.deadLetterDismiss('r1');
    expect(res).toEqual({ ok: true });
    expect(set.mock.calls[0]![0]).toMatchObject({ status: 'resolved' });
  });

  it('deadLetterRetryAll re-arms all stuck rows and returns the count', async () => {
    const { update } = updateReturning([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const db = { update } as never;
    const svc = new JobsService(db, {} as never);
    expect(await svc.deadLetterRetryAll()).toEqual({ rearmed: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/api/src/modules/jobs/jobs.service.dead-letter.spec.ts`
Expected: FAIL — `svc.listDeadLetter is not a function`.

- [ ] **Step 3: Add the methods to `JobsService`**

In `apps/api/src/modules/jobs/jobs.service.ts`, add `jobFailure` to the `@smanga/db/schema` import and `desc`, `inArray` to the `drizzle-orm` import (merge with whatever is already imported — `eq` is likely already there). At minimum the file must import:

```typescript
import { jobFailure } from '@smanga/db/schema';
import { desc, eq, inArray } from 'drizzle-orm';
```

Then add these methods inside the `JobsService` class (e.g. after `retryAllFailed`):

```typescript
  /** Rows the operator should see: anything not yet resolved. */
  async listDeadLetter() {
    return this.db
      .select()
      .from(jobFailure)
      .where(inArray(jobFailure.status, ['pending', 'retrying', 'needs_attention', 'dead']))
      .orderBy(desc(jobFailure.lastFailedAt))
      .limit(200);
  }

  /** Force a single row back into the retry pipeline. Works on dead /
   * needs_attention too — flips to pending with nextRetryAt=now so the next
   * reconciler tick (≤5 min) picks it up. */
  async deadLetterRetryNow(id: string): Promise<{ ok: boolean }> {
    const now = new Date();
    const [updated] = await this.db
      .update(jobFailure)
      .set({ status: 'pending', nextRetryAt: now, updatedAt: now })
      .where(eq(jobFailure.id, id))
      .returning({ id: jobFailure.id });
    return { ok: Boolean(updated) };
  }

  /** Mark a row resolved (operator dismisses it). */
  async deadLetterDismiss(id: string): Promise<{ ok: boolean }> {
    const now = new Date();
    const [updated] = await this.db
      .update(jobFailure)
      .set({ status: 'resolved', resolvedAt: now, nextRetryAt: null, updatedAt: now })
      .where(eq(jobFailure.id, id))
      .returning({ id: jobFailure.id });
    return { ok: Boolean(updated) };
  }

  /** Re-arm every stuck row (needs_attention / dead / retrying) → pending,
   * nextRetryAt=now. Bulk operator rescue. */
  async deadLetterRetryAll(): Promise<{ rearmed: number }> {
    const now = new Date();
    const updated = await this.db
      .update(jobFailure)
      .set({ status: 'pending', nextRetryAt: now, updatedAt: now })
      .where(inArray(jobFailure.status, ['needs_attention', 'dead', 'retrying']))
      .returning({ id: jobFailure.id });
    return { rearmed: updated.length };
  }
```

- [ ] **Step 4: Add the controller endpoints**

In `apps/api/src/modules/jobs/jobs.controller.ts`, add these methods inside `JobsController` (after `backfillCovers`). Declare the static `dead-letter/retry-all` route before the `:id` routes:

```typescript
  @Get('dead-letter')
  listDeadLetter() {
    return this.jobs.listDeadLetter();
  }

  @Post('dead-letter/retry-all')
  @HttpCode(202)
  deadLetterRetryAll() {
    return this.jobs.deadLetterRetryAll();
  }

  @Post('dead-letter/:id/retry-now')
  deadLetterRetryNow(@Param('id') id: string) {
    return this.jobs.deadLetterRetryNow(id);
  }

  @Post('dead-letter/:id/dismiss')
  deadLetterDismiss(@Param('id') id: string) {
    return this.jobs.deadLetterDismiss(id);
  }
```

(`Get`, `Post`, `Param`, `HttpCode` are already imported in this controller.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run apps/api/src/modules/jobs/jobs.service.dead-letter.spec.ts`
Expected: PASS (5 tests). Also re-run the existing jobs spec to confirm no regression: `pnpm exec vitest run apps/api/src/modules/jobs/jobs.service.spec.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/jobs/jobs.service.ts apps/api/src/modules/jobs/jobs.controller.ts apps/api/src/modules/jobs/jobs.service.dead-letter.spec.ts
git commit -m "feat(api): dead-letter list + retry-now/dismiss/retry-all endpoints"
```

---

## Task 10: `auto_retry_enabled` toggle endpoint

The kill switch. `AppSettingsService` gets a typed getter/setter; a small dedicated controller exposes `GET`/`PATCH /admin/settings/auto-retry`, mirroring the existing auto-refresh controller. The reconciler reads the flag straight from the `app_setting` row (Task 8), so no service coupling is required.

**Files:**
- Modify: `apps/api/src/modules/app-settings/app-settings.service.ts`
- Create: `apps/api/src/modules/app-settings/dto/update-auto-retry.dto.ts`
- Create: `apps/api/src/modules/app-settings/auto-retry.controller.ts`
- Modify: `apps/api/src/modules/app-settings/app-settings.module.ts`
- Test: `apps/api/src/modules/app-settings/auto-retry.spec.ts` (Create)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/app-settings/auto-retry.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { AppSettingsService } from './app-settings.service';

function selectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return () => chain;
}

function updateReturning(returned: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returned);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  return { update: vi.fn(() => ({ set })), set };
}

describe('AppSettingsService auto-retry toggle', () => {
  it('getAutoRetry reads the persisted flag', async () => {
    const db = { select: vi.fn(selectChain([{ autoRetryEnabled: true }])) } as never;
    const svc = new AppSettingsService(db, {} as never);
    expect(await svc.getAutoRetry()).toEqual({ autoRetryEnabled: true });
  });

  it('setAutoRetry persists the flag and echoes it back', async () => {
    const { update, set } = updateReturning([{ autoRetryEnabled: false }]);
    const db = { update } as never;
    const svc = new AppSettingsService(db, {} as never);
    const res = await svc.setAutoRetry(false);
    expect(res).toEqual({ autoRetryEnabled: false });
    expect(set.mock.calls[0]![0]).toMatchObject({ autoRetryEnabled: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/api/src/modules/app-settings/auto-retry.spec.ts`
Expected: FAIL — `svc.getAutoRetry is not a function`.

- [ ] **Step 3: Add service methods**

In `apps/api/src/modules/app-settings/app-settings.service.ts`, add inside the class (after `markRunResult`):

```typescript
  async getAutoRetry(): Promise<{ autoRetryEnabled: boolean }> {
    const s = await this.getOrSeed();
    return { autoRetryEnabled: s.autoRetryEnabled };
  }

  async setAutoRetry(enabled: boolean): Promise<{ autoRetryEnabled: boolean }> {
    const [updated] = await this.db
      .update(appSetting)
      .set({ autoRetryEnabled: enabled, updatedAt: new Date() })
      .where(eq(appSetting.id, 1))
      .returning();
    if (!updated) throw new BadRequestException('app_setting row missing — re-run migrations');
    return { autoRetryEnabled: updated.autoRetryEnabled };
  }
```

(`BadRequestException`, `eq`, `appSetting` are already imported in this file.)

- [ ] **Step 4: Create the DTO**

Create `apps/api/src/modules/app-settings/dto/update-auto-retry.dto.ts`:

```typescript
import { IsBoolean } from 'class-validator';

export class UpdateAutoRetryDto {
  @IsBoolean()
  enabled!: boolean;
}
```

- [ ] **Step 5: Create the controller**

Create `apps/api/src/modules/app-settings/auto-retry.controller.ts`:

```typescript
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt.guard';
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppSettingsService } from './app-settings.service';
import { UpdateAutoRetryDto } from './dto/update-auto-retry.dto';

@ApiTags('admin/settings')
@Controller({ path: 'admin/settings/auto-retry', version: '1' })
@UseGuards(JwtAuthGuard)
@Roles(['admin'])
export class AutoRetryController {
  constructor(private readonly settings: AppSettingsService) {}

  @Get()
  get() {
    return this.settings.getAutoRetry();
  }

  @Patch()
  update(@Body() dto: UpdateAutoRetryDto) {
    return this.settings.setAutoRetry(dto.enabled);
  }
}
```

- [ ] **Step 6: Register the controller**

In `apps/api/src/modules/app-settings/app-settings.module.ts`, import `AutoRetryController` and add it to the `controllers` array:

```typescript
import { AutoRetryController } from './auto-retry.controller';
// ...
  controllers: [AppSettingsController, AutoRetryController],
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm exec vitest run apps/api/src/modules/app-settings/auto-retry.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/app-settings/app-settings.service.ts apps/api/src/modules/app-settings/dto/update-auto-retry.dto.ts apps/api/src/modules/app-settings/auto-retry.controller.ts apps/api/src/modules/app-settings/app-settings.module.ts apps/api/src/modules/app-settings/auto-retry.spec.ts
git commit -m "feat(api): auto_retry_enabled kill-switch endpoint"
```

---

## Task 11: Wire the listener + reconciler into `JobsModule` and verify boot

Register the two new `@Processor` providers so NestJS attaches the event listeners and the reconciler installs its repeatable at boot. Then boot the API against local Postgres + Redis and confirm the repeatable is live.

**Files:**
- Modify: `apps/api/src/modules/jobs/jobs.module.ts`

- [ ] **Step 1: Register the providers**

Replace the contents of `apps/api/src/modules/jobs/jobs.module.ts` with:

```typescript
import { QueueModule } from '@/modules/queue/queue.module';
import { Module } from '@nestjs/common';
import { JobFailureListener } from './job-failure.listener';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { RetryReconcilerService } from './retry-reconciler.service';

@Module({
  imports: [QueueModule],
  controllers: [JobsController],
  providers: [JobsService, JobFailureListener, RetryReconcilerService],
})
export class JobsModule {}
```

(`DRIZZLE` is provided by the global `DbModule`, so no extra import is needed.)

- [ ] **Step 2: Run the full API unit suite**

Run: `pnpm exec vitest run apps/api`
Expected: PASS — all new specs plus the pre-existing `jobs.service.spec.ts` are green.

- [ ] **Step 3: Boot the API and confirm the repeatable installs**

With local Postgres + Redis running (`pnpm dev:db`) and migrations applied:
```powershell
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
$env:REDIS_URL = "redis://localhost:6379"
$env:JWT_SECRET = "<value from .env>"
pnpm dev:api
```
Expected: startup log includes `retry-reconciler repeatable installed cron="*/5 * * * *"` from `RetryReconcilerService` and no Nest DI errors. Confirm the repeatable exists in Redis:
```powershell
docker exec smanga-redis redis-cli KEYS "bull:crawler:repeat:*"
```
Expected: at least one key whose entry corresponds to `retry-reconciler-cron` (alongside the existing `refresh-all-stories-cron` if auto-refresh is on).

- [ ] **Step 4: Smoke-test the dead-letter flow end-to-end (manual)**

With the API running, insert a fake transient terminal failure and watch the reconciler pick it up within 5 minutes. From a psql shell:
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "INSERT INTO job_failure (dedup_key, job_name, job_data, error_class, classification, failed_reason, status, next_retry_at) VALUES ('fetch-chapter:00000000-0000-0000-0000-000000000000', 'fetch-chapter', '{\"chapterId\":\"00000000-0000-0000-0000-000000000000\"}', 'FetchError', 'transient', 'manual smoke test', 'pending', now());"
```
Then within ~5 minutes check the row transitioned:
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT status, retry_generation FROM job_failure WHERE dedup_key='fetch-chapter:00000000-0000-0000-0000-000000000000';"
```
Expected: `status` becomes `retrying` and `retry_generation` is `1` (the reconciler re-enqueued it; the fake chapter id then fails/resolves on its own — clean it up with a `DELETE` afterwards). If the kill switch is toggled off via `PATCH /admin/settings/auto-retry {"enabled":false}`, the row stays `pending` across ticks — confirm that too, then re-enable.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/jobs/jobs.module.ts
git commit -m "feat(api): register job-failure listener + retry reconciler in JobsModule"
```

---

## Task 12: Frontend — dead-letter API client + types

Extend the existing `jobsApi` with the dead-letter list/actions and the auto-retry toggle, plus a typed row shape mirroring the `job_failure` columns the panel renders.

**Files:**
- Modify: `apps/frontend/src/api/jobs.ts`

- [ ] **Step 1: Add types and API calls**

In `apps/frontend/src/api/jobs.ts`, add the row type after the existing `JobStats` interface:

```typescript
export interface DeadLetterRow {
  id: string;
  dedupKey: string;
  jobName: string;
  errorClass: string;
  classification: 'transient' | 'permanent';
  failedReason: string | null;
  attemptsMade: number;
  retryGeneration: number;
  status: 'pending' | 'retrying' | 'needs_attention' | 'dead' | 'resolved';
  firstFailedAt: string;
  lastFailedAt: string;
  nextRetryAt: string | null;
}
```

Then extend the `jobsApi` object with these members (add inside the existing object literal):

```typescript
  deadLetter: () => api.get<DeadLetterRow[]>('/jobs/dead-letter').then((r) => r.data),
  deadLetterRetryNow: (id: string) =>
    api.post<{ ok: boolean }>(`/jobs/dead-letter/${id}/retry-now`).then((r) => r.data),
  deadLetterDismiss: (id: string) =>
    api.post<{ ok: boolean }>(`/jobs/dead-letter/${id}/dismiss`).then((r) => r.data),
  deadLetterRetryAll: () =>
    api.post<{ rearmed: number }>('/jobs/dead-letter/retry-all').then((r) => r.data),
  getAutoRetry: () =>
    api.get<{ autoRetryEnabled: boolean }>('/admin/settings/auto-retry').then((r) => r.data),
  setAutoRetry: (enabled: boolean) =>
    api
      .patch<{ autoRetryEnabled: boolean }>('/admin/settings/auto-retry', { enabled })
      .then((r) => r.data),
```

- [ ] **Step 2: Typecheck the frontend**

Run: `pnpm --filter @smanga/frontend typecheck` (or `pnpm --filter ./apps/frontend typecheck`)
Expected: PASS. If no `typecheck` script exists, run `pnpm --filter ./apps/frontend build` and expect success.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/jobs.ts
git commit -m "feat(frontend): dead-letter + auto-retry API client"
```

---

## Task 13: Frontend — generate the `/admin/jobs` page design override

Per project rule, generate a page override before writing the panel UI so it inherits MASTER tokens with panel-specific guidance.

**Files:**
- Create: `design-system/smanga/pages/admin-jobs.md` (generated)

- [ ] **Step 1: Read the design system master**

Read `design-system/smanga/MASTER.md` in full (tokens: Primary `#18181B`, CTA `#EC4899`, fonts, radii, transitions, accessibility) and any existing `design-system/smanga/pages/` entries to match house style.

- [ ] **Step 2: Generate the override**

Run:
```powershell
py .claude/skills/ui-ux-pro-max/scripts/search.py "admin jobs dead-letter queue panel: status table with classification badges, retry-now/dismiss row actions, bulk retry-all, kill-switch toggle" --design-system --persist -p "SManga" --page "admin-jobs"
```
Expected: writes `design-system/smanga/pages/admin-jobs.md`. If the skill is unavailable, hand-author the override capturing: reuse the existing stat-card / panel-container classes (`rounded-xl border border-border bg-bg`), badge tones for `transient` (neutral) vs `permanent` (warning/`--accent`), and a kill-switch styled like a settings toggle.

- [ ] **Step 3: Commit**

```bash
git add design-system/smanga/pages/admin-jobs.md
git commit -m "docs(design): /admin/jobs dead-letter panel override"
```

---

## Task 14: Frontend — `DeadLetterPanel` component + wire into `/admin/jobs`

A new panel below the existing "Job gần đây" table. It polls the dead-letter list (15s, gated on login like the other panels), renders a status/classification table with per-row **Retry now** / **Dismiss**, a bulk **Retry all**, and the **auto-retry kill switch**. Reuses the existing panel/badge/button class patterns from `jobs.tsx`.

**Files:**
- Create: `apps/frontend/src/components/admin/DeadLetterPanel.tsx`
- Modify: `apps/frontend/src/routes/admin/jobs.tsx`

- [ ] **Step 1: Create the panel component**

Create `apps/frontend/src/components/admin/DeadLetterPanel.tsx`:

```tsx
import { type DeadLetterRow, jobsApi } from '@/api/jobs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw, X } from 'lucide-react';

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-bg-subtle text-fg-muted border-border',
  retrying: 'bg-accent/15 text-accent border-accent/30',
  needs_attention: 'bg-destructive/15 text-destructive border-destructive/30',
  dead: 'bg-destructive/15 text-destructive border-destructive/30',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ retry',
  retrying: 'Đang retry',
  needs_attention: 'Cần xử lý',
  dead: 'Đã bỏ cuộc',
};

function formatNext(next: string | null): string {
  if (!next) return '—';
  const d = new Date(next);
  return d.toLocaleString('vi-VN');
}

export function DeadLetterPanel({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();

  const rowsQ = useQuery({
    queryKey: ['jobs', 'dead-letter'],
    queryFn: jobsApi.deadLetter,
    enabled,
    refetchInterval: enabled ? 15000 : false,
    retry: false,
  });

  const autoRetryQ = useQuery({
    queryKey: ['jobs', 'auto-retry'],
    queryFn: jobsApi.getAutoRetry,
    enabled,
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['jobs'] });

  const retryNow = useMutation({
    mutationFn: (id: string) => jobsApi.deadLetterRetryNow(id),
    onSuccess: invalidate,
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => jobsApi.deadLetterDismiss(id),
    onSuccess: invalidate,
  });
  const retryAll = useMutation({
    mutationFn: jobsApi.deadLetterRetryAll,
    onSuccess: (data) => {
      invalidate();
      window.alert(`Đã đưa ${data.rearmed} mục vào hàng đợi retry.`);
    },
  });
  const toggleAutoRetry = useMutation({
    mutationFn: (next: boolean) => jobsApi.setAutoRetry(next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs', 'auto-retry'] }),
  });

  const rows: DeadLetterRow[] = rowsQ.data ?? [];
  const autoRetryOn = autoRetryQ.data?.autoRetryEnabled ?? true;

  return (
    <div className="rounded-xl border border-border bg-bg overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="font-sans font-semibold text-base">Cần xử lý / Dead Letter</h2>
          <span className="text-xs text-fg-muted tabular-nums">{rows.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRetryOn}
              disabled={toggleAutoRetry.isPending}
              onChange={(e) => toggleAutoRetry.mutate(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
            />
            Tự động retry
          </label>
          {rows.length > 0 && (
            <button
              type="button"
              disabled={retryAll.isPending}
              onClick={() => retryAll.mutate()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm border border-border hover:border-fg/40 hover:bg-bg-subtle/60 disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {retryAll.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Retry tất cả
            </button>
          )}
        </div>
      </div>

      {rowsQ.isLoading ? (
        <p className="text-sm text-fg-muted p-8 text-center">Đang tải...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted p-8 text-center">Không có job nào cần xử lý.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-fg-muted border-b border-border">
                <th className="px-5 py-2 font-medium">Job</th>
                <th className="px-5 py-2 font-medium">Lỗi</th>
                <th className="px-5 py-2 font-medium">Gen</th>
                <th className="px-5 py-2 font-medium">Retry kế</th>
                <th className="px-5 py-2 font-medium">Trạng thái</th>
                <th className="px-5 py-2 font-medium text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-2">
                    <div className="font-medium">{r.jobName}</div>
                    <div className="text-xs text-fg-muted truncate max-w-[22ch]">{r.dedupKey}</div>
                  </td>
                  <td className="px-5 py-2">
                    <span
                      className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] border whitespace-nowrap ${
                        r.classification === 'permanent'
                          ? 'bg-destructive/15 text-destructive border-destructive/30'
                          : 'bg-bg-subtle text-fg-muted border-border'
                      }`}
                    >
                      {r.errorClass}
                    </span>
                    <div className="text-xs text-fg-muted truncate max-w-[28ch]">
                      {r.failedReason}
                    </div>
                  </td>
                  <td className="px-5 py-2 tabular-nums">{r.retryGeneration}</td>
                  <td className="px-5 py-2 text-xs text-fg-muted whitespace-nowrap">
                    {formatNext(r.nextRetryAt)}
                  </td>
                  <td className="px-5 py-2">
                    <span
                      className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] border whitespace-nowrap ${
                        STATUS_TONE[r.status] ?? STATUS_TONE.pending
                      }`}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-5 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        title="Retry ngay"
                        disabled={retryNow.isPending}
                        onClick={() => retryNow.mutate(r.id)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border hover:bg-bg-subtle/60 disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Bỏ qua"
                        disabled={dismiss.isPending}
                        onClick={() => dismiss.mutate(r.id)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border hover:bg-bg-subtle/60 disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render the panel on the jobs page**

In `apps/frontend/src/routes/admin/jobs.tsx`, add the import near the top (with the other component imports):

```tsx
import { DeadLetterPanel } from '@/components/admin/DeadLetterPanel';
```

Then render it just before the closing `</div>` of the page (after the "Job gần đây" panel `</div>`):

```tsx
      <DeadLetterPanel enabled={isLoggedIn} />
    </div>
  );
}
```

(`isLoggedIn` already exists in the component — it gates the existing polls.)

- [ ] **Step 3: Verify locally (per project rule — no blind pushes)**

Run the API (Task 11) and the frontend:
```powershell
pnpm dev:frontend
```
Open `http://localhost:3000/admin/jobs` (log in as admin). Insert a couple of fake rows (the psql `INSERT` from Task 11 Step 4, varying `dedup_key`, with one `classification='permanent', status='needs_attention'`). Confirm:
- The panel lists them with correct status/classification badges.
- **Retry now** on a `needs_attention` row flips it to `pending` (badge changes after refetch).
- **Dismiss** removes it from the list (status → resolved, filtered out).
- The **Tự động retry** checkbox reflects and toggles `auto_retry_enabled` (verify via `GET /admin/settings/auto-retry`).

- [ ] **Step 4: Capture Playwright MCP proof**

Per project rule (`feedback_smanga_test_with_playwright_before_push`), take a Playwright MCP screenshot of `/admin/jobs` showing the populated panel. Attach it to the task review. Clean up the fake rows afterward:
```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "DELETE FROM job_failure WHERE failed_reason LIKE '%smoke test%' OR failed_reason IS NULL;"
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/admin/DeadLetterPanel.tsx apps/frontend/src/routes/admin/jobs.tsx
git commit -m "feat(frontend): dead-letter panel on /admin/jobs with retry-now/dismiss + kill switch"
```

---

## Task 15: Full verification + finish

- [ ] **Step 1: Run the entire unit suite**

Run: `pnpm exec vitest run`
Expected: PASS — the pre-existing 30 tests plus all new specs (errors, retry-policy, job-failure schema, dead-letter util, listener, reconciler, jobs dead-letter, auto-retry). Confirm the count increased and nothing regressed.

- [ ] **Step 2: Build the API and frontend**

Run: `pnpm --filter ./apps/api build` and `pnpm --filter ./apps/frontend build`
Expected: both succeed (webpack bundles the new `@smanga/shared` retry-policy + `@smanga/db` schema through the existing aliases — no new workspace package was added, so no `webpack.config.js` alias change is needed).

- [ ] **Step 3: Re-confirm migration idempotency**

On a fresh boot (`pnpm dev:api` against a DB that already has migration 0012), confirm the entrypoint logs `migrations applied` and does NOT re-run 0012 (drizzle journal dedup). The `auto_retry_enabled` column and `job_failure` table persist.

- [ ] **Step 4: Self-review against the spec**

Re-read `docs/superpowers/specs/2026-06-10-job-retry-dead-letter-design.md` §§4–11 and confirm each requirement maps to a completed task (see the coverage table in the plan's self-review section below).

- [ ] **Step 5: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to decide merge/PR. Do NOT `git push` without explicit user request (project rule). Note: prod auto-deploys via Watchtower on push to `main`, so a bad push knocks `smanga.shop` offline — the Playwright proof from Task 14 and the green suite from Step 1 are the gate.

---

## Self-review (author's checklist — completed)

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §4 `job_failure` table (cols, enums, indexes, wiring) | Task 4 |
| §5 `classifyCrawlerError` + `FetchError.statusCode` prerequisite | Tasks 1, 2, 3 |
| §5 `backoffForGeneration` ladder | Task 3 |
| §6 lifecycle (insert/upsert, resolve, give-up, operator actions) | Tasks 6 (listener), 9 (operator) |
| §7 reconciler safety envelope (cadence, 200 cap, capacity gate, backoff, kill switch, re-enqueue fidelity) | Tasks 8, 10 |
| §8 components/files | All tasks (file structure section) |
| §9 admin UI panel | Tasks 12, 13, 14 |
| §10 testing (classifier, backoff, reconciler, listener) | Tasks 3, 6, 8 (+5, 9, 10) |
| §11 defaults | Task 3 (`MAX`/ladder), Task 8 (cadence/cap/high-water), Task 4 (`auto_retry_enabled` default ON) |
| §12 risks (in-process Error identity, dedupKey namespacing) | Task 3 (name fallback), Task 5 (prefixed keys) |

**2. Placeholder scan** — no TBD/“add error handling”/“similar to Task N”; every code step contains full code.

**3. Type consistency** — `dedupKeyForJob`/`priorityForJob` (Task 5) are consumed identically in the listener (Task 6) and reconciler (Task 8). `classifyCrawlerError`/`backoffForGeneration`/`MAX_RETRY_GENERATIONS` (Task 3) are imported with matching names in Task 6. `jobFailure` columns (Task 4) match every `.set()`/`.values()` shape used in Tasks 6, 8, 9. `DeadLetterRow` (Task 12) mirrors the `job_failure` columns the panel reads (Task 14). The reconciler picker keys off `status='pending'` consistently with the listener's `pending`/`needs_attention`/`dead` routing.

**Resolved spec deviations** (documented in Design Refinements): terminal-failure guard on the `failed` event; reconciler picks by `status` not `classification`; only three job types dead-lettered; reconciler index `(status, next_retry_at)`.
