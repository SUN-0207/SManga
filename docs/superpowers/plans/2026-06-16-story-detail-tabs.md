# Story-Detail Tabs (Chapters / Comments) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chapter-list section + bottom-of-page comments with a two-tab control ("Danh sách chương" | "Bình luận (N)") so comments are discoverable.

**Architecture:** A new `StoryTabs` component composes `ChapterBrowser` (tab 1) and `CommentSection` (tab 2, moved up), both mounted with the inactive panel `hidden`. `CommentSection` gains a `hideHeading` prop. The story route renders `<StoryTabs>` and drops the standalone bottom comment section.

**Tech Stack:** Vite + React 19 + TanStack Router/Query + Tailwind + Lucide.

**Spec:** `docs/superpowers/specs/2026-06-16-story-detail-tabs-design.md`

---

## ⚠️ Verification model (read first)

Presentational/layout work — **NO unit tests.** Do NOT fabricate them. Per-task check: `pnpm --filter @smanga/frontend typecheck` passes. Final visual check = **Playwright MCP proof run by the controller** (Task 4).

### ⚠️ `$slug` lint caveat (Task 3) — DO NOT SKIP

The route file `apps/frontend/src/routes/truyen/$slug/index.tsx` contains `$` in its path, which makes the **local lefthook Biome silently skip it** ("os error 3 / Checked 0 files / ✔️"). A previous push failed CI on an out-of-order import in this exact file for this reason. **After editing it you MUST run Biome on it explicitly via the CLI** (path single-quoted so `$slug` is not shell-expanded):

```bash
pnpm exec biome check --write 'apps/frontend/src/routes/truyen/$slug/index.tsx'
```

and confirm it reports no errors, BEFORE committing — the commit hook will not catch issues in this file.

**Commit hygiene (all tasks):** commit ONLY the listed files (explicit `git add <path>`; quote the `$slug` path; never `git add -A`). `apps/frontend/vite.config.ts` is intentionally modified (local dev proxy → :3010) and must **NOT** be committed. English-only identifiers. Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push or amend.

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `apps/frontend/src/components/comments/CommentSection.tsx` | Add `hideHeading` prop | Modify |
| `apps/frontend/src/components/reader/StoryTabs.tsx` | 2-tab control composing ChapterBrowser + CommentSection | Create |
| `apps/frontend/src/routes/truyen/$slug/index.tsx` | Render `<StoryTabs>`; drop bottom `<CommentSection>` | Modify |

---

## Task 1: Add `hideHeading` to `CommentSection`

**Files:**
- Modify: `apps/frontend/src/components/comments/CommentSection.tsx`

**Context:** When used inside a tab labeled "Bình luận (N)", the section's own `<h2>Bình luận (N)</h2>` is redundant. Add an optional `hideHeading` prop to suppress just that heading; all other behavior unchanged.

- [ ] **Step 1: Add the prop to the `Props` interface**

Replace:

```tsx
interface Props {
  targetType: 'story' | 'chapter';
  targetId: string;
  slug: string;
  chapterIndex?: string;
}
```

with:

```tsx
interface Props {
  targetType: 'story' | 'chapter';
  targetId: string;
  slug: string;
  chapterIndex?: string;
  /** When true, suppress the internal "Bình luận (N)" heading (e.g. when the
   * section sits inside a tab whose label already says "Bình luận"). */
  hideHeading?: boolean;
}
```

- [ ] **Step 2: Destructure it**

Replace:

```tsx
export function CommentSection({
  targetType,
  targetId,
  slug: _slug,
  chapterIndex: _chapterIndex,
}: Props) {
```

with:

```tsx
export function CommentSection({
  targetType,
  targetId,
  slug: _slug,
  chapterIndex: _chapterIndex,
  hideHeading = false,
}: Props) {
```

- [ ] **Step 3: Make the heading conditional**

Replace:

```tsx
      <h2 className="font-sans font-bold text-heading-lg tracking-tight mb-6">
        Bình luận{data?.total != null && data.total > 0 ? ` (${data.total})` : ''}
      </h2>
```

with:

