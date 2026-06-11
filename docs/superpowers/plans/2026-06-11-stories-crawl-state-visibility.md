# Admin Stories — Crawl-State Visibility & Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/admin/stories`, show each story's crawl progress (`crawled/total` + a status badge) and add a "Cần crawl" filter that surfaces discovered-but-incomplete stories, feeding the existing Crawl-missing bulk action.

**Architecture:** Compute per-story `crawled/pending/failed` counts on the fly by extending the list query's existing chapter subquery with `FILTER` aggregates; add an orthogonal `crawlState=needs-crawl` filter to the list + count endpoints. Frontend adds a progress column, a priority-ordered badge (pure, unit-tested helper), and a 4th filter chip. No DB schema change, no denormalization.

**Tech Stack:** NestJS 11 + Drizzle (raw `sql` tagged queries), Postgres, Vite + React 19 + TanStack Query/Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-stories-crawl-state-visibility-design.md` — read it first.

---

## Running tests (authoritative)

Per-package vitest configs (root `pnpm exec vitest run` does NOT work for api/frontend specs). Use:

| Package | Command |
|---|---|
| `@smanga/frontend` | `pnpm --filter @smanga/frontend exec vitest run <path>` (jsdom; `@/` alias) |
| `@smanga/frontend` typecheck | `pnpm --filter @smanga/frontend typecheck` |
| `@smanga/api` typecheck | `pnpm --filter @smanga/api typecheck` |
| all | `pnpm test` |

**Pre-commit hook** (lefthook) runs `biome check` on staged files + a full-monorepo `pnpm typecheck`. Before each commit: `pnpm exec biome check --write <changed files>` and re-stage. Never `--no-verify`.

**Local integration:** the dev API runs on **PORT=3010** (OPSWAT holds :3001). The `/stories` list + `/stories/count` endpoints are **public** (no auth guard), so curl needs no token. Local Postgres is the `smanga-postgres` docker container.

---

## File structure

| File | Change |
|---|---|
| `apps/api/src/modules/stories/dto/list-stories.dto.ts` | + `crawlState?: 'needs-crawl'` |
| `apps/api/src/modules/stories/stories.service.ts` | `list()`: extend `c` subquery with FILTER counts, add `crawlState` param + filter, add 3 count fields to row type + mapping. `count()`: add `crawlState` param + needs-crawl EXISTS. |
| `apps/api/src/modules/stories/stories.controller.ts` | thread `crawlState` through `list` + `count`. |
| `apps/frontend/src/api/stories.ts` | `StorySummary` + 3 count fields; `listStories` + `getStoriesCount` gain `crawlState?`. |
| `apps/frontend/src/lib/crawl-badge.ts` | **new** pure `crawlBadge(row)` helper. |
| `apps/frontend/src/lib/crawl-badge.spec.ts` | **new** unit tests (TDD). |
| `apps/frontend/src/routes/admin/stories/index.tsx` | `Filter` union, params, 4th count query + chip, CHAPTER → progress, new CRAWL column, empty-state copy. |

---

## Task 1: Backend — `crawlState` DTO param

**Files:**
- Modify: `apps/api/src/modules/stories/dto/list-stories.dto.ts`

- [ ] **Step 1: Add the field**

In `ListStoriesDto`, after the `discoveryStatus` field (ends line 35), add:

```typescript
  /**
   * Crawl-completeness filter (orthogonal to discoveryStatus).
   * - `needs-crawl` → discovery complete AND has ≥1 pending|failed chapter
   */
  @IsOptional()
  @IsIn(['needs-crawl'])
  crawlState?: 'needs-crawl';
```

(`IsOptional`, `IsIn` are already imported.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @smanga/api typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/stories/dto/list-stories.dto.ts
git commit -m "feat(api): add crawlState filter param to ListStoriesDto"
```

---

## Task 2: Backend — list query crawl counts + filter

Extend the `list()` method: (a) the chapter subquery `c` now aggregates all statuses (so its `WHERE status='crawled'` moves into a `FILTER` on the `MAX`), (b) the outer SELECT exposes the three counts, (c) a new `crawlState` parameter adds a WHERE clause, (d) the row type + mapping carry the counts.

**Files:**
- Modify: `apps/api/src/modules/stories/stories.service.ts` (`list`, ~lines 112-231)
- Modify: `apps/api/src/modules/stories/stories.controller.ts` (`list`, lines 18-29)

- [ ] **Step 1: Change the `list` signature**

Replace the signature (lines 112-120):

