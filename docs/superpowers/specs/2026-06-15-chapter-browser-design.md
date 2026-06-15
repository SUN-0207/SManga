# Story-Detail Chapter Browser + Read Buttons — Design

> **Status:** Approved 2026-06-15. Next step: writing-plans.
> **Scope:** Public reader story-detail page (`/truyen/$slug`). No admin changes.

## Goal

On the story-detail page add: (1) a second read button **"Đọc chương mới nhất"** beside the existing **"Đọc từ đầu"**; (2) a **"Tìm chương…"** search bar over the chapter list; (3) a **sort/filter** segmented control — **Mới nhất** / **Cũ nhất** / **Đã đọc**. Adapt the user's dark reference mockup to SManga's light design tokens.

## Decisions (locked)

- **Data loading:** load the *entire* chapter list once (client-side); search/sort/filter/pagination all run in the browser — no server round-trip per keystroke.
- **Search matches:** chapter **number** OR chapter **title** (diacritics-insensitive).
- **"Đã đọc" for guests:** pill is **hidden** when not logged in (no login-prompt state).
- **"Đọc chương mới nhất":** targets `story.latestChapterIndex` (floor of `MAX(chapter.index) WHERE status='crawled'`). Hidden when `latestChapterIndex == null`.
- **Button hierarchy:** "Đọc từ đầu" = primary pink `accent` CTA; "Đọc chương mới nhất" = secondary outline. (Bookmark toggle unchanged.)

## Architecture

### Backend — new lightweight "all chapters" endpoint