```tsx
      {!hideHeading && (
        <h2 className="font-sans font-bold text-heading-lg tracking-tight mb-6">
          Bình luận{data?.total != null && data.total > 0 ? ` (${data.total})` : ''}
        </h2>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors. (Existing call sites omit `hideHeading` — fine, it's optional.)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/comments/CommentSection.tsx
git commit -m "feat(frontend): CommentSection hideHeading prop

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Create `StoryTabs`

**Files:**
- Create: `apps/frontend/src/components/reader/StoryTabs.tsx`

**Context:** Composes `ChapterBrowser` (`@/components/reader/ChapterBrowser`, props `slug/chapters/readUpToIndex/isAuthenticated`) and `CommentSection` (`@/components/comments/CommentSection`). `ChapterListItem` is from `@/lib/chapter-filter`. The comment count reuses `CommentSection`'s exact query key/params (`['comments','story',storyId,page]`, `listComments({targetType:'story',targetId,page,limit:20})`) so React Query dedupes to one fetch. `bg-accent-gradient` is the underline utility used by the top nav. `useSearch({ strict: false })` reads `commentsPage` without a route search-schema constraint.

- [ ] **Step 1: Create the component**

Create `apps/frontend/src/components/reader/StoryTabs.tsx`:

```tsx
import { listComments } from '@/api/comments';
import { CommentSection } from '@/components/comments/CommentSection';
import { ChapterBrowser } from '@/components/reader/ChapterBrowser';
import type { ChapterListItem } from '@/lib/chapter-filter';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useState } from 'react';

type Tab = 'chapters' | 'comments';

export interface StoryTabsProps {
  slug: string;
  storyId: string;
  chapters: ChapterListItem[];
  readUpToIndex: number | null;
  isAuthenticated: boolean;
}

const tabBase =
  'relative -mb-px px-1 pb-3 text-body font-semibold transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm';

/**
 * Story-detail body: tabs the chapter list (ChapterBrowser) and comments
 * (CommentSection) so comments are discoverable instead of stranded at the
 * page bottom. Both panels stay mounted (inactive one hidden) to preserve
 * ChapterBrowser's search/sort state across switches.
 */