```typescript
  async list(
    page = 1,
    limit = 48,
    genreSlug?: string,
    featuredOnly?: boolean,
    discoveryStatus?: 'complete' | 'stub',
    author?: string,
    q?: string,
    crawlState?: 'needs-crawl',
  ) {
```

- [ ] **Step 2: Add the crawl filter fragment**

After the `qFilter` block (ends line 140), add:

```typescript
    // Discovered (discovery complete) stories that still have uncrawled or
    // errored chapters. References the joined `c` subquery's aggregates.
    const crawlFilter =
      crawlState === 'needs-crawl'
        ? sql`AND s.discovery_status = 'complete'
              AND COALESCE(c.pending_count, 0) + COALESCE(c.failed_count, 0) > 0`
        : sql``;
```

- [ ] **Step 3: Extend the `c` subquery + outer SELECT + WHERE**

Replace the SELECT through the WHERE line. The current SQL `c` subquery (lines 178-184) filters `WHERE status='crawled'`; move that into a `FILTER` on the `MAX` so the same subquery can also count every status. Add the three counts to the outer SELECT, and append `${crawlFilter}` to the WHERE.

Replace lines 160-185 (from `SELECT` through the `WHERE 1=1 ...` line) with:

```typescript
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
      LEFT JOIN (
        SELECT story_id,
               avg(value)::numeric(3,2) AS avg,
               count(*)::int            AS cnt
        FROM rating
        GROUP BY story_id
      ) r ON r.story_id = s.id
      LEFT JOIN (
        SELECT story_id,
               MAX(index) FILTER (WHERE status = 'crawled') AS latest_chapter_index,
               COUNT(*)   FILTER (WHERE status = 'crawled')::int AS crawled_count,
               COUNT(*)   FILTER (WHERE status = 'pending')::int AS pending_count,
               COUNT(*)   FILTER (WHERE status = 'failed')::int  AS failed_count
        FROM chapter
        GROUP BY story_id
      ) c ON c.story_id = s.id
      WHERE 1=1 ${featuredFilter} ${discoveryFilter} ${authorFilter} ${qFilter} ${crawlFilter}
```

(Leave the `ORDER BY ... LIMIT ... OFFSET` lines 186-188 unchanged.)

- [ ] **Step 4: Add the counts to both row-type declarations**

The raw row generic (lines 142-158) and the `rowsOf<...>` generic (lines 190-207) are identical type literals. In **both**, add after `latest_chapter_index: string | null;`:

```typescript
      crawled_count: number;
      pending_count: number;
      failed_count: number;
```

(The `::int` casts above mean pg returns numbers, not bigint strings.)

- [ ] **Step 5: Map the counts in the result**

In the `arr.map(...)` return object (lines 209-230), after the `latestChapterIndex` field add:

```typescript
      crawledChapters: Number(row.crawled_count ?? 0),
      pendingChapters: Number(row.pending_count ?? 0),
      failedChapters: Number(row.failed_count ?? 0),
```

- [ ] **Step 6: Thread `crawlState` through the controller**

In `stories.controller.ts`, replace the `list` method (lines 19-29) with:

```typescript
  @Get()
  list(@Query() q: ListStoriesDto) {
    return this.stories.list(
      q.page,
      q.limit,
      q.genre,
      q.featured,
      q.discoveryStatus,
      q.author,
      q.q,
      q.crawlState,
    );
  }
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @smanga/api typecheck`
Expected: PASS.

- [ ] **Step 8: Integration check against the live dev API**

Ensure the dev API is running on :3010 against local Postgres (the controller is public — no token needed). Seed a story with mixed chapter statuses, then verify the endpoint. From repo root:

```bash
# Find a discovery-complete story that has chapters, capture its id + a chapter id
docker exec smanga-postgres psql -U smanga -d smanga -t -c "SELECT s.id FROM story s WHERE s.discovery_status='complete' AND EXISTS(SELECT 1 FROM chapter c WHERE c.story_id=s.id) LIMIT 1;"
# Flip one of its chapters to 'pending' so it becomes needs-crawl (note the id to restore later)
docker exec smanga-postgres psql -U smanga -d smanga -c "UPDATE chapter SET status='pending' WHERE id=(SELECT id FROM chapter WHERE story_id='<STORY_ID>' AND status='crawled' LIMIT 1);"
# List returns the new count fields:
curl.exe -s "http://localhost:3010/api/v1/stories?limit=3" | head -c 800
# needs-crawl filter returns that story:
curl.exe -s "http://localhost:3010/api/v1/stories?crawlState=needs-crawl&limit=3" | head -c 800
```

