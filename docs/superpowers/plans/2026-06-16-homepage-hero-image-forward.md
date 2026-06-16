# Homepage Image-Forward Hero — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the homepage hero image-forward — the featured/continue story's cover art becomes a blurred, scrim'd backdrop with bold white overlay text — plus a light card "pop" pass, keeping the clean base palette.

**Architecture:** A new shared `HeroCoverBackdrop` (decorative blurred cover + dark→pink scrim) powers both `FeaturedSlider` (crossfading per slide) and `LoggedInHero` in `routes/index.tsx`. Overlay text goes white. A small elevation tweak on homepage cards. No color-token or font changes.

**Tech Stack:** Vite + React 19 + TanStack Router + Tailwind (semantic CSS-var tokens) + Lucide.

**Spec:** `docs/superpowers/specs/2026-06-16-homepage-hero-image-forward-design.md`

---

## ⚠️ Verification model (read first)

This is **purely visual/layout work — there are NO unit tests.** Do NOT fabricate unit tests for layout. Per-task verification is:
- `pnpm --filter @smanga/frontend typecheck` passes, and
- the change compiles (the running dev server hot-reloads without errors).

Final visual verification (image-forward hero, crossfade, mobile, contrast, card hover) is a **Playwright MCP proof run by the controller** in the last task — not by implementers.

**Commit hygiene (all tasks):** commit ONLY the files listed in each task (explicit `git add <path>`; never `git add -A`). `apps/frontend/vite.config.ts` is intentionally modified (local dev proxy → :3010) and must **NOT** be committed. English-only identifiers (Vietnamese only in JSX text). Commit messages end with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer. Do NOT push or amend. A lefthook pre-commit hook runs lint+typecheck; fix causes, never bypass.

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `apps/frontend/src/components/home/HeroCoverBackdrop.tsx` | Shared decorative cover-art backdrop + scrim | Create |
| `apps/frontend/src/routes/index.tsx` | Wire backdrop into `FeaturedSlider` + `LoggedInHero`; white overlay text | Modify |
| `apps/frontend/src/components/home/StoryGridCard.tsx` | Hover-lift + shadow on the home grid card | Modify |
| `apps/frontend/src/components/home/SuggestedStoriesSidebar.tsx` | Stronger sidebar card separation | Modify |

---

## Task 1: Create `HeroCoverBackdrop`

**Files:**
- Create: `apps/frontend/src/components/home/HeroCoverBackdrop.tsx`

**Context:** Decorative backdrop reused by both hero components. The cover image is served by the existing cached endpoint `/api/v1/cover/:id`. `bg-accent-gradient-soft` is a defined Tailwind utility (the no-cover fallback). The component is purely decorative (`aria-hidden`).

- [ ] **Step 1: Create the component**

Create `apps/frontend/src/components/home/HeroCoverBackdrop.tsx`:

```tsx
const SCRIM =
  'linear-gradient(120deg, rgba(12,6,10,0.74) 0%, rgba(45,12,30,0.5) 45%, rgba(236,72,153,0.30) 100%)';

export interface HeroCoverBackdropProps {
  storyId: string;
  hasCover: boolean;
  /** Drives crossfade opacity when stacked in a slider. Defaults to true. */
  active?: boolean;
}

/**
 * Decorative image-forward backdrop: the story's cover art blurred + darkened
 * under a dark→pink scrim. Used behind the homepage hero + continue-reading
 * card so color comes from content, not a global background tint.
 */
export function HeroCoverBackdrop({ storyId, hasCover, active = true }: HeroCoverBackdropProps) {
  return (
    <div
      aria-hidden
      className={`absolute inset-0 z-0 pointer-events-none transition-opacity duration-500 ease-out ${
        active ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {hasCover ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(/api/v1/cover/${storyId})`,
            filter: 'blur(30px) saturate(1.45) brightness(0.92)',
            transform: 'scale(1.3)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-accent-gradient-soft" />
      )}
      <div className="absolute inset-0" style={{ background: SCRIM }} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors. (Component not yet imported anywhere — just verifies it compiles.)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/home/HeroCoverBackdrop.tsx
git commit -m "feat(frontend): HeroCoverBackdrop (blurred cover + scrim)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Image-forward `FeaturedSlider` + `LoggedInHero`

**Files:**
- Modify: `apps/frontend/src/routes/index.tsx`

**Context:** `FeaturedSlider` is a 2-column section (left marketing column unchanged; right slide panel becomes image-forward). `LoggedInHero` is the "Tiếp tục đọc" card. Both gain `HeroCoverBackdrop` and white overlay text. The auto-rotate + `prefers-reduced-motion` logic in `FeaturedSlider` stays as-is.

- [ ] **Step 1: Add the import**

In `apps/frontend/src/routes/index.tsx`, add this import alongside the other `@/components` imports (after the `TwoColumnSection` import on line 3):

```ts
import { HeroCoverBackdrop } from '@/components/home/HeroCoverBackdrop';
```

- [ ] **Step 2: Replace the `FeaturedSlider` right slide panel**

Replace the entire right-panel block — the `<div className="relative min-h-[420px] lg:min-h-[540px] overflow-hidden">…</div>` (current lines 126–195, the second child of the grid) — with:

```tsx
        <div className="relative min-h-[420px] lg:min-h-[540px] overflow-hidden">
          {slides.map((story, i) => (
            <HeroCoverBackdrop
              key={`bd-${story.id}`}
              storyId={story.id}
              hasCover={story.hasCover}
              active={i === active}
            />
          ))}
          {slides.map((story, i) => (
            <Link
              key={story.id}
              to="/truyen/$slug"
              params={{ slug: story.slug }}
              search={{ commentsPage: 1 }}
              aria-hidden={i !== active}
              tabIndex={i === active ? 0 : -1}
              className={`absolute inset-0 z-10 flex items-end p-8 sm:p-10 lg:p-12 group transition-opacity duration-500 ease-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${
                i === active ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <div className="absolute right-6 sm:right-10 top-8 sm:top-12 h-[52%] sm:h-[58%] aspect-[3/4] rounded-md shadow-elev overflow-hidden transition-transform duration-300 ease-out group-hover:scale-[1.02]">
                <StoryCover
                  storyId={story.id}
                  title={story.title}
                  hasCover={story.hasCover}
                  decorative
                  loading={i === 0 ? 'eager' : 'lazy'}
                />
              </div>
              <div className="relative max-w-[58%]">
                <p className="text-label uppercase tracking-[0.18em] text-white/80">
                  {fromFeaturedPool ? 'TRUYỆN NỔI BẬT' : 'MỚI CẬP NHẬT'}
                </p>
                <h3 className="mt-2 text-heading-lg lg:text-display-sm font-prose font-bold line-clamp-2 text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.55)]">
                  {story.title}
                </h3>
                <p className="mt-2 text-body-sm text-white/85 truncate">
                  {story.author ?? 'Khuyết danh'} · {story.totalChapters.toLocaleString('vi-VN')}{' '}
                  chương
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-body font-semibold text-white group-hover:gap-2.5 transition-all duration-fast">
                  Đọc ngay
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </div>
            </Link>
          ))}

          {slides.length > 1 && (
            <div
              className="absolute bottom-5 right-6 sm:right-10 z-10 flex items-center gap-1.5"
              role="tablist"
              aria-label="Chọn truyện nổi bật"
            >
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  aria-label={`Truyện ${i + 1}: ${s.title}`}
                  onClick={() => setActive(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated ${
                    i === active ? 'w-6 bg-accent' : 'w-1.5 bg-white/40 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
```

(This removes the old static pink-gradient overlay `<div>` and recolors the slide text white + adds `z-10` so slides/dots sit above the `z-0` backdrops.)

- [ ] **Step 3: Replace the `LoggedInHero` returned `<section>`**

Replace the final `return ( <section className="relative overflow-hidden rounded-xl border border-accent/20 bg-bg-elevated p-8 lg:p-12"> … </section> );` block (current lines 241–288 — the non-loading return) with:

```tsx
  return (
    <section className="relative overflow-hidden rounded-xl border border-white/10 bg-bg-elevated p-8 lg:p-12">
      <HeroCoverBackdrop storyId={cr.storyId} hasCover={cr.hasCover} />
      <div className="relative z-10 flex flex-col sm:flex-row gap-6 sm:items-center">
        <div className="hidden sm:block h-32 w-24 rounded-md overflow-hidden border border-white/20 flex-shrink-0 shadow-elev">
          <StoryCover storyId={cr.storyId} title={cr.storyTitle} hasCover={cr.hasCover} decorative />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-label uppercase mb-2 flex items-center gap-1.5 text-white/85">
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            ĐỌC TIẾP · CHƯƠNG {chapter} / {cr.totalChapters}
          </p>
          <h1 className="text-display-sm sm:text-display-md font-prose font-semibold truncate text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.5)]">
            {cr.storyTitle}
          </h1>
          <p className="mt-3 text-body text-white/85">
            Bạn đang đọc dở chương {chapter}. Tiếp tục ngay nào.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/truyen/$slug/chuong/$index"
              params={{ slug: cr.storySlug, index: String(chapter) }}
              search={{ commentsPage: 1 }}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-accent-gradient text-white text-body font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Tiếp tục đọc <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to="/truyen/$slug"
              params={{ slug: cr.storySlug }}
              search={{ commentsPage: 1 }}
              className="inline-flex items-center h-11 px-5 rounded-md border border-white/30 text-white hover:bg-white/10 text-body font-semibold transition-colors duration-fast cursor-pointer"
            >
              Xem truyện
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
```

(This removes the `bg-accent/20` blur blob, swaps the border to `border-white/10`, adds the backdrop, raises content to `z-10`, and recolors text white + restyles the secondary button for the dark card. Leave the `LoggedInHero` loading-skeleton return above it unchanged.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors. (Confirm no leftover references to the removed gradient overlay; `HeroCoverBackdrop` import resolves.)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/routes/index.tsx
git commit -m "feat(frontend): image-forward homepage hero + continue card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Light card "pop" pass

**Files:**
- Modify: `apps/frontend/src/components/home/StoryGridCard.tsx`
- Modify: `apps/frontend/src/components/home/SuggestedStoriesSidebar.tsx`

**Context:** Homepage cards blend into the white page. Add a subtle hover-lift + shadow to the grid card and a touch stronger separation on the sidebar card. `shadow-sm` is a Tailwind default; `shadow-elev` is the project's custom shadow. Base color tokens stay unchanged. The lift uses `transform`, disabled under reduced motion.

- [ ] **Step 1: Add hover-lift to the grid card `<Link>`**

In `apps/frontend/src/components/home/StoryGridCard.tsx`, replace the `<Link …>` opening tag's `className` (currently `"group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"`) with:

```tsx
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md transition-transform duration-200 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
```

- [ ] **Step 2: Add a resting + hover shadow to the cover container**

In the same file, replace the cover container `<div>` className (currently `"relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-bg-subtle"`) with:

```tsx
      <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-bg-subtle shadow-sm transition-shadow duration-200 group-hover:shadow-elev">
```

- [ ] **Step 3: Strengthen the sidebar card separation**

In `apps/frontend/src/components/home/SuggestedStoriesSidebar.tsx`, replace the wrapper `<div className="rounded-lg border border-border bg-bg-elevated p-5">` with:

```tsx
      <div className="rounded-lg border border-border-strong bg-bg-elevated p-5 shadow-sm">
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/home/StoryGridCard.tsx apps/frontend/src/components/home/SuggestedStoriesSidebar.tsx
git commit -m "feat(frontend): card hover-lift + separation on home cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Controller verification (Playwright MCP proof) + graphify

**Context:** Controller-only (needs the running dev stack + Playwright MCP). Not for implementer subagents. The dev stack is already running (frontend :3000, API :3010, Vite proxy temp-pointed to :3010).

- [ ] **Step 1: Full frontend test + typecheck**

Run: `pnpm --filter @smanga/frontend typecheck && pnpm --filter @smanga/frontend test`
Expected: typecheck clean; existing test suite stays green (no new tests added).

- [ ] **Step 2: Playwright proof — desktop hero (logged out)**

Navigate to `http://localhost:3000/`, resize to ~1366×820, ensure `data-theme="light"`. Verify + screenshot: the `FeaturedSlider` right panel shows the cover-art backdrop + dark→pink scrim + white overlay text; left marketing column stays clean white.

- [ ] **Step 3: Playwright proof — crossfade**

Click the second dot tab. Verify the backdrop crossfades to the new story's cover and the overlay text updates. Screenshot.

- [ ] **Step 4: Playwright proof — `LoggedInHero` (logged in)**

Log in (`admin@test.com` or `pwadmin@test.com` / `playwrightpass123`), navigate to `/` (the proof admin has continue-reading state at chương 1 of Đấu Phá Thương Khung). Verify the "Tiếp tục đọc" card is image-forward with readable white text. Screenshot.

- [ ] **Step 5: Playwright proof — mobile + card hover**

Resize to ~390×800; verify the hero + continue card stack and text stays readable. Hover a `Mới cập nhật` grid card; verify the lift + shadow. Screenshots.

- [ ] **Step 6: Refresh the graph**

Run: `graphify update .`

- [ ] **Step 7: Report**

Summarize the screenshots as proof. Do NOT push without explicit user instruction (remote is `SManga`).

---

## Self-Review

**Spec coverage:**
- `HeroCoverBackdrop` shared unit (blurred cover + scrim, `active` crossfade, no-cover fallback) → Task 1. ✓
- `FeaturedSlider` image-forward (per-slide crossfading backdrops, white overlay, dot-tab recolor, removed old gradient) → Task 2 Step 2. ✓
- `LoggedInHero` image-forward (backdrop, white text, secondary button restyle, border) → Task 2 Step 3. ✓
- Keep base palette / no token or font changes → no `styles.css`/`tailwind.config.ts` edits in any task. ✓
- Light pop pass (card hover-lift + separation, no base-token change) → Task 3. ✓
- Accessibility (decorative backdrop `aria-hidden`, white-on-dark contrast, reduced-motion, mobile) → backdrop `aria-hidden` (Task 1); reduced-motion on lift (Task 3); contrast + mobile verified in Task 4. ✓
- Verification = Playwright MCP proof, no unit tests → Task 4 + the verification-model banner. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The retained `LoggedInHero` loading skeleton and the left marketing column are explicitly left unchanged.

**Type consistency:** `HeroCoverBackdrop` props `{ storyId: string; hasCover: boolean; active?: boolean }` match all call sites — `FeaturedSlider` passes `storyId`/`hasCover`/`active`; `LoggedInHero` passes `storyId`/`hasCover` (active defaults true). `cr.storyId`/`cr.hasCover` exist on the continue-reading payload (already used by the current `StoryCover` call). `story.id`/`story.hasCover` exist on `StorySummary`. ✓
