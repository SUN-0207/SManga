# Story-Detail Chapter Browser + Read Buttons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/truyen/$slug`, add a "Đọc chương mới nhất" button beside "Đọc từ đầu", plus a "Tìm chương…" search bar and a Mới nhất / Cũ nhất / Đã đọc sort+filter control over the chapter list.

**Architecture:** Load the entire chapter list once via a new cached `GET …/chapters/all` endpoint; do search, sort, filter, and pagination client-side. The current `ChapterList` (grid + URL pagination) is split into a pure `filterSortChapters` helper, a presentational `ChapterGrid`, a `ClientPagination` control, and a stateful `ChapterBrowser` that composes them. "Đã đọc" derives from the user's reading-progress (furthest-read chapter), gated behind auth.

**Tech Stack:** NestJS 11 + Drizzle (api), Vite + React 19 + TanStack Query/Router + Tailwind + Lucide (frontend), vitest for unit tests.

**Spec:** `docs/superpowers/specs/2026-06-15-chapter-browser-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `apps/api/src/modules/stories/stories.service.ts` | `allChaptersBySlug(slug)` — return all chapters sorted asc | Modify (add method) |
| `apps/api/src/modules/stories/stories.controller.ts` | `GET by-slug/:slug/chapters/all` endpoint | Modify (add route) |
| `apps/api/src/modules/stories/stories.service.chapters-all.spec.ts` | Unit test for the service method | Create |
| `apps/frontend/src/lib/chapter-filter.ts` | `ChapterListItem` type, `normalizeForSearch`, `filterSortChapters` (pure) | Create |
| `apps/frontend/src/lib/chapter-filter.spec.ts` | Unit tests for the pure helpers | Create |
| `apps/frontend/src/components/reader/ChapterGrid.tsx` | Presentational chapter grid (crawled/uncrawled + read marker) | Create |
| `apps/frontend/src/components/reader/ClientPagination.tsx` | Client-side pagination control (callback-driven) | Create |
| `apps/frontend/src/components/reader/ChapterBrowser.tsx` | Stateful toolbar + grid + pagination composition | Create |
| `apps/frontend/src/api/stories.ts` | `listAllChapters(slug)` api function | Modify (add fn) |
| `apps/frontend/src/routes/truyen/$slug/index.tsx` | Wire two read buttons + ChapterBrowser + progress query | Modify |
| `apps/frontend/src/components/reader/ChapterList.tsx` | Superseded by the three new components | Delete |

**Test commands:**
- API: `pnpm --filter @smanga/api test <file-substring>`
- Frontend: `pnpm --filter @smanga/frontend test <file-substring>`
- Frontend typecheck: `pnpm --filter @smanga/frontend typecheck`

---

## Task 1: Backend `allChaptersBySlug` service method (TDD)

**Files:**
- Test: `apps/api/src/modules/stories/stories.service.chapters-all.spec.ts` (create)
- Modify: `apps/api/src/modules/stories/stories.service.ts` (add method after `chapterListBySlug`, ~line 503)

**Context:** `StoriesService` is constructed `new StoriesService(db, <second-arg>)`. Tests mock `db` as a chainable object (see `stories.service.counts.spec.ts`). The select chain used here is `.select(...).from(...).where(...).limit(1)` for the id lookup and `.select(...).from(...).where(...).orderBy(...).limit(N)` for the rows — both terminate at `.limit()`. `asc`, `eq`, `count`, `chapter`, `story`, `NotFoundException` are already imported in `stories.service.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/stories/stories.service.chapters-all.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StoriesService } from './stories.service';