Expected: list rows contain `"crawledChapters"`, `"pendingChapters"`, `"failedChapters"`; the `crawlState=needs-crawl` response includes the story you flipped. Restore the chapter afterward:
```bash
docker exec smanga-postgres psql -U smanga -d smanga -c "UPDATE chapter SET status='crawled' WHERE id='<CHAPTER_ID>';"
```

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/stories/stories.service.ts apps/api/src/modules/stories/stories.controller.ts
git commit -m "feat(api): per-story crawl counts + needs-crawl filter on stories list"
```

---

## Task 3: Backend — count endpoint `needs-crawl`

**Files:**
- Modify: `apps/api/src/modules/stories/stories.service.ts` (`count`, ~lines 73-110)
- Modify: `apps/api/src/modules/stories/stories.controller.ts` (`count`, lines 31-38)

- [ ] **Step 1: Change the `count` signature**

Replace lines 73-77:

```typescript
  async count(
    genreSlug?: string,
    discoveryStatus?: 'complete' | 'stub',
    q?: string,
    crawlState?: 'needs-crawl',
  ): Promise<{ total: number }> {
```

- [ ] **Step 2: Add the crawl filter fragment**

After the `qFilter` block (ends line 92), add:

```typescript
    // needs-crawl: discovery complete AND ≥1 pending|failed chapter. EXISTS
    // short-circuits on the chapter(story_id) index — no full aggregation.
    const crawlFilter =
      crawlState === 'needs-crawl'
        ? sql`AND s.discovery_status = 'complete'
              AND EXISTS (SELECT 1 FROM chapter ch
                          WHERE ch.story_id = s.id AND ch.status IN ('pending','failed'))`
        : sql``;
```

- [ ] **Step 3: Append the filter to both count branches**

Replace the genre-branch query WHERE (line 100) so it reads:
```typescript
        WHERE 1=1 ${discoveryFilter} ${qFilter} ${crawlFilter}
```
And the plain-branch query (line 106) so it reads:
```typescript
      SELECT COUNT(*)::int AS c FROM story s WHERE 1=1 ${discoveryFilter} ${qFilter} ${crawlFilter}
```

- [ ] **Step 4: Thread `crawlState` through the controller**

Replace the `count` method (lines 31-38):

```typescript
  @Get('count')
  count(
    @Query('genre') genre?: string,
    @Query('discoveryStatus') discoveryStatus?: 'complete' | 'stub',
    @Query('q') q?: string,
    @Query('crawlState') crawlState?: 'needs-crawl',
  ) {
    return this.stories.count(genre, discoveryStatus, q, crawlState);
  }
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @smanga/api typecheck`
Expected: PASS.

- [ ] **Step 6: Integration check**

With the dev API on :3010 and the same flipped-chapter story from Task 2 (or re-flip one):

```bash
curl.exe -s "http://localhost:3010/api/v1/stories/count?crawlState=needs-crawl"
curl.exe -s "http://localhost:3010/api/v1/stories/count"
```

Expected: the needs-crawl total is ≥1 and ≤ the unfiltered total. Restore the chapter status.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/stories/stories.service.ts apps/api/src/modules/stories/stories.controller.ts
git commit -m "feat(api): needs-crawl count on stories/count endpoint"
```

---

## Task 4: Frontend — API client types + params

**Files:**
- Modify: `apps/frontend/src/api/stories.ts`

- [ ] **Step 1: Add count fields to `StorySummary`**

In the `StorySummary` interface, after the `latestChapterIndex` field (line 25), add:

```typescript
  /** On-the-fly per-status chapter counts (crawled/pending/failed). Total =
   * sum of these three. 0 for metadata-only stories with no chapter rows. */
  crawledChapters: number;
  pendingChapters: number;
  failedChapters: number;
```

- [ ] **Step 2: Add `crawlState` to `listStories`**

Replace `listStories` (lines 28-49):

```typescript
export async function listStories(
  page = 1,
  limit = 48,
  genre?: string,
  featured?: boolean,
  discoveryStatus?: 'complete' | 'stub',
  author?: string,
  q?: string,
  crawlState?: 'needs-crawl',
): Promise<StorySummary[]> {
  const res = await api.get<StorySummary[]>('/stories', {
    params: {
      page,
      limit,
      ...(genre ? { genre } : {}),
      ...(featured === undefined ? {} : { featured: String(featured) }),
      ...(discoveryStatus ? { discoveryStatus } : {}),
      ...(author ? { author } : {}),
      ...(q ? { q } : {}),
      ...(crawlState ? { crawlState } : {}),
    },
  });
  return res.data;
}
```

- [ ] **Step 3: Add `crawlState` to `getStoriesCount`**

Replace `getStoriesCount` (lines 55-68):

```typescript
export async function getStoriesCount(
  genre?: string,
  discoveryStatus?: 'complete' | 'stub',
  q?: string,
  crawlState?: 'needs-crawl',
): Promise<number> {
  const res = await api.get<{ total: number }>('/stories/count', {
    params: {
      ...(genre ? { genre } : {}),
      ...(discoveryStatus ? { discoveryStatus } : {}),
      ...(q ? { q } : {}),
      ...(crawlState ? { crawlState } : {}),
    },
  });
  return res.data.total;
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: PASS (the list page doesn't reference the new fields yet — that's Task 6).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/api/stories.ts
git commit -m "feat(frontend): crawl counts + crawlState in stories api client"
```

---

## Task 5: Frontend — `crawlBadge` helper (TDD)

A pure function mapping a story row's counts to a badge descriptor. Kept separate so it's unit-tested without React.

**Files:**
- Create: `apps/frontend/src/lib/crawl-badge.ts`
- Test: `apps/frontend/src/lib/crawl-badge.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/lib/crawl-badge.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { crawlBadge } from './crawl-badge';

const base = {
  discoveryStatus: 'complete' as const,
  crawledChapters: 0,
  pendingChapters: 0,
  failedChapters: 0,
};

describe('crawlBadge', () => {
  it('returns kind=stub for not-yet-discovered stories (counts ignored)', () => {
    expect(crawlBadge({ ...base, discoveryStatus: 'pending', pendingChapters: 5 })).toMatchObject({
      kind: 'stub',
    });
  });

  it('failed wins over pending (most urgent)', () => {
    const b = crawlBadge({ ...base, crawledChapters: 9, pendingChapters: 3, failedChapters: 2 });
    expect(b).toMatchObject({ kind: 'failed', count: 2, crawled: 9, total: 14 });
  });

  it('untouched when discovered but nothing crawled yet', () => {
    expect(crawlBadge({ ...base, pendingChapters: 5 })).toMatchObject({
      kind: 'untouched',
      total: 5,
      crawled: 0,
    });
  });

  it('partial (Thiếu) when some crawled, some pending, none failed', () => {
    expect(crawlBadge({ ...base, crawledChapters: 9, pendingChapters: 5 })).toMatchObject({
      kind: 'partial',
      count: 5,
      crawled: 9,
      total: 14,
    });
  });

  it('full (Đủ) when everything crawled', () => {
    expect(crawlBadge({ ...base, crawledChapters: 6 })).toMatchObject({
      kind: 'full',
      crawled: 6,
      total: 6,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smanga/frontend exec vitest run src/lib/crawl-badge.spec.ts`
Expected: FAIL — `Cannot find module './crawl-badge'`.

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/lib/crawl-badge.ts`:

```typescript
import type { DiscoveryStatus } from '@/api/discover';

export type CrawlBadgeKind = 'stub' | 'failed' | 'untouched' | 'partial' | 'full';

export interface CrawlBadge {
  kind: CrawlBadgeKind;
  /** Count relevant to the kind: failed→failed count, partial→pending count, else 0. */
  count: number;
  crawled: number;
  /** crawled + pending + failed (actual chapter rows). */
  total: number;
}

/**
 * Decide a story's crawl badge from its on-the-fly chapter-status counts.
 * Priority (first match wins): stub → failed → untouched → partial → full.
 * See docs/superpowers/specs/2026-06-11-stories-crawl-state-visibility-design.md §5.2.
 */
export function crawlBadge(row: {
  discoveryStatus: DiscoveryStatus;
  crawledChapters: number;
  pendingChapters: number;
  failedChapters: number;
}): CrawlBadge {
  const crawled = row.crawledChapters;
  const pending = row.pendingChapters;
  const failed = row.failedChapters;
  const total = crawled + pending + failed;
  if (row.discoveryStatus !== 'complete') return { kind: 'stub', count: 0, crawled, total };
  if (failed > 0) return { kind: 'failed', count: failed, crawled, total };
  if (crawled === 0) return { kind: 'untouched', count: 0, crawled, total };
  if (pending > 0) return { kind: 'partial', count: pending, crawled, total };
  return { kind: 'full', count: 0, crawled, total };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @smanga/frontend exec vitest run src/lib/crawl-badge.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/crawl-badge.ts apps/frontend/src/lib/crawl-badge.spec.ts
git commit -m "feat(frontend): crawlBadge helper for per-story crawl state"
```

---

## Task 6: Frontend — list page (progress column, CRAWL badge, Cần crawl filter)

Wire everything into the stories list. All edits are in `apps/frontend/src/routes/admin/stories/index.tsx`.

**Files:**
- Modify: `apps/frontend/src/routes/admin/stories/index.tsx`

- [ ] **Step 1: Imports + Filter union + badge tone map**

At the top, add to the lucide import (line 11) the icons `CheckCircle2, Circle, XCircle, AlertTriangle` (merge into the existing `{ ... }`), and add the helper import:

```typescript
import { crawlBadge, type CrawlBadgeKind } from '@/lib/crawl-badge';
```

Change the `Filter` type (line 38):

```typescript
type Filter = 'all' | 'full' | 'stub' | 'needs-crawl';
```

After the `STATUS_TONE` map (ends line 36), add the crawl-badge presentation map:

```typescript
const CRAWL_BADGE: Record<
  Exclude<CrawlBadgeKind, 'stub'>,
  { label: (n: number) => string; tone: string; icon: typeof CheckCircle2 }
> = {
  full: { label: () => 'Đủ', tone: 'bg-positive/15 text-positive border-positive/30', icon: CheckCircle2 },
  failed: { label: (n) => `Lỗi ${n}`, tone: 'bg-destructive/15 text-destructive border-destructive/30', icon: XCircle },
  untouched: { label: () => 'Chưa crawl', tone: 'bg-bg-subtle text-fg-muted border-border', icon: Circle },
  partial: { label: (n) => `Thiếu ${n}`, tone: 'bg-accent/15 text-accent border-accent/30', icon: AlertTriangle },
};
```

- [ ] **Step 2: Params + the 4th count query**

Replace the `discoveryParam` line (line 76) with both params:

```typescript
  // 'needs-crawl' is its own axis — leave discoveryStatus unset; the server
  // forces discovery='complete' inside the needs-crawl filter.
  const discoveryParam = filter === 'full' ? 'complete' : filter === 'stub' ? 'stub' : undefined;
  const crawlStateParam = filter === 'needs-crawl' ? ('needs-crawl' as const) : undefined;
```

Update the `listStories` call (line 84) to pass the new arg:

```typescript
      listStories(page, PAGE_SIZE, undefined, undefined, discoveryParam, undefined, qParam, crawlStateParam),
```

After the `totalStubQ` query (ends line 103), add:

```typescript
  const totalNeedsCrawlQ = useQuery({
    queryKey: ['admin-stories', 'count', 'needs-crawl', q],
    queryFn: () => getStoriesCount(undefined, undefined, qParam, 'needs-crawl'),
  });
```

After `const totalStub = ...` (line 107) add, and update `activeTotal` (line 108):

```typescript
  const totalNeedsCrawl = totalNeedsCrawlQ.data ?? 0;
  const activeTotal =
    filter === 'full'
      ? totalFull
      : filter === 'stub'
        ? totalStub
        : filter === 'needs-crawl'
          ? totalNeedsCrawl
          : totalAll;
```

- [ ] **Step 3: Add the 4th filter chip**

After the `Chỉ metadata` FilterChip (ends line 213), add:

```typescript
            <FilterChip active={filter === 'needs-crawl'} onClick={() => changeFilter('needs-crawl')}>
              ⚠ Cần crawl ({totalNeedsCrawl.toLocaleString('vi-VN')})
            </FilterChip>
```

- [ ] **Step 4: Add the CRAWL column header**

After the `Chapter` `<th>` (ends line 260), add:

```typescript
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                    Crawl
                  </th>
```

- [ ] **Step 5: Change the CHAPTER cell to progress + add the CRAWL cell**

Replace the Chapter `<td>` (lines 309-311) with the progress cell followed by the new badge cell:

```typescript
                      <td className="px-3 py-3 tabular-nums text-fg">
                        {isStub ? (
                          <span className="text-fg-muted">—</span>
                        ) : (
                          `${r.crawledChapters}/${r.crawledChapters + r.pendingChapters + r.failedChapters}`
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {(() => {
                          const b = crawlBadge(r);
                          if (b.kind === 'stub') return <span className="text-fg-muted">—</span>;
                          const meta = CRAWL_BADGE[b.kind];
                          const Icon = meta.icon;
                          return (
                            <span
                              className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] border whitespace-nowrap ${meta.tone}`}
                            >
                              <Icon className="h-3 w-3" aria-hidden />
                              {meta.label(b.count)}
                            </span>
                          );
                        })()}
                      </td>
```

- [ ] **Step 6: Add the needs-crawl empty state**

In `StoriesEmptyState`, after the `filter === 'full'` block (ends line 366), add:

```typescript
  if (filter === 'needs-crawl') {
    return (
      <EmptyState
        illustration={<EmptySearch />}
        title="Không có truyện cần crawl"
        description="Mọi truyện đã khám phá đều đã crawl đủ chapter."
      />
    );
  }
```

- [ ] **Step 7: Typecheck + build**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: PASS.
Run: `pnpm --filter @smanga/frontend build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/routes/admin/stories/index.tsx
git commit -m "feat(frontend): crawl progress column + badge + Cần crawl filter on /admin/stories"
```

---

## Task 7: Verify end-to-end + finish

- [ ] **Step 1: Full suite**

Run: `pnpm test`
Expected: PASS across all packages (the new `crawl-badge.spec.ts` adds 5 frontend tests; nothing else regresses).

- [ ] **Step 2: Live visual check (Playwright MCP)**

With API on :3010 + frontend on :3000 (Vite `/api` proxy pointed at :3010 for the session), log in to `/admin/stories` as admin. Seed variety so the column/badge/filter are exercisable:

```bash
# Pick a discovery-complete story with chapters and create one of each state on it
docker exec smanga-postgres psql -U smanga -d smanga -c "UPDATE chapter SET status='pending' WHERE id IN (SELECT id FROM chapter WHERE story_id='<STORY_ID>' AND status='crawled' LIMIT 2);"
docker exec smanga-postgres psql -U smanga -d smanga -c "UPDATE chapter SET status='failed' WHERE id IN (SELECT id FROM chapter WHERE story_id='<STORY_ID>' AND status='crawled' LIMIT 1);"
```

Confirm: the `CHAPTER` column shows `crawled/total`, the `CRAWL` column shows the right badge (Lỗi wins when a failed chapter exists), the `⚠ Cần crawl (N)` chip count is non-zero and filtering shows that story, and selecting it → **Crawl missing** enqueues (Theo dõi ở Jobs). Take a Playwright MCP screenshot as proof. Restore the chapter statuses afterward:
```bash
docker exec smanga-postgres psql -U smanga -d smanga -c "UPDATE chapter SET status='crawled' WHERE story_id='<STORY_ID>' AND status IN ('pending','failed');"
```

- [ ] **Step 3: Finish**

Use `superpowers:finishing-a-development-branch`. Commit-only — do not push without explicit user request (prod auto-deploys via Watchtower on push). Revert the temporary `vite.config.ts` proxy tweak before finishing.

---

## Self-review (author's checklist — completed)

**Spec coverage:** §4.1 list counts → Task 2; §4.2 needs-crawl filter → Tasks 1+2; §4.3 count endpoint → Task 3; §5.1 progress column → Task 6; §5.2 badge (priority Lỗi→Chưa→Thiếu→Đủ) → Tasks 5+6; §5.3 filter chip → Task 6; §8 testing (crawlBadge unit + API integration) → Tasks 5, 2, 3, 7. No gaps.

**Placeholder scan:** every code step shows full code; `<STORY_ID>`/`<CHAPTER_ID>` are runtime values the engineer captures from the prior command, not placeholders in committed code.

**Type consistency:** `crawlState?: 'needs-crawl'` identical across DTO (Task 1), `list`/`count` service signatures (Tasks 2/3), controller (Tasks 2/3), and `listStories`/`getStoriesCount` (Task 4). Row count fields `crawledChapters`/`pendingChapters`/`failedChapters` identical across the API mapping (Task 2), `StorySummary` (Task 4), `crawlBadge` input (Task 5), and the list cell (Task 6). `CrawlBadgeKind` values (`stub|failed|untouched|partial|full`) match between `crawl-badge.ts` (Task 5) and the `CRAWL_BADGE` map (Task 6, which excludes `stub`). The `c` subquery's `MAX(index) FILTER (WHERE status='crawled')` preserves the existing `latestChapterIndex` semantics after removing the subquery's `WHERE status='crawled'`.
