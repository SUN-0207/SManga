# Story-Detail Tabs (Chapters / Comments) — Design

> **Status:** Approved 2026-06-16. Next step: writing-plans.
> **Problem:** On `/truyen/$slug`, comments are stranded at the very bottom of the page (below the chapter list, similar-stories rails, and recommendations), so users rarely find them.

## Goal

Put the chapter list and the comments behind a **two-tab control** near the top of the page body — **"Danh sách chương"** and **"Bình luận (N)"** — so comments are one click away and discoverable.

## Decisions (locked)

- **Two tabs:** Tab 1 = chapter list (`ChapterBrowser`); Tab 2 = comments (`CommentSection`), moved up from the page bottom.
- **Underline tab style** (matching the top-nav active treatment): inactive `text-fg-muted`, active `text-fg` + `accent` underline.
- **Count badge** on the comments tab — `Bình luận (N)`, where N is the comment total from the existing comments query (shared cache; no extra request).
- **Both panels mounted, inactive one hidden via CSS** — preserves `ChapterBrowser` search/sort state across tab switches; no re-fetch on switch (parity with today, where both already load).
- **Smart default tab:** "Danh sách chương" normally; opens on **"Bình luận"** when the URL has `commentsPage > 1` or a `#comment-…` hash (deep-links to a comment).
- **Page order:** Hero → tabs → Cùng tác giả → Cùng thể loại → Truyện tương tự. No new `tab` URL param.

## Architecture

### New component: `StoryTabs`

`apps/frontend/src/components/reader/StoryTabs.tsx` — page-specific 2-tab composition.

- Props: `{ slug: string; storyId: string; chapters: ChapterListItem[]; readUpToIndex: number | null; isAuthenticated: boolean }` (`ChapterListItem` from `@/lib/chapter-filter`).
- **Active-tab state:** `const [tab, setTab] = useState<'chapters' | 'comments'>(initialTab)`, where `initialTab` is computed once: `comments` if `Number(search.commentsPage) > 1` (read via `useSearch({ strict: false })`) or `window.location.hash.startsWith('#comment-')`, else `chapters`.
- **Comment count:** read `commentsPage` from the URL (same as `CommentSection`) and run the identical query — `useQuery({ queryKey: ['comments', 'story', storyId, page], queryFn: () => listComments({ targetType: 'story', targetId: storyId, page, limit: 20 }) })`. React Query dedupes this with `CommentSection`'s query → single network call. Use `data?.total` for the badge (omit the count until loaded / when 0).
- **Tab bar:** a `role="tablist"` with two `role="tab"` buttons (`aria-selected`, `aria-controls`, focus-visible rings, `cursor-pointer`). Active gets the accent underline. The "Mục lục" eyebrow is dropped (the tab label replaces it).
- **Panels:** two `role="tabpanel"` containers, both rendered; the inactive one gets `hidden` (Tailwind `hidden` utility) + `aria-hidden`:
  - Chapters panel → `<ChapterBrowser slug chapters readUpToIndex isAuthenticated />` (unchanged props).
  - Comments panel → `<CommentSection targetType="story" targetId={storyId} slug={slug} hideHeading />`.

### `CommentSection` change

`apps/frontend/src/components/comments/CommentSection.tsx`: add an optional `hideHeading?: boolean` prop. When `true`, skip rendering the inner `<h2>Bình luận (N)</h2>` (the tab label + badge is the heading). Also drop the outer `<section className="… py-12">` wrapper's top padding when hidden-heading (or keep the section but rely on the tab panel's own spacing — implementation detail; the visible result must not double up headings or padding). All other behavior (form, list, pagination, hash-scroll) unchanged.

### `routes/truyen/$slug/index.tsx` change

- Replace the `<section id="muc-luc">…<ChapterBrowser …/></section>` block with `<StoryTabs slug={s.slug} storyId={s.id} chapters={items} readUpToIndex={readUpToIndex} isAuthenticated={!!user} />` (wrapped in the existing `container … max-w-5xl mx-auto` shell, keeping the `id="muc-luc"` + `scroll-mt-24` anchor on the tabs section so existing "Mục lục" anchor links still land here).
- Remove the standalone `<CommentSection … />` render at the bottom of the page (it now lives inside `StoryTabs`).
- `SimilarStoriesRail` (×2) and `RecommendationSection` stay where they are — already between the old chapter-list section and the old comments; with comments removed from the bottom, they naturally follow the tabs.

## Testing

- **No unit tests** (presentational/layout). Verification is **Playwright MCP proof** on localhost:
  1. Default load: "Danh sách chương" tab active, chapter list visible, comments panel hidden; "Bình luận (N)" tab shows the count.
  2. Click "Bình luận": comments panel shows (form + list), chapter list hidden; click back restores the chapter list **with its search/sort state intact**.
  3. Deep-link `…?commentsPage=2` (or `#comment-…`): page opens on the comments tab.
  4. No duplicate "Bình luận" heading inside the comments tab.
  - Capture screenshots of both tabs.
- `pnpm --filter @smanga/frontend typecheck` + existing test suite stay green.
