# Perf Phase 1 — Database & Query Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public browse query stop aggregating the entire chapter table per request (measured 1.19s TTFB → target <300ms), turn the 2.45s needs-crawl count into an index probe, and stop admin pages from hammering Postgres (4 parallel counts per keystroke, 30s full-table SUM poll, 1,991-row unbounded detail fetch).

**Architecture:** Two new indexes (`story(updated_at DESC)`, partial `chapter(story_id) WHERE status IN ('pending','failed')`); `stories.list()` reworked from non-correlated `GROUP BY` subqueries to `LEFT JOIN LATERAL` so aggregation runs only for the ≤48 paginated rows; the `needs-crawl` filter becomes an `EXISTS` served by the partial index; one `GET /stories/counts` endpoint replaces 4 parallel count queries; `storageStats` gets a 5-min server cache; the admin chapters endpoint paginates and returns server-computed status counts.

**Tech Stack:** NestJS 11 + Drizzle (raw `sql` tagged queries), Postgres, Vite + React 19 + TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-performance-remediation-design.md` §3 (Phase 1) — read it first. Phases 2–4 are separate future plans.

---

## Running tests (authoritative)

Per-package vitest configs (root `pnpm exec vitest run` does NOT work for api/frontend/db specs):

| Package | Command |
|---|---|
| `@smanga/api` | `pnpm --filter @smanga/api exec vitest run src/modules/<...>/<file>` (collection ~20s) |
| `@smanga/db` | `pnpm --filter @smanga/db exec vitest run tests/<file>` |
| `@smanga/frontend` | `pnpm --filter @smanga/frontend typecheck` / `build` (no new FE unit tests this phase) |
| all | `pnpm test` |

**Pre-commit hook** (lefthook): `biome check` on staged files + full-monorepo `pnpm typecheck`. Before each commit: `pnpm exec biome check --write <changed files>`, re-stage. Never `--no-verify`. Never `git add -A` (commit only the listed paths). Never push without explicit user instruction.

**Dev DB caveat:** the dev Postgres journal is drifted (stuck at 0008; 0009–0012 were applied out-of-band), so `pnpm db:migrate` FAILS on dev at 0009. Apply new migrations to dev **directly via psql** (Task 1 Step 5 shows how). Prod's journal is clean — prod applies normally via boot-migrate.

---

## File structure

| File | Change |
|---|---|
| `packages/db/src/schema/story.ts` | + `story_updated_at_idx` on `updated_at DESC` |
| `packages/db/src/schema/chapter.ts` | + partial `chapter_needs_crawl_idx` |
| `packages/db/src/migrations/0013_*.sql` + meta | generated (2 CREATE INDEX only) |
| `packages/db/tests/perf-indexes.test.ts` | **new** — index presence assertions |
| `apps/api/src/modules/stories/stories.service.ts` | `list()` LATERAL rework; `counts()` new; `storageStats` cache; `listChaptersByStoryId` pagination+counts |
| `apps/api/src/modules/stories/stories.controller.ts` | + `GET /stories/counts`; `adminChapters` page params |
| `apps/api/src/modules/stories/stories.service.counts.spec.ts` | **new** — counts/storageStats/chapters unit tests |
| `apps/frontend/src/api/stories.ts` | + `getStoriesCounts`, `AdminChaptersResponse` |
| `apps/frontend/src/routes/admin/stories/index.tsx` | 4 count queries → 1 (+AbortSignal), debounce 400ms |
| `apps/frontend/src/routes/admin/stories/$id.tsx` | server counts + paginated chapter table |
| `apps/frontend/src/routes/admin/index.tsx` | storage poll → staleTime; jobs poll 10s→30s |

---

## Task 1: Indexes (schema + migration)

**Files:**
- Modify: `packages/db/src/schema/story.ts` (index block, ~lines 48-53)
- Modify: `packages/db/src/schema/chapter.ts` (imports + index block)
- Test: `packages/db/tests/perf-indexes.test.ts` (Create)
- Generated: `packages/db/src/migrations/0013_*.sql` + `meta/`

- [ ] **Step 1: Write the failing test**

Create `packages/db/tests/perf-indexes.test.ts`:

```typescript
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { chapter } from '../src/schema/chapter.js';
import { story } from '../src/schema/story.js';