export function StoryTabs({
  slug,
  storyId,
  chapters,
  readUpToIndex,
  isAuthenticated,
}: StoryTabsProps) {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const page = Math.max(1, Number(search.commentsPage) || 1);

  // Smart initial tab: open Comments when deep-linked to a comment.
  const [tab, setTab] = useState<Tab>(() => {
    const deepLinked =
      page > 1 ||
      (typeof window !== 'undefined' && window.location.hash.startsWith('#comment-'));
    return deepLinked ? 'comments' : 'chapters';
  });

  // Same key/params as CommentSection → React Query dedupes to one request.
  const commentsQ = useQuery({
    queryKey: ['comments', 'story', storyId, page],
    queryFn: () => listComments({ targetType: 'story', targetId: storyId, page, limit: 20 }),
  });
  const commentCount = commentsQ.data?.total ?? null;

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Nội dung truyện"
        className="flex items-center gap-6 border-b border-border"
      >
        <button
          type="button"
          role="tab"
          id="tab-chapters"
          aria-selected={tab === 'chapters'}
          aria-controls="panel-chapters"
          onClick={() => setTab('chapters')}
          className={`${tabBase} ${tab === 'chapters' ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
        >
          Danh sách chương
          {tab === 'chapters' && (
            <span
              aria-hidden
              className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent-gradient rounded-full"
            />
          )}
        </button>
        <button
          type="button"
          role="tab"
          id="tab-comments"
          aria-selected={tab === 'comments'}
          aria-controls="panel-comments"
          onClick={() => setTab('comments')}
          className={`${tabBase} ${tab === 'comments' ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
        >
          Bình luận{commentCount != null && commentCount > 0 ? ` (${commentCount})` : ''}
          {tab === 'comments' && (
            <span
              aria-hidden
              className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent-gradient rounded-full"
            />
          )}
        </button>
      </div>

      <div role="tabpanel" id="panel-chapters" aria-labelledby="tab-chapters" hidden={tab !== 'chapters'}>
        <ChapterBrowser
          slug={slug}
          chapters={chapters}
          readUpToIndex={readUpToIndex}
          isAuthenticated={isAuthenticated}
        />
      </div>

      <div role="tabpanel" id="panel-comments" aria-labelledby="tab-comments" hidden={tab !== 'comments'}>
        <CommentSection targetType="story" targetId={storyId} slug={slug} hideHeading />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors. (Not yet imported anywhere.)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/reader/StoryTabs.tsx
git commit -m "feat(frontend): StoryTabs (chapters/comments tab control)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Wire `StoryTabs` into the story route

**Files:**
- Modify: `apps/frontend/src/routes/truyen/$slug/index.tsx`

**Context:** Replace the chapter-list `<section>` with `<StoryTabs>` (keep the `id="muc-luc"` + `scroll-mt-24` anchor), remove the standalone bottom `<CommentSection>`, and fix imports. **This file is a `$slug` path — see the lint caveat above; run Biome CLI on it before committing.**

- [ ] **Step 1: Swap imports**

In `apps/frontend/src/routes/truyen/$slug/index.tsx`:
- Remove: `import { CommentSection } from '@/components/comments/CommentSection';`
- Remove: `import { ChapterBrowser } from '@/components/reader/ChapterBrowser';`
- Add: `import { StoryTabs } from '@/components/reader/StoryTabs';`

(Exact placement is fixed up by the Biome step below.)

- [ ] **Step 2: Replace the chapter-list section with the tabs**

Replace this block:

```tsx
      {/* Chapter list */}
      <section id="muc-luc" className="container pb-20 scroll-mt-24">
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
      </section>
```

with:

```tsx
      {/* Chapters + comments tabs */}
      <section id="muc-luc" className="container pb-20 scroll-mt-24">
        <div className="max-w-5xl mx-auto">
          <StoryTabs
            slug={s.slug}
            storyId={s.id}
            chapters={items}
            readUpToIndex={readUpToIndex}
            isAuthenticated={!!user}
          />
        </div>
      </section>
```

- [ ] **Step 3: Remove the standalone bottom comment section**

Delete this line (the last child before `</div>` that closes the page):

```tsx
      <CommentSection targetType="story" targetId={s.id} slug={s.slug} />
```

(The `SimilarStoriesRail` ×2 and `RecommendationSection` above it stay unchanged.)

- [ ] **Step 4: Fix imports + lint THIS `$slug` file via Biome CLI (mandatory)**

Run (path single-quoted):

```bash
pnpm exec biome check --write 'apps/frontend/src/routes/truyen/$slug/index.tsx'
```

Then verify it is clean:

```bash
pnpm exec biome check 'apps/frontend/src/routes/truyen/$slug/index.tsx' --diagnostic-level=error
```

Expected: "Checked 1 file … No fixes applied." with no error diagnostics. (The local commit hook cannot lint this `$`-path file, so this CLI check is the gate that prevents a CI `organizeImports` failure.)

- [ ] **Step 5: Typecheck + full frontend test**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors; no remaining references to `ChapterBrowser` or `CommentSection` imports in this route (they're used via `StoryTabs` now).

Run: `pnpm --filter @smanga/frontend test`
Expected: existing suite stays green.

- [ ] **Step 6: Commit**

```bash
git add 'apps/frontend/src/routes/truyen/$slug/index.tsx'
git commit -m "feat(frontend): tab chapters + comments on story-detail page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Controller verification (Playwright MCP proof)

**Context:** Controller-only (needs the running dev stack + Playwright MCP; dev: frontend :3000, API :3010, proxy → :3010).

- [ ] **Step 1: Default + chapters tab**

Navigate to `http://localhost:3000/truyen/dau-pha-thuong-khung`. Verify the tab bar shows "Danh sách chương" (active, accent underline) + "Bình luận (N)" with a count; the chapter browser is visible; the comments panel is `hidden`. Screenshot.

- [ ] **Step 2: Switch to comments**

Click "Bình luận". Verify the comments form + list show and the chapter list hides; there is **no duplicate** "Bình luận" heading inside the panel. Screenshot. Then click "Danh sách chương" and confirm the chapter list returns (type in the chapter search first, switch tabs, switch back → search text is preserved).

- [ ] **Step 3: Deep-link default**

Navigate to `http://localhost:3000/truyen/dau-pha-thuong-khung?commentsPage=2`. Verify the page opens on the **comments** tab.

- [ ] **Step 4: Refresh graph + report**

Run: `graphify update .`
Summarize screenshots as proof. Do NOT push without explicit user instruction (remote is `SManga`).

---

## Self-Review

**Spec coverage:**
- Two tabs (Danh sách chương | Bình luận) replacing the chapter-list section → Tasks 2 + 3. ✓
- Underline tab style, accent underline, a11y roles → Task 2. ✓
- Count badge from shared comments query → Task 2 (`commentsQ` same key as CommentSection). ✓
- Both panels mounted, inactive `hidden`, preserves ChapterBrowser state → Task 2 (`hidden` attr) + verified Task 4 Step 2. ✓
- Smart default (commentsPage>1 / #comment hash) → Task 2 (`useState` initializer) + verified Task 4 Step 3. ✓
- Comments moved up; CommentSection heading suppressed in tab → Task 1 (`hideHeading`) + Task 3 (removed bottom render). ✓
- Page order (similar/recs below tabs) → Task 3 leaves them in place after the tabs section. ✓
- No new `tab` URL param → none added. ✓
- Verification = Playwright, no unit tests → Task 4 + banner. ✓

**Placeholder scan:** No TBD/TODO; complete code in every code step.

**Type consistency:** `StoryTabs` props `{ slug, storyId, chapters: ChapterListItem[], readUpToIndex: number|null, isAuthenticated }` — the route passes `s.slug`, `s.id`, `items`, `readUpToIndex`, `!!user` (matches; `items` is `ChapterListItem[]`-shaped). `ChapterBrowser` receives the same prop names it already declares. `CommentSection` now accepts `hideHeading?: boolean` (Task 1) and is called with `hideHeading` (Task 2). Comment query key `['comments','story',storyId,page]` matches `CommentSection`'s `['comments', targetType, targetId, page]` with `targetType==='story'`. ✓