- **`GET /stories/by-slug/:slug/chapters/all`** → `{ index: string; title: string; status: string }[]`, sorted `index ASC`.
  - Header: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` (mirrors the existing `by-slug/:slug/chapters` endpoint).
  - Service: `StoriesService.allChaptersBySlug(slug)` — resolve story id by slug (404 if missing), then `SELECT index, title, status FROM chapter WHERE story_id = … ORDER BY index ASC LIMIT 5000`. The largest story is ~2k rows; the `LIMIT 5000` is a safety cap, not an expected boundary.
  - The existing paginated `chaptersBySlug` / `chapterListBySlug` is **left untouched**.
- **Frontend api:** `listAllChapters(slug): Promise<{ index: string; title: string; status: string }[]>` in `apps/frontend/src/api/stories.ts`. React Query key `['chapters-all', slug]`.

### "Đã đọc" data source

When authenticated, the story page calls `readingProgressApi.list()` and finds the row where `storyId === story.id`; `readUpToIndex = Number(row.chapterIndex)` (the furthest-read chapter — reading progress stores one row per story). The query is **disabled for guests** (`enabled: isAuthenticated`). "Đã đọc" therefore = chapters with `index <= readUpToIndex`. If the user is logged in but has no progress row for this story, `readUpToIndex = null` and the "Đã đọc" pill is shown but yields an empty (or hidden) result — see Behavior.

### Frontend components

The current `ChapterList.tsx` does grid rendering **and** URL-based pagination. Split it into focused units:

- **`ChapterBrowser.tsx`** (new — owns all interaction state):
  - Props: `{ slug: string; chapters: ChapterListItem[]; readUpToIndex: number | null; isAuthenticated: boolean }`.
  - State: `query: string`, `sort: 'newest' | 'oldest'`, `filterRead: boolean`, `clientPage: number`.
  - Composes: toolbar (search input + segmented control) → `ChapterGrid` → client-side `Pagination`.
- **`ChapterGrid.tsx`** (extracted from current `ChapterList`): pure presentational `<ul>` of items — keeps the existing crawled (`Link`) vs uncrawled (`Clock` icon, "Chưa crawl") rendering verbatim. Adds a subtle **read marker** (muted style) on chapters where `index <= readUpToIndex`, shown regardless of the active filter (data is already loaded).
- **Client-side `Pagination`**: reuse the existing visual style from `ChapterList`, but driven by an `onPageChange(page)` callback instead of TanStack Router `Link`s / `?page=`.
- **`filterSortChapters(chapters, { query, sort, readUpToIndex, filterRead })`** — pure helper (the TDD unit-test target). Returns the filtered+sorted array. Lives in `apps/frontend/src/lib/chapter-filter.ts`.

### Story page wiring (`routes/truyen/$slug/index.tsx`)

- Replace the paginated `listChapters(slug, page)` query with `listAllChapters(slug)` (`['chapters-all', slug]`).
- Render two read buttons + bookmark in the hero action row:
  - "Đọc từ đầu" → `/truyen/$slug/chuong/$index` `index='1'` — primary pink `accent` CTA.
  - "Đọc chương mới nhất" → `index = String(latestChapterIndex)` — secondary outline; rendered only when `latestChapterIndex != null`.
- Pass `chapters`, `readUpToIndex`, `isAuthenticated` to `<ChapterBrowser>`.
- Retire the chapter `?page=` search param (pagination is now client state); keep `commentsPage`.

## Behavior

- **Search** ("Tìm chương…"): normalize query and each chapter title with `lowercase + strip Vietnamese diacritics`. Match when the normalized title **contains** the normalized query, **or** (when the query is numeric) `String(index)` contains the digits. Empty query = no filter.
- **Sort:** `newest` = `index DESC`, `oldest` = `index ASC` (default `oldest`, matching today's order).
- **"Đã đọc":** segmented control renders `Mới nhất | Cũ nhất | [Đã đọc]`. The first two set `sort`; "Đã đọc" toggles `filterRead`. When `filterRead` is on, show only chapters with `index <= readUpToIndex`, sorted by the current `sort`. Pill hidden entirely for guests. If logged in with no progress (`readUpToIndex == null`), the filter yields an empty result with a "Bạn chưa đọc chương nào" empty state.
- **Client pagination:** 50 chapters/page over the filtered+sorted result. `clientPage` resets to 1 whenever `query`, `sort`, or `filterRead` changes. Pagination control shown only when result spans >1 page.
- **List header:** "Trang X / Y · N chương" where N = filtered count, Y = filtered page count.
- **Empty states:** no search results → "Không tìm thấy chương nào"; "Đã đọc" with no read chapters → "Bạn chưa đọc chương nào"; story with zero chapters → existing "Trang này chưa có chương nào." equivalent.

## Visual (light tokens)

Match the page's existing token usage exactly (the stale `MASTER.md` color block is superseded; use semantic tokens already in `$slug/index.tsx`):

- **Toolbar** sits between the "Danh sách chương" header and the grid. Search input: full-width on mobile, Lucide `Search` icon prefix, `rounded-md border border-border bg-bg`, `focus-visible:ring-2 focus-visible:ring-accent`, placeholder "Tìm chương…". Segmented control right-aligned (wraps below search on mobile).
- **Segmented pills:** active = `bg-fg text-bg` (matches existing pagination active state); inactive = `border border-border text-fg-muted hover:bg-bg-subtle hover:border-fg/40`. All `cursor-pointer`, `transition-all duration-200`, visible focus rings.
- **Read marker:** chapters `<= readUpToIndex` get a muted treatment (e.g. dimmed number + a small Lucide `Check`), never layout-shifting.
- A11y: search input has a label / `aria-label`; segmented control uses `aria-pressed`; `prefers-reduced-motion` respected. Responsive at 375/768/1024/1440.

## Testing

- **Unit (vitest):** `filterSortChapters` — numeric match, diacritics-insensitive title match, `newest`/`oldest` order, read-filter (`index <= readUpToIndex`), empty-query passthrough, empty result.
- **Backend:** `allChaptersBySlug` returns all chapters sorted ascending; throws `NotFoundException` on unknown slug. Add to the existing stories service test if one exists; otherwise a focused spec.
- **Playwright MCP proof** on `localhost` (dev API `:3010`, Vite proxy temp-pointed to `:3010`, reverted before commit) before suggesting any push: verify both read buttons, search filtering, the three sort/filter pills (logged-in to see "Đã đọc"), and pagination. Capture a screenshot as proof.

## Out of scope (YAGNI)

- Server-side chapter search/sort params (the load-all approach makes them unnecessary).
- A "Đọc tiếp Chương N" resume CTA (separate future feature — the code comment placeholder stays).
- Per-chapter read tracking beyond the single furthest-read row.
- Virtualized list rendering (50/page client slice is sufficient at ~2k rows).