describe('perf indexes (spec 2026-06-11 §3.2)', () => {
  it('story has the updated_at top-N index', () => {
    const names = getTableConfig(story).indexes.map((i) => i.config.name);
    expect(names).toContain('story_updated_at_idx');
  });

  it('chapter has the partial needs-crawl index with a WHERE clause', () => {
    const idx = getTableConfig(chapter).indexes.find(
      (i) => i.config.name === 'chapter_needs_crawl_idx',
    );
    expect(idx).toBeDefined();
    expect(idx?.config.where).toBeDefined(); // partial index
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smanga/db exec vitest run tests/perf-indexes.test.ts`
Expected: FAIL — neither index name found.

- [ ] **Step 3: Add the indexes to the schema**

In `packages/db/src/schema/story.ts`, the index block currently reads:

```typescript
  (t) => ({
    searchIdx: index('story_search_idx').using(
      'gin',
      sql`immutable_unaccent(lower(${t.title} || ' ' || coalesce(${t.author}, ''))) gin_trgm_ops`,
    ),
    lastChapterIdx: index('story_last_chapter_idx').on(t.lastChapterAt),
  }),
```

Add one line so it becomes:

```typescript
  (t) => ({
    searchIdx: index('story_search_idx').using(
      'gin',
      sql`immutable_unaccent(lower(${t.title} || ' ' || coalesce(${t.author}, ''))) gin_trgm_ops`,
    ),
    lastChapterIdx: index('story_last_chapter_idx').on(t.lastChapterAt),
    // Serves the public list's ORDER BY updated_at DESC LIMIT N top-N.
    updatedAtIdx: index('story_updated_at_idx').on(t.updatedAt.desc()),
  }),
```

In `packages/db/src/schema/chapter.ts`: add `index` to the `drizzle-orm/pg-core` import and `sql` from `drizzle-orm`:

```typescript
import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
```

and change the index block from:

```typescript
  (t) => ({
    uniqStoryIndex: uniqueIndex('chapter_story_index_uniq').on(t.storyId, t.index),
  }),
```

to:

```typescript
  (t) => ({
    uniqStoryIndex: uniqueIndex('chapter_story_index_uniq').on(t.storyId, t.index),
    // Partial index for "has uncrawled/errored chapters": the needs-crawl
    // EXISTS probe and crawl-missing selects become empty-range index probes
    // instead of heap walks over every chapter of fully-crawled stories.
    needsCrawlIdx: index('chapter_needs_crawl_idx')
      .on(t.storyId)
      .where(sql`${t.status} IN ('pending', 'failed')`),
  }),
```

- [ ] **Step 4: Run test, then generate the migration**

Run: `pnpm --filter @smanga/db exec vitest run tests/perf-indexes.test.ts`
Expected: PASS (2 tests).

Run: `pnpm --filter @smanga/db generate`
Expected: a new `packages/db/src/migrations/0013_<name>.sql` containing **exactly two statements** (`CREATE INDEX "story_updated_at_idx" ... (updated_at DESC)` and `CREATE INDEX "chapter_needs_crawl_idx" ... WHERE status IN (...)`) plus journal/snapshot updates. **If anything else appears, STOP** — that means schema drift regressed; investigate before committing.

- [ ] **Step 5: Apply to dev via psql (journal is drifted — see header note)**

```powershell
docker exec -i smanga-postgres psql -U smanga -d smanga -v ON_ERROR_STOP=1 < packages/db/src/migrations/0013_<name>.sql
docker exec smanga-postgres psql -U smanga -d smanga -c "\di story_updated_at_idx; \di chapter_needs_crawl_idx"
```
Expected: both indexes listed.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/story.ts packages/db/src/schema/chapter.ts packages/db/src/migrations/ packages/db/tests/perf-indexes.test.ts
git commit -m "feat(db): updated_at top-N index + partial needs-crawl chapter index"
```

---

## Task 2: `stories.list()` LATERAL rework

**Files:**
- Modify: `apps/api/src/modules/stories/stories.service.ts` (the `crawlFilter` block ~152-158 and the SQL template ~180-214; row generics and `arr.map` mapping are UNCHANGED)

- [ ] **Step 1: Replace the `crawlFilter` fragment**

Current:

```typescript
    // Discovered (discovery complete) stories that still have uncrawled or
    // errored chapters. References the joined `c` subquery's aggregates.
    const crawlFilter =
      crawlState === 'needs-crawl'
        ? sql`AND s.discovery_status = 'complete'
              AND COALESCE(c.pending_count, 0) + COALESCE(c.failed_count, 0) > 0`
        : sql``;
```

New (EXISTS — no reference to the lateral alias, so the planner can filter rows BEFORE running the lateral aggregates, and the partial index serves the probe):

```typescript
    // Discovered (discovery complete) stories that still have uncrawled or
    // errored chapters. EXISTS probes chapter_needs_crawl_idx (partial) —
    // deliberately independent of the lateral aggregates below so filtering
    // happens before per-row aggregation.
    const crawlFilter =
      crawlState === 'needs-crawl'
        ? sql`AND s.discovery_status = 'complete'
              AND EXISTS (SELECT 1 FROM chapter pch
                          WHERE pch.story_id = s.id AND pch.status IN ('pending','failed'))`
        : sql``;
```

- [ ] **Step 2: Replace the SQL template (subqueries → LATERAL)**

Replace the entire `sql\`...\`` template passed to `this.db.execute<...>(...)` (currently `SELECT ... FROM story s ... LEFT JOIN ( SELECT story_id, avg... ) r ... LEFT JOIN ( SELECT story_id, MAX(index) FILTER ... ) c ... WHERE 1=1 ... ORDER BY ... LIMIT ...`) with:

```typescript
    sql`
      SELECT
        s.id, s.slug, s.title, s.author, s.status,
        s.total_chapters, s.view_count, s.updated_at,
        (s.cover IS NOT NULL)  AS has_cover,
        s.discovery_status, s.discovery_error, s.discovered_at,
        s.featured,
        r.avg                  AS rating_avg,
        COALESCE(r.cnt, 0)     AS rating_count,
        c.latest_chapter_index AS latest_chapter_index,
        COALESCE(c.crawled_count, 0) AS crawled_count,
        COALESCE(c.pending_count, 0) AS pending_count,
        COALESCE(c.failed_count, 0)  AS failed_count
      FROM story s
      ${genreJoin}
      LEFT JOIN LATERAL (
        SELECT avg(value)::numeric(3,2) AS avg,
               count(*)::int            AS cnt
        FROM rating
        WHERE rating.story_id = s.id
      ) r ON true
      LEFT JOIN LATERAL (
        SELECT MAX(ch.index) FILTER (WHERE ch.status = 'crawled')      AS latest_chapter_index,
               COUNT(*)      FILTER (WHERE ch.status = 'crawled')::int AS crawled_count,
               COUNT(*)      FILTER (WHERE ch.status = 'pending')::int AS pending_count,
               COUNT(*)      FILTER (WHERE ch.status = 'failed')::int  AS failed_count
        FROM chapter ch
        WHERE ch.story_id = s.id
      ) c ON true
      WHERE 1=1 ${featuredFilter} ${discoveryFilter} ${authorFilter} ${qFilter} ${crawlFilter}
      ORDER BY s.updated_at DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `
```

Leave the two row-type generics and the `arr.map(...)` mapping exactly as they are — column aliases are identical, so the response shape (`crawledChapters`, `pendingChapters`, `failedChapters`, `latestChapterIndex`, `ratingAvg`, `ratingCount`, …) is unchanged.

- [ ] **Step 3: Typecheck + existing suite**

Run: `pnpm --filter @smanga/api typecheck` → PASS.
Run: `pnpm --filter @smanga/api exec vitest run` → PASS (no spec covers `list()` directly; the e2e specs must stay green).

- [ ] **Step 4: Verify plan shape + behavior on dev**

With dev Postgres up (`pnpm dev:db`):

```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "EXPLAIN SELECT s.id, c.crawled_count FROM story s LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE ch.status='crawled')::int AS crawled_count FROM chapter ch WHERE ch.story_id = s.id) c ON true ORDER BY s.updated_at DESC LIMIT 24;"
```
Expected plan shape: `Nested Loop Left Join` with an inner `Index Only Scan` / `Index Scan using chapter_story_index_uniq` (or a small `Aggregate` over it) — and **NO `Seq Scan on chapter`** feeding a `HashAggregate`. (Dev has only ~60 stories so the story side may seq-scan — that's fine; the assertion is the chapter side. If the planner stubbornly seq-scans on tiny data, re-check with `SET enable_seqscan = off;` prefixed in the same psql call.)

Behavioral check — boot the api on dev (`PORT=3010`, dev DATABASE_URL/REDIS_URL) and verify identical output to before the rework:

```powershell
curl.exe -s "http://localhost:3010/api/v1/stories?limit=3" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.map(r=>({t:r.title.slice(0,16),c:r.crawledChapters,p:r.pendingChapters,f:r.failedChapters,li:r.latestChapterIndex,ra:r.ratingAvg})))"
curl.exe -s "http://localhost:3010/api/v1/stories?crawlState=needs-crawl&limit=5" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log('rows:',d.length)"
```
Expected: counts/latestChapterIndex/rating identical to pre-change values; needs-crawl returns the same stories as before (flip a chapter to pending first if dev has none, as in the crawl-state plan).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/stories/stories.service.ts
git commit -m "perf(api): lateral-join story list aggregates instead of whole-table GROUP BY"
```

---

## Task 3: Single-pass `GET /stories/counts`

**Files:**
- Modify: `apps/api/src/modules/stories/stories.service.ts` (new method after `count()`)
- Modify: `apps/api/src/modules/stories/stories.controller.ts` (new route after `count`, line ~40)
- Test: `apps/api/src/modules/stories/stories.service.counts.spec.ts` (Create)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/stories/stories.service.counts.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { StoriesService } from './stories.service';

describe('StoriesService.counts', () => {
  it('returns all four totals from one db round-trip', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [{ all_count: 38018, full_count: 38016, stub_count: 2, needs_crawl_count: 37 }],
    });
    const svc = new StoriesService({ execute } as never, {} as never);

    const res = await svc.counts();

    expect(res).toEqual({ all: 38018, full: 38016, stub: 2, needsCrawl: 37 });
    expect(execute).toHaveBeenCalledTimes(1); // the whole point: ONE query, not four
  });

  it('passes the q filter through and still makes one round-trip', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [{ all_count: 3, full_count: 3, stub_count: 0, needs_crawl_count: 1 }],
    });
    const svc = new StoriesService({ execute } as never, {} as never);

    const res = await svc.counts('kiếm');

    expect(res.needsCrawl).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns zeros when the table is empty', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const svc = new StoriesService({ execute } as never, {} as never);
    expect(await svc.counts()).toEqual({ all: 0, full: 0, stub: 0, needsCrawl: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smanga/api exec vitest run src/modules/stories/stories.service.counts.spec.ts`
Expected: FAIL — `svc.counts is not a function`.

- [ ] **Step 3: Add the service method**

In `stories.service.ts`, after the existing `count()` method (ends ~line 117), add:

```typescript
  /**
   * All four admin filter-pill totals in ONE pass (replaces 4 parallel
   * count() calls per keystroke). needs-crawl probes the partial
   * chapter_needs_crawl_idx, so the EXISTS is an empty-range check for
   * fully-crawled stories.
   */
  async counts(q?: string): Promise<{ all: number; full: number; stub: number; needsCrawl: number }> {
    const qFilter = q
      ? sql`AND immutable_unaccent(lower(s.title || ' ' || COALESCE(s.author,'')))
            ILIKE '%' || immutable_unaccent(lower(${q})) || '%'`
      : sql``;
    const r = await this.db.execute<{
      all_count: number;
      full_count: number;
      stub_count: number;
      needs_crawl_count: number;
    }>(sql`
      SELECT
        COUNT(*)::int AS all_count,
        COUNT(*) FILTER (WHERE s.discovery_status = 'complete')::int AS full_count,
        COUNT(*) FILTER (WHERE s.discovery_status <> 'complete')::int AS stub_count,
        COUNT(*) FILTER (
          WHERE s.discovery_status = 'complete'
            AND EXISTS (SELECT 1 FROM chapter ch
                        WHERE ch.story_id = s.id AND ch.status IN ('pending','failed'))
        )::int AS needs_crawl_count
      FROM story s
      WHERE 1=1 ${qFilter}
    `);
    const row = rowsOf<{
      all_count: number;
      full_count: number;
      stub_count: number;
      needs_crawl_count: number;
    }>(r)[0];
    return {
      all: Number(row?.all_count ?? 0),
      full: Number(row?.full_count ?? 0),
      stub: Number(row?.stub_count ?? 0),
      needsCrawl: Number(row?.needs_crawl_count ?? 0),
    };
  }
```

- [ ] **Step 4: Add the controller route**

In `stories.controller.ts`, directly after the `count` method (ends line 40) — and necessarily BEFORE the `:id` routes — add:

```typescript
  @Get('counts')
  counts(@Query('q') q?: string) {
    return this.stories.counts(q);
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @smanga/api exec vitest run src/modules/stories/stories.service.counts.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/stories/stories.service.ts apps/api/src/modules/stories/stories.controller.ts apps/api/src/modules/stories/stories.service.counts.spec.ts
git commit -m "perf(api): single-pass /stories/counts for the four admin filter pills"
```

---

## Task 4: `storageStats` server cache

**Files:**
- Modify: `apps/api/src/modules/stories/stories.service.ts` (`storageStats`, lines 38-71 + a class field)
- Test: extend `apps/api/src/modules/stories/stories.service.counts.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `stories.service.counts.spec.ts`:

```typescript
describe('StoriesService.storageStats cache', () => {
  it('serves the second call from cache (no extra db round-trips)', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ rows: [{ content_bytes: 1, chapters_with_content: 1, cover_bytes: 1, stories_with_cover: 1, chapter_target_total: 1 }] });
    const svc = new StoriesService({ execute } as never, {} as never);

    await svc.storageStats();
    const callsAfterFirst = execute.mock.calls.length; // 2 queries (chapter + story)
    await svc.storageStats();

    expect(execute.mock.calls.length).toBe(callsAfterFirst); // cached — no new queries
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @smanga/api exec vitest run src/modules/stories/stories.service.counts.spec.ts`
Expected: the new test FAILS (second call doubles the query count).

- [ ] **Step 3: Implement the cache**

In `stories.service.ts`: add above the class (next to `BULK_IMPORT_CAP`):

```typescript
/** storageStats runs two full-table aggregates (chapter SUM + story cover
 * SUM with detoast). The admin dashboard polls it — cache server-side so a
 * forgotten tab can't re-scan the library every 30s. */
const STORAGE_STATS_TTL_MS = 5 * 60_000;

interface StorageStats {
  contentBytes: number;
  coverBytes: number;
  totalBytes: number;
  chaptersWithContent: number;
  storiesWithCover: number;
  chapterTargetTotal: number;
}
```

Add the field inside the class (after the constructor):

```typescript
  private storageStatsCache: { value: StorageStats; expiresAt: number } | null = null;
```

Change `storageStats()`'s signature to `async storageStats(): Promise<StorageStats> {` and wrap it: first line —

```typescript
    const now = Date.now();
    if (this.storageStatsCache && this.storageStatsCache.expiresAt > now) {
      return this.storageStatsCache.value;
    }
```

and replace the final `return { ... }` with:

```typescript
    const value: StorageStats = {
      contentBytes,
      coverBytes,
      totalBytes: contentBytes + coverBytes,
      chaptersWithContent: Number(chapterRow?.chapters_with_content ?? 0),
      storiesWithCover: Number(coverRow?.stories_with_cover ?? 0),
      chapterTargetTotal: Number(coverRow?.chapter_target_total ?? 0),
    };
    this.storageStatsCache = { value, expiresAt: now + STORAGE_STATS_TTL_MS };
    return value;
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @smanga/api exec vitest run src/modules/stories/stories.service.counts.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/stories/stories.service.ts apps/api/src/modules/stories/stories.service.counts.spec.ts
git commit -m "perf(api): 5-min server cache on storageStats full-table aggregates"
```

---

## Task 5: Paginated admin chapters + server-side status counts

**Files:**
- Modify: `apps/api/src/modules/stories/stories.service.ts` (`listChaptersByStoryId`, lines ~406-420)
- Modify: `apps/api/src/modules/stories/stories.controller.ts` (`adminChapters`, lines 68-73)
- Test: extend `apps/api/src/modules/stories/stories.service.counts.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to the spec file:

```typescript
describe('StoriesService.listChaptersByStoryId (paginated)', () => {
  function chainTo(rows: unknown[]) {
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => Promise.resolve(rows),
    };
    return chain;
  }

  it('returns one page plus single-query status counts', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ rows: [{ total: 1991, crawled: 1985, pending: 5, failed: 1 }] });
    const items = [{ id: 'c1', index: '1.00', title: 'Ch 1', status: 'crawled', lastError: null, crawledAt: null, size: 1000 }];
    const select = vi.fn(() => chainTo(items));
    const svc = new StoriesService({ execute, select } as never, {} as never);

    const res = await svc.listChaptersByStoryId('s1', 2, 50);

    expect(res.page).toBe(2);
    expect(res.total).toBe(1991);
    expect(res.totalPages).toBe(Math.ceil(1991 / 50));
    expect(res.counts).toEqual({ crawled: 1985, pending: 5, failed: 1 });
    expect(res.items).toBe(items);
    expect(execute).toHaveBeenCalledTimes(1); // counts in ONE pass, not 3 client-side filters
  });

  it('clamps pageSize to 200', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ total: 10, crawled: 10, pending: 0, failed: 0 }] });
    const select = vi.fn(() => chainTo([]));
    const svc = new StoriesService({ execute, select } as never, {} as never);
    const res = await svc.listChaptersByStoryId('s1', 1, 99999);
    expect(res.totalPages).toBe(1); // 10 rows / clamped 200
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @smanga/api exec vitest run src/modules/stories/stories.service.counts.spec.ts`
Expected: FAIL — current method takes one arg and returns a bare array.

- [ ] **Step 3: Replace the service method**

Replace `listChaptersByStoryId` (lines 406-420) with:

```typescript
  /** Admin chapter table: paginated (the largest story has ~2k rows — never
   * ship them all) + status counts computed server-side in one pass. */
  async listChaptersByStoryId(storyId: string, page = 1, pageSize = 50) {
    const size = Math.min(Math.max(pageSize, 1), 200);
    const countsRes = await this.db.execute<{
      total: number;
      crawled: number;
      pending: number;
      failed: number;
    }>(sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'crawled')::int AS crawled,
             COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
             COUNT(*) FILTER (WHERE status = 'failed')::int  AS failed
      FROM chapter WHERE story_id = ${storyId}
    `);
    const c = rowsOf<{ total: number; crawled: number; pending: number; failed: number }>(
      countsRes,
    )[0];
    const total = Number(c?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / size));
    const items = await this.db
      .select({
        id: chapter.id,
        index: chapter.index,
        title: chapter.title,
        status: chapter.status,
        lastError: chapter.lastError,
        crawledAt: chapter.crawledAt,
        size: chapter.contentByteSize,
      })
      .from(chapter)
      .where(eq(chapter.storyId, storyId))
      .orderBy(asc(chapter.index))
      .limit(size)
      .offset((page - 1) * size);
    return {
      items,
      page,
      totalPages,
      total,
      counts: {
        crawled: Number(c?.crawled ?? 0),
        pending: Number(c?.pending ?? 0),
        failed: Number(c?.failed ?? 0),
      },
    };
  }
```

- [ ] **Step 4: Update the controller route**

Replace `adminChapters` (controller lines 68-73) with:

```typescript
  @Get(':id/chapters')
  @UseGuards(JwtAuthGuard)
  @Roles(['admin'])
  adminChapters(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.stories.listChaptersByStoryId(id, Number(page) || 1, Number(pageSize) || 50);
  }
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @smanga/api exec vitest run src/modules/stories/stories.service.counts.spec.ts` → PASS (6 tests).
Run: `pnpm --filter @smanga/api typecheck` → PASS.
(The frontend consumes the new shape in Task 6 — until then the admin detail page would break at runtime, which is why Tasks 5 and 6 ship back-to-back before any deploy.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/stories/stories.service.ts apps/api/src/modules/stories/stories.controller.ts apps/api/src/modules/stories/stories.service.counts.spec.ts
git commit -m "perf(api): paginate admin chapters + one-pass status counts"
```

---

## Task 6: Frontend wiring

**Files:**
- Modify: `apps/frontend/src/api/stories.ts`
- Modify: `apps/frontend/src/routes/admin/stories/index.tsx`
- Modify: `apps/frontend/src/routes/admin/stories/$id.tsx`
- Modify: `apps/frontend/src/routes/admin/index.tsx`

- [ ] **Step 1: API client additions**

In `apps/frontend/src/api/stories.ts`, after `getStoriesCount` add:

```typescript
export interface StoriesCounts {
  all: number;
  full: number;
  stub: number;
  needsCrawl: number;
}

/** One round-trip for all four admin filter-pill totals (replaces 4 parallel
 * getStoriesCount calls). Accepts React Query's AbortSignal so superseded
 * keystrokes cancel server-side work. */
export async function getStoriesCounts(q?: string, signal?: AbortSignal): Promise<StoriesCounts> {
  const res = await api.get<StoriesCounts>('/stories/counts', {
    params: { ...(q ? { q } : {}) },
    signal,
  });
  return res.data;
}
```

- [ ] **Step 2: Admin stories list — 1 counts query + 400ms debounce**

In `apps/frontend/src/routes/admin/stories/index.tsx`:

(a) Change the import from `@/api/stories` to include the new fn (and drop `getStoriesCount` if now unused):

```typescript
import { getStoriesCounts, listStories } from '@/api/stories';
```

(b) Debounce 250→400ms — the `setTimeout(..., 250)` in the search `useEffect` (line ~101) becomes `setTimeout(..., 400)` (update the comment above it to say 400ms).

(c) Replace the four count queries (lines ~139-158, `totalAllQ` through `totalNeedsCrawlQ`) and the four `const totalX =` lines with:

```typescript
  // ONE round-trip for all four filter-pill totals; AbortSignal cancels
  // superseded keystrokes' queries server-side.
  const countsQ = useQuery({
    queryKey: ['admin-stories', 'counts', q],
    queryFn: ({ signal }) => getStoriesCounts(qParam, signal),
    placeholderData: (prev) => prev,
  });

  const totalAll = countsQ.data?.all ?? 0;
  const totalFull = countsQ.data?.full ?? 0;
  const totalStub = countsQ.data?.stub ?? 0;
  const totalNeedsCrawl = countsQ.data?.needsCrawl ?? 0;
```

(The `activeTotal` block below stays as-is.)

- [ ] **Step 3: Admin story detail — server counts + paginated table**

In `apps/frontend/src/routes/admin/stories/$id.tsx`:

(a) Add imports: `import { useState } from 'react';` and `import { Pagination } from '@/components/ui/Pagination';`.

(b) Add the response type after `ChapterRow`:

```typescript
interface AdminChaptersResponse {
  items: ChapterRow[];
  page: number;
  totalPages: number;
  total: number;
  counts: { crawled: number; pending: number; failed: number };
}
```

(c) Replace the `chaptersQ` query and the derived lines (`const chapters = ...` through the three `.filter(...)` count lines) with:

```typescript
  const [chapterPage, setChapterPage] = useState(1);
  const chaptersQ = useQuery({
    queryKey: ['admin', 'story', id, 'chapters', chapterPage],
    queryFn: () =>
      api
        .get<AdminChaptersResponse>(`/stories/${id}/chapters`, {
          params: { page: chapterPage, pageSize: 50 },
        })
        .then((r) => r.data),
    enabled: storyQ.data?.discoveryStatus === 'complete',
    placeholderData: (prev) => prev,
  });

  const story = storyQ.data;
  const chapters = chaptersQ.data?.items ?? [];
```

and (inside the component, after the `isStub` line) the counts now come from the server:

```typescript
  const crawledCount = chaptersQ.data?.counts.crawled ?? 0;
  const pendingCount = chaptersQ.data?.counts.pending ?? 0;
  const failedCount = chaptersQ.data?.counts.failed ?? 0;
```

(d) In the chapter table panel: the header badge `{chapters.length}` becomes `{(chaptersQ.data?.total ?? 0).toLocaleString('vi-VN')}`, and immediately after the closing `</div>` of the `overflow-x-auto` table wrapper (still inside the panel), add:

```typescript
              <div className="px-5 py-3 border-t border-border">
                <Pagination
                  page={chapterPage}
                  totalPages={chaptersQ.data?.totalPages ?? 1}
                  isLoading={chaptersQ.isLoading}
                  onChange={setChapterPage}
                />
              </div>
```

(e) The `max-h-[600px] overflow-y-auto` on the table wrapper can stay (50 rows fit anyway).

- [ ] **Step 4: Dashboard polling**

In `apps/frontend/src/routes/admin/index.tsx`: in `storageQ` replace `refetchInterval: isLoggedIn ? 30_000 : false,` with `staleTime: 5 * 60_000,` (server caches 5 min anyway — polling is pure waste), and in `jobsStatsQ` change `refetchInterval: isLoggedIn ? 10_000 : false,` to `refetchInterval: isLoggedIn ? 30_000 : false,` (the server stats cache is 30s; polling faster than the cache only re-reads the cache).

- [ ] **Step 5: Typecheck + build**

Run: `pnpm --filter @smanga/frontend typecheck` → PASS (also catches any other `getStoriesCount(...)` 4-arg callers you must NOT break — `admin/index.tsx` uses the old single-count fn with no args; keep `getStoriesCount` exported).
Run: `pnpm --filter @smanga/frontend build` → success.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/api/stories.ts apps/frontend/src/routes/admin/stories/index.tsx apps/frontend/src/routes/admin/stories/$id.tsx apps/frontend/src/routes/admin/index.tsx
git commit -m "perf(frontend): single counts query + paginated admin chapters + calmer dashboard polling"
```

---

## Task 7: End-to-end verification + finish

- [ ] **Step 1: Full suite**

Run: `pnpm test`
Expected: all packages green (api gains 6 tests in the counts spec, db gains 2 index tests; 134 → 142 total).

- [ ] **Step 2: Live verify on dev (API :3010 + FE :3000, Vite proxy temporarily → :3010)**

- `/admin/stories`: pills show correct totals (compare against pre-change numbers); typing in search fires ONE `/stories/counts` request per debounce (Network tab), not four.
- `/admin/stories/$id` on a multi-page story: stat cards match the full-story counts (not just the visible page), table pages through chapters.
- Admin dashboard renders storage numbers; no 30s network chatter from `storage-stats`.
- Playwright MCP screenshot of `/admin/stories` + `$id` as the house-rule proof. Revert the Vite proxy tweak afterward.

- [ ] **Step 3: Finish + deploy + measure**

Use `superpowers:finishing-a-development-branch` (commit-only; push only on the user's say-so — push auto-deploys via CI→Watchtower). After the user pushes and Watchtower swaps (~7 min), re-run the baseline probes and record the deltas against spec §1:

```powershell
curl.exe -s -o /dev/null -w "browse  : %{http_code} ttfb=%{time_starttransfer}s\n" "https://smanga.shop/api/v1/stories?limit=24"
curl.exe -s -o /dev/null -w "counts  : %{http_code} ttfb=%{time_starttransfer}s\n" "https://smanga.shop/api/v1/stories/counts"
curl.exe -s -o /dev/null -w "needs-cr: %{http_code} ttfb=%{time_starttransfer}s\n" "https://smanga.shop/api/v1/stories/count?crawlState=needs-crawl"
```
Targets: browse TTFB < 0.3s-ish through the tunnel (was 1.19s); counts well under 0.5s (was 2.45s for one of four). Record the numbers in the session memory; they gate Phase 2 planning.

---

## Self-review (author's checklist — completed)

**Spec coverage (§3 Phase 1):** §3.1 LATERAL + EXISTS → Task 2; §3.2 both indexes → Task 1; §3.3 counts endpoint + FE swap + AbortSignal + 400ms debounce → Tasks 3+6; §3.4 storageStats cache + FE poll changes → Tasks 4+6; §3.5 paginated admin chapters + server counts → Tasks 5+6; §3 verification (EXPLAIN shape, suite, prod probes) → Tasks 2+7. No gaps.

**Placeholder scan:** all code steps carry full code; `0013_<name>` is the drizzle-generated filename captured at run time, not a placeholder.

**Type consistency:** `counts()` returns `{all, full, stub, needsCrawl}` = FE `StoriesCounts` (Task 3 ↔ 6); `listChaptersByStoryId(storyId, page, pageSize)` return shape `{items, page, totalPages, total, counts:{crawled,pending,failed}}` = FE `AdminChaptersResponse` (Task 5 ↔ 6); SQL aliases in the LATERAL template match the unchanged row generics (`crawled_count` etc., Task 2); `StorageStats` interface matches the existing FE `StorageStats` in `api/stories.ts` (field-identical). Index names in schema (Task 1) match the test assertions and the EXPLAIN expectations (Task 2).