describe('StoriesService.allChaptersBySlug', () => {
  // A select chain whose terminal `.limit()` resolves to `rows`.
  function chainResolving(rows: unknown[]) {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => Promise.resolve(rows),
    };
    return chain;
  }

  it('returns all chapters sorted ascending for a known slug', async () => {
    const items = [
      { index: '1.00', title: 'Ch 1', status: 'crawled' },
      { index: '2.00', title: 'Ch 2', status: 'crawled' },
    ];
    const select = vi
      .fn()
      .mockReturnValueOnce(chainResolving([{ id: 's1' }])) // id lookup
      .mockReturnValueOnce(chainResolving(items)); // chapter rows
    const svc = new StoriesService({ select } as never, {} as never);

    const res = await svc.allChaptersBySlug('dau-pha-thuong-khung');

    expect(res).toBe(items);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('throws NotFoundException when the slug is unknown', async () => {
    const select = vi.fn().mockReturnValueOnce(chainResolving([])); // empty id lookup
    const svc = new StoriesService({ select } as never, {} as never);

    await expect(svc.allChaptersBySlug('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @smanga/api test stories.service.chapters-all`
Expected: FAIL — `svc.allChaptersBySlug is not a function`.

- [ ] **Step 3: Add the service method**

In `apps/api/src/modules/stories/stories.service.ts`, immediately after the closing brace of `chapterListBySlug` (the method ending at ~line 503, `return { items, page, totalPages, total };` + `}`), insert:

```ts
  /** Public reader: the FULL chapter list (index/title/status only) for a
   * story, sorted ascending. The story-detail page loads this once and does
   * search/sort/filter/pagination client-side. LIMIT 5000 is a safety cap —
   * the largest real story is ~2k rows. Edge-cached at the controller. */
  async allChaptersBySlug(slug: string) {
    const [s] = await this.db
      .select({ id: story.id })
      .from(story)
      .where(eq(story.slug, slug))
      .limit(1);
    if (!s) throw new NotFoundException();
    return this.db
      .select({ index: chapter.index, title: chapter.title, status: chapter.status })
      .from(chapter)
      .where(eq(chapter.storyId, s.id))
      .orderBy(asc(chapter.index))
      .limit(5000);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @smanga/api test stories.service.chapters-all`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/stories/stories.service.ts apps/api/src/modules/stories/stories.service.chapters-all.spec.ts
git commit -m "feat(api): allChaptersBySlug service for full chapter list

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Backend endpoint `GET by-slug/:slug/chapters/all`

**Files:**
- Modify: `apps/api/src/modules/stories/stories.controller.ts` (add route just before the existing `@Get('by-slug/:slug/chapters')` at ~line 69)

**Context:** `@Get('by-slug/:slug/chapters')` already exists with a `Cache-Control` header. The new 4-segment route does not collide with the 3-segment chapters route or the 1-segment `@Get(':id')`, but registering it before the chapters route keeps specificity ordering clean. `Get`, `Header`, `Param`, `Query` are already imported.

- [ ] **Step 1: Add the endpoint**

In `apps/api/src/modules/stories/stories.controller.ts`, directly above the existing `@Get('by-slug/:slug/chapters')` block, insert:

```ts
  @Get('by-slug/:slug/chapters/all')
  @Header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  allChaptersBySlug(@Param('slug') slug: string) {
    return this.stories.allChaptersBySlug(slug);
  }

```

- [ ] **Step 2: Build to verify it compiles**

Run: `pnpm --filter @smanga/api typecheck`
Expected: no errors.

- [ ] **Step 3: Boot smoke (controller wiring)**

Run: `pnpm --filter @smanga/api test`
Expected: all existing api tests still PASS (no regressions).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/stories/stories.controller.ts
git commit -m "feat(api): GET by-slug/:slug/chapters/all endpoint (edge-cached)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Frontend pure helper `chapter-filter.ts` (TDD)

**Files:**
- Create: `apps/frontend/src/lib/chapter-filter.ts`
- Test: `apps/frontend/src/lib/chapter-filter.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/lib/chapter-filter.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type ChapterListItem, filterSortChapters, normalizeForSearch } from './chapter-filter';

const chapters: ChapterListItem[] = [
  { index: 1, title: 'Mở đầu', isCrawled: true },
  { index: 2, title: 'Hồi Sinh', isCrawled: true },
  { index: 3, title: 'Đại Chiến', isCrawled: true },
  { index: 12, title: 'Kết thúc', isCrawled: false },
];

describe('normalizeForSearch', () => {
  it('strips Vietnamese diacritics and lowercases', () => {
    expect(normalizeForSearch('Hồi Sinh')).toBe('hoi sinh');
  });
  it('maps đ/Đ to d', () => {
    expect(normalizeForSearch('Đại')).toBe('dai');
  });
});

describe('filterSortChapters', () => {
  const base = { query: '', sort: 'oldest' as const, readUpToIndex: null, filterRead: false };

  it('returns all chapters ascending by default (oldest)', () => {
    const r = filterSortChapters(chapters, base);
    expect(r.map((c) => c.index)).toEqual([1, 2, 3, 12]);
  });

  it('sorts descending when sort=newest', () => {
    const r = filterSortChapters(chapters, { ...base, sort: 'newest' });
    expect(r.map((c) => c.index)).toEqual([12, 3, 2, 1]);
  });

  it('matches title diacritics-insensitively', () => {
    const r = filterSortChapters(chapters, { ...base, query: 'hoi' });
    expect(r.map((c) => c.index)).toEqual([2]);
  });

  it('matches by chapter number', () => {
    const r = filterSortChapters(chapters, { ...base, query: '12' });
    expect(r.map((c) => c.index)).toEqual([12]);
  });

  it('filters to read chapters (index <= readUpToIndex)', () => {
    const r = filterSortChapters(chapters, { ...base, readUpToIndex: 2, filterRead: true });
    expect(r.map((c) => c.index)).toEqual([1, 2]);
  });

  it('returns empty when filterRead is on but readUpToIndex is null', () => {
    const r = filterSortChapters(chapters, { ...base, filterRead: true });
    expect(r).toEqual([]);
  });

  it('returns empty when nothing matches the query', () => {
    const r = filterSortChapters(chapters, { ...base, query: 'zzz' });
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @smanga/frontend test chapter-filter`
Expected: FAIL — cannot resolve `./chapter-filter`.

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/lib/chapter-filter.ts`:

```ts
export interface ChapterListItem {
  index: number;
  title: string;
  isCrawled: boolean;
}

export type ChapterSort = 'newest' | 'oldest';

export interface FilterSortOptions {
  query: string;
  sort: ChapterSort;
  readUpToIndex: number | null;
  filterRead: boolean;
}

/**
 * Lowercase + strip Vietnamese diacritics (combining marks AND đ→d) so chapter
 * search is accent-insensitive: "hoi sinh" matches "Hồi Sinh".
 */
export function normalizeForSearch(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '') // strip combining diacritical marks (NFD)
    .replace(/đ/g, 'd');
}

/**
 * Pure filter+sort over the full chapter list (client-side browsing).
 * - filterRead: keep only chapters with index <= readUpToIndex (empty when null).
 * - query: keep chapters whose normalized title contains the query OR whose
 *   index string contains the query's digits.
 * - sort: 'newest' = index desc, 'oldest' = index asc.
 */
export function filterSortChapters(
  chapters: ChapterListItem[],
  { query, sort, readUpToIndex, filterRead }: FilterSortOptions,
): ChapterListItem[] {
  let result = chapters;

  if (filterRead) {
    result = readUpToIndex == null ? [] : result.filter((c) => c.index <= readUpToIndex);
  }

  const trimmed = query.trim();
  if (trimmed) {
    const nq = normalizeForSearch(trimmed);
    const digits = trimmed.replace(/\D/g, '');
    result = result.filter((c) => {
      if (normalizeForSearch(c.title).includes(nq)) return true;
      return digits.length > 0 && String(c.index).includes(digits);
    });
  }

  return [...result].sort((a, b) => (sort === 'newest' ? b.index - a.index : a.index - b.index));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @smanga/frontend test chapter-filter`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/chapter-filter.ts apps/frontend/src/lib/chapter-filter.spec.ts
git commit -m "feat(frontend): chapter-filter pure helpers (search/sort/read filter)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `ChapterGrid` presentational component

**Files:**
- Create: `apps/frontend/src/components/reader/ChapterGrid.tsx`

**Context:** This is the crawled/uncrawled list rendering lifted verbatim from `ChapterList.tsx` (lines 24–54), with two changes: it imports `ChapterListItem` from `@/lib/chapter-filter` (not from itself), and it adds a muted "read" marker (a small Lucide `Check`) on chapters with `index <= readUpToIndex`. No pagination here.

- [ ] **Step 1: Create the component**

Create `apps/frontend/src/components/reader/ChapterGrid.tsx`:

```tsx
import type { ChapterListItem } from '@/lib/chapter-filter';
import { cleanChapterTitle } from '@/lib/chapter-title';
import { Link } from '@tanstack/react-router';
import { Check, Clock } from 'lucide-react';

export interface ChapterGridProps {
  slug: string;
  chapters: ChapterListItem[];
  readUpToIndex: number | null;
}

export function ChapterGrid({ slug, chapters, readUpToIndex }: ChapterGridProps) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-px">
      {chapters.map((c) => {
        const isRead = readUpToIndex != null && c.index <= readUpToIndex;
        return (
          <li key={c.index} className="border-b border-border/60 py-2.5">
            {c.isCrawled ? (
              <Link
                to="/truyen/$slug/chuong/$index"
                params={{ slug, index: String(c.index) }}
                search={{ commentsPage: 1 }}
                className="group flex items-baseline gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                <span
                  className={`font-sans font-semibold text-sm tabular-nums w-[5.25rem] shrink-0 transition-colors duration-200 ${
                    isRead ? 'text-fg-muted/50' : 'text-fg-muted/70 group-hover:text-fg'
                  }`}
                >
                  Chương {c.index}
                </span>
                <span
                  className={`text-sm leading-snug line-clamp-1 inline-flex items-center gap-1.5 transition-all duration-200 ${
                    isRead
                      ? 'text-fg-muted/60'
                      : 'group-hover:underline underline-offset-[3px] decoration-fg/40'
                  }`}
                >
                  {isRead && (
                    <Check className="h-3 w-3 shrink-0 text-accent/70" aria-label="Đã đọc" />
                  )}
                  {cleanChapterTitle(c.title)}
                </span>
              </Link>
            ) : (
              <span className="flex items-baseline gap-3 text-fg-muted/60" title="Chưa crawl">
                <span className="font-sans font-semibold text-sm tabular-nums w-[5.25rem] shrink-0">
                  Chương {c.index}
                </span>
                <span className="text-sm leading-snug line-clamp-1 flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  {cleanChapterTitle(c.title)}
                </span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors. (The component is not yet imported anywhere; this just verifies it compiles.)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/reader/ChapterGrid.tsx
git commit -m "feat(frontend): ChapterGrid presentational component + read marker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `ClientPagination` component

**Files:**
- Create: `apps/frontend/src/components/reader/ClientPagination.tsx`

**Context:** Same visual + windowing logic as the `Pagination` inside `ChapterList.tsx` (lines 62–150), but driven by an `onPageChange` callback and `<button>`s instead of TanStack Router `<Link>`s, since pagination is now client state.

- [ ] **Step 1: Create the component**

Create `apps/frontend/src/components/reader/ClientPagination.tsx`:

```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ClientPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const base =
  'inline-flex items-center justify-center min-w-9 h-9 px-3 rounded-full text-sm border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed';
const inactive = 'border-border hover:border-fg/40 hover:bg-bg-subtle/60';

export function ClientPagination({ currentPage, totalPages, onPageChange }: ClientPaginationProps) {
  const windowSize = 5;
  const start = Math.max(1, currentPage - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  const pages: number[] = [];
  for (let p = start; p <= end; p += 1) pages.push(p);

  return (
    <nav className="flex items-center justify-center gap-1.5 pt-6 flex-wrap" aria-label="Phân trang">
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className={`${base} ${inactive}`}
        aria-label="Trang trước"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {start > 1 && (
        <>
          <button type="button" onClick={() => onPageChange(1)} className={`${base} ${inactive}`}>
            1
          </button>
          {start > 2 && <span className="px-1 text-fg-muted text-xs">…</span>}
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPageChange(p)}
          aria-current={p === currentPage ? 'page' : undefined}
          className={p === currentPage ? `${base} border-fg bg-fg text-bg` : `${base} ${inactive}`}
        >
          {p}
        </button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-fg-muted text-xs">…</span>}
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            className={`${base} ${inactive}`}
          >
            {totalPages}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className={`${base} ${inactive}`}
        aria-label="Trang sau"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/reader/ClientPagination.tsx
git commit -m "feat(frontend): ClientPagination (callback-driven) component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `ChapterBrowser` stateful component

**Files:**
- Create: `apps/frontend/src/components/reader/ChapterBrowser.tsx`

**Context:** Owns `query`, `sort`, `filterRead`, `page` state; runs `filterSortChapters` (memoized); paginates 50/page client-side; renders the search input + segmented control (the "Đã đọc" pill only when `isAuthenticated`) + `ChapterGrid` + `ClientPagination`. Resets to page 1 whenever the result set changes. Renders the result count and empty states.

- [ ] **Step 1: Create the component**

Create `apps/frontend/src/components/reader/ChapterBrowser.tsx`:

```tsx
import { ChapterGrid } from '@/components/reader/ChapterGrid';
import { ClientPagination } from '@/components/reader/ClientPagination';
import { type ChapterListItem, type ChapterSort, filterSortChapters } from '@/lib/chapter-filter';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

const PAGE_SIZE = 50;

export interface ChapterBrowserProps {
  slug: string;
  chapters: ChapterListItem[];
  readUpToIndex: number | null;
  isAuthenticated: boolean;
}

const pill =
  'inline-flex items-center h-9 px-4 rounded-full text-sm border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const pillActive = 'border-fg bg-fg text-bg';
const pillInactive = 'border-border text-fg-muted hover:border-fg/40 hover:bg-bg-subtle';

export function ChapterBrowser({
  slug,
  chapters,
  readUpToIndex,
  isAuthenticated,
}: ChapterBrowserProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ChapterSort>('oldest');
  const [filterRead, setFilterRead] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => filterSortChapters(chapters, { query, sort, readUpToIndex, filterRead }),
    [chapters, query, sort, readUpToIndex, filterRead],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function setSortAndReset(next: ChapterSort) {
    setSort(next);
    setFilterRead(false);
    setPage(1);
  }
  function toggleReadAndReset() {
    setFilterRead((v) => !v);
    setPage(1);
  }
  function setQueryAndReset(next: string) {
    setQuery(next);
    setPage(1);
  }

  const sortActive = (s: ChapterSort) => sort === s && !filterRead;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-muted pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQueryAndReset(e.target.value)}
            placeholder="Tìm chương..."
            aria-label="Tìm chương"
            className="w-full h-10 pl-9 pr-3 rounded-md border border-border bg-bg text-sm placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors duration-200"
          />
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Sắp xếp và lọc chương">
          <button
            type="button"
            onClick={() => setSortAndReset('newest')}
            aria-pressed={sortActive('newest')}
            className={`${pill} ${sortActive('newest') ? pillActive : pillInactive}`}
          >
            Mới nhất
          </button>
          <button
            type="button"
            onClick={() => setSortAndReset('oldest')}
            aria-pressed={sortActive('oldest')}
            className={`${pill} ${sortActive('oldest') ? pillActive : pillInactive}`}
          >
            Cũ nhất
          </button>
          {isAuthenticated && (
            <button
              type="button"
              onClick={toggleReadAndReset}
              aria-pressed={filterRead}
              className={`${pill} ${filterRead ? pillActive : pillInactive}`}
            >
              Đã đọc
            </button>
          )}
        </div>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-fg-muted">
          Trang {safePage} / {totalPages} · {filtered.length} chương
        </p>
      )}

      {pageItems.length > 0 ? (
        <ChapterGrid slug={slug} chapters={pageItems} readUpToIndex={readUpToIndex} />
      ) : (
        <p className="text-center text-sm text-fg-muted py-12">
          {filterRead ? 'Bạn chưa đọc chương nào.' : 'Không tìm thấy chương nào.'}
        </p>
      )}

      {totalPages > 1 && (
        <ClientPagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/reader/ChapterBrowser.tsx
git commit -m "feat(frontend): ChapterBrowser (search + sort + read filter + paging)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Frontend api `listAllChapters`

**Files:**
- Modify: `apps/frontend/src/api/stories.ts` (add after `listChapters`, ~line 125)

- [ ] **Step 1: Add the api function**

In `apps/frontend/src/api/stories.ts`, after the `listChapters` function (ending ~line 125), append:

```ts
/** Plan 2026-06-15: the FULL chapter list (index/title/status) in one cached
 * request — the story-detail page does search/sort/filter/paging client-side. */
export async function listAllChapters(
  slug: string,
): Promise<{ index: string; title: string; status: string }[]> {
  const res = await api.get<{ index: string; title: string; status: string }[]>(
    `/stories/by-slug/${slug}/chapters/all`,
  );
  return res.data;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/stories.ts
git commit -m "feat(frontend): listAllChapters api function

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Wire the story-detail page + delete `ChapterList`

**Files:**
- Modify: `apps/frontend/src/routes/truyen/$slug/index.tsx`
- Delete: `apps/frontend/src/components/reader/ChapterList.tsx`

**Context:** Replace the paginated chapters query with `listAllChapters`; add the reading-progress query (auth-gated); render two read buttons (primary "Đọc từ đầu", outline "Đọc chương mới nhất" — the latter only when `latestChapterIndex != null`); replace `<ChapterList>` with `<ChapterBrowser>`; drop the `page` search param and the right-side count line. `ChapterList.tsx` is then unused and deleted.

- [ ] **Step 1: Update imports**

In `apps/frontend/src/routes/truyen/$slug/index.tsx`, change the imports at the top:

- Replace line 1 `import { getStoryBySlug, listChapters } from '@/api/stories';` with:
  ```ts
  import { getStoryBySlug, listAllChapters } from '@/api/stories';
  ```
- Replace line 6 `import { ChapterList } from '@/components/reader/ChapterList';` with:
  ```ts
  import { ChapterBrowser } from '@/components/reader/ChapterBrowser';
  ```
- Add these two imports (alongside the other `@/` imports):
  ```ts
  import { readingProgressApi } from '@/api/reading-progress';
  import { useAuthStore } from '@/stores/auth-store';
  ```

- [ ] **Step 2: Drop the `page` search param**

Replace the `validateSearch` (lines 22–25) with:

```ts
  validateSearch: (s: Record<string, unknown>) => ({
    commentsPage: Number(s.commentsPage) || 1,
  }),
```

Then delete the line `const { page } = Route.useSearch();` (line 37).

- [ ] **Step 3: Swap the chapters query + add auth/progress queries**

Replace the `chaptersQ` block (lines 44–47):

```ts
  const chaptersQ = useQuery({
    queryKey: ['chapters', slug, page],
    queryFn: () => listChapters(slug, page),
  });
```

with:

```ts
  const user = useAuthStore((st) => st.user);

  const chaptersQ = useQuery({
    queryKey: ['chapters-all', slug],
    queryFn: () => listAllChapters(slug),
  });

  const progressQ = useQuery({
    queryKey: ['reading-progress'],
    queryFn: () => readingProgressApi.list(),
    enabled: !!user,
  });
```

- [ ] **Step 4: Update the derived `items` + add `readUpToIndex`**

Replace the `items` block (lines 68–72):

```ts
  const items = (chaptersQ.data?.items ?? []).map((c) => ({
    index: Number(c.index),
    title: c.title,
    isCrawled: c.status === 'crawled',
  }));
```

with:

```ts
  const items = (chaptersQ.data ?? []).map((c) => ({
    index: Number(c.index),
    title: c.title,
    isCrawled: c.status === 'crawled',
  }));

  const progressRow = progressQ.data?.find((r) => r.storyId === s.id);
  const readUpToIndex = progressRow ? Number(progressRow.chapterIndex) : null;
```

(`s` is `storyQ.data`, defined just above on line 66 — `const s = storyQ.data;`.)

- [ ] **Step 5: Replace the read-buttons block**

Replace the action row (lines 144–155):

```tsx
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/truyen/$slug/chuong/$index"
                params={{ slug: s.slug, index: '1' }}
                search={{ commentsPage: 1 }}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-md border border-border-strong hover:bg-bg-subtle text-body font-semibold transition-colors duration-fast"
              >
                Đọc từ đầu
              </Link>
              {/* "Đọc tiếp Chương N" pink CTA — wired by Plan C when reading_progress exists */}
              <BookmarkToggle storyId={s.id} />
            </div>
```

with:

```tsx
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/truyen/$slug/chuong/$index"
                params={{ slug: s.slug, index: '1' }}
                search={{ commentsPage: 1 }}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-accent text-white font-semibold shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg cursor-pointer"
              >
                Đọc từ đầu
              </Link>
              {s.latestChapterIndex != null && (
                <Link
                  to="/truyen/$slug/chuong/$index"
                  params={{ slug: s.slug, index: String(s.latestChapterIndex) }}
                  search={{ commentsPage: 1 }}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-md border border-border-strong hover:bg-bg-subtle text-body font-semibold transition-colors duration-fast cursor-pointer"
                >
                  Đọc chương mới nhất
                </Link>
              )}
              {/* "Đọc tiếp Chương N" pink CTA — wired by Plan C when reading_progress exists */}
              <BookmarkToggle storyId={s.id} />
            </div>
```

- [ ] **Step 6: Replace the chapter-list section body**

Replace the header+list block (lines 162–185) inside `<section id="muc-luc" …>`:

```tsx
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
                Mục lục
              </p>
              <h2 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight">
                Danh sách chương
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Trang {page} / {chaptersQ.data?.totalPages ?? 1}
              {' · '}
              {chaptersQ.data?.total ?? 0} chương
            </p>
          </div>
          <div className="h-px w-full bg-gradient-to-r from-border via-border to-transparent mb-6" />
          <ChapterList
            slug={s.slug}
            chapters={items}
            currentPage={page}
            totalPages={chaptersQ.data?.totalPages ?? 1}
          />
        </div>
```

with:

```tsx
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
              Mục lục
            </p>
            <h2 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight">
              Danh sách chương
            </h2>
          </div>
          <div className="h-px w-full bg-gradient-to-r from-border via-border to-transparent mb-6" />
          <ChapterBrowser
            slug={s.slug}
            chapters={items}
            readUpToIndex={readUpToIndex}
            isAuthenticated={!!user}
          />
        </div>
```

- [ ] **Step 7: Delete the superseded component**

```bash
git rm apps/frontend/src/components/reader/ChapterList.tsx
```

- [ ] **Step 8: Typecheck + full frontend test run**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors (no remaining references to `ChapterList`, `listChapters`, or `page`).

Run: `pnpm --filter @smanga/frontend test`
Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/routes/truyen/$slug/index.tsx
git commit -m "feat(frontend): story-detail chapter browser + latest-chapter button

Replace paginated chapter list with client-side ChapterBrowser (search,
Mới nhất/Cũ nhất sort, Đã đọc filter), add 'Đọc chương mới nhất' button,
delete superseded ChapterList.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Local verification (Playwright MCP proof)

**Context:** Per the standing rule, prove the UI on localhost before any push. Prod auto-deploys via Watchtower; bad pushes knock smanga.shop offline. Dev api runs on PORT=3010 (OPSWAT holds :3001), so the Vite proxy must be temporarily pointed at :3010 and **reverted before the final commit**.

- [ ] **Step 1: Start the stack**

In separate terminals (see `CLAUDE.md` Local dev): `pnpm dev:db`, then api with `PORT=3010` + `DATABASE_URL`/`REDIS_URL`/`JWT_SECRET`, then `pnpm dev:frontend`.

- [ ] **Step 2: Temp-point the Vite proxy to :3010**

In `apps/frontend/vite.config.ts`, change the `/api` proxy `target` from `http://localhost:3001` to `http://localhost:3010`. **Do not commit this.**

- [ ] **Step 3: Verify with Playwright MCP**

Navigate to `http://localhost:3000/truyen/<a-slug-with-many-chapters>`. Verify and screenshot:
1. Two read buttons: "Đọc từ đầu" (pink) + "Đọc chương mới nhất" (outline) — the latter links to the latest crawled chapter.
2. Search "Tìm chương…" filters by number (type a chapter number) and by title text (diacritics-insensitive).
3. "Mới nhất" reverses order; "Cũ nhất" restores ascending.
4. Logged out: no "Đã đọc" pill. Log in (proof admin `pwadmin@test.com` / `playwrightpass123`), read a chapter so progress exists, return to the story page: "Đã đọc" pill appears, filters to read chapters, and read chapters show the check marker.
5. Client pagination works and the count line reflects filtered totals.

- [ ] **Step 4: Revert the proxy edit**

Restore `apps/frontend/vite.config.ts` `/api` target to `http://localhost:3001`. Confirm `git status` shows no change to `vite.config.ts`.

- [ ] **Step 5: Refresh the graph**

Run: `graphify update .`
(AST-only, no API cost — keeps `graphify-out/` current after the new files.)

- [ ] **Step 6: Report**

Summarize the screenshots as proof and tell the user the feature is ready to push (do NOT push without explicit instruction — remote is `SManga`, `git push SManga main`).

---

## Self-Review

**Spec coverage:**
- "Đọc chương mới nhất" button → Task 8 Step 5 (gated on `latestChapterIndex != null`). ✓
- "Tìm chương…" search (number + title, diacritics-insensitive) → Tasks 3 (logic) + 6 (input). ✓
- Mới nhất / Cũ nhất sort → Tasks 3 + 6. ✓
- "Đã đọc" filter, auth-gated, hidden for guests → Task 6 (`isAuthenticated` guard) + Task 8 (progress query, `enabled: !!user`). ✓
- Client-side load-all → Task 1/2 (endpoint) + Task 7 (api) + Task 8 (query swap). ✓
- Read marker → Task 4. ✓
- Empty states (no results / no read chapters) → Task 6. ✓
- Client pagination, reset-on-change, filtered count line → Task 6. ✓
- Retire `?page=` → Task 8 Step 2. ✓
- Backend method + endpoint + cache header + 404 → Tasks 1 + 2. ✓
- Unit tests (filterSortChapters; allChaptersBySlug) → Tasks 3 + 1. ✓
- Playwright proof + button hierarchy (Đọc từ đầu primary pink) → Tasks 8 + 9. ✓

**Type consistency:** `ChapterListItem` defined once in `chapter-filter.ts` (Task 3), imported by `ChapterGrid` (Task 4) and `ChapterBrowser` (Task 6). `ChapterSort` shared between helper and browser. `allChaptersBySlug` returns rows whose shape (`{index,title,status}`) matches `listAllChapters`'s return type and the story page's `items` mapping. `readUpToIndex: number | null` consistent across ChapterGrid/ChapterBrowser/story page. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The one retained comment ("Đọc tiếp Chương N" pink CTA) is pre-existing and intentionally left for a future feature (out of scope per spec). ✓
