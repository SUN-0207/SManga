# Homepage Hero — Image-Forward Redesign + Light "Pop" Pass — Design

> **Status:** Approved 2026-06-16. Next step: writing-plans.
> **Problem:** The app reads "nhạt nhòa" (washed-out). Root cause: the homepage hero (`FeaturedSlider`) and the "Tiếp tục đọc" card (`LoggedInHero`) are pale white panels — the slider's right half is mostly empty white with a small floating cover over a faint pink gradient. Everything blends into the near-white base.

## Goal

Make the homepage feel striking by making the hero **image-forward** — the featured story's cover art becomes a rich, blurred, scrim'd backdrop with bold overlaid text — so color comes from the *content*, not from tinting the base. Keep the existing clean light base palette unchanged.

## Decisions (locked)

- **Keep the base palette.** No changes to `styles.css` color tokens or `tailwind.config.ts` colors. The user rejected warm-cream / blush global tints. Base surfaces (`#fafafa` page, `#ffffff` cards) stay.
- **Image-forward hero.** The featured/continue cover art fills the hero panel as a blurred, darkened backdrop with a `dark → pink` gradient scrim; title/author/CTA overlay in **white**.
- **Default scrim:** `linear-gradient(120deg, rgba(12,6,10,0.74) 0%, rgba(45,12,30,0.5) 45%, rgba(236,72,153,0.30) 100%)` (the previewed dark→pink). Tunable during implementation.
- **No font changes, no dark-theme-default switch.**

## Out of scope (YAGNI)

- Global palette/token recolor (warm tint) — explicitly rejected.
- Font swap (stays Inter + Newsreader).
- Reader/chapter pages, admin, auth pages.
- Switching the default theme to dark.

## Architecture

### New shared unit: `HeroCoverBackdrop`

`apps/frontend/src/components/home/HeroCoverBackdrop.tsx` — a decorative, presentational backdrop reused by both hero components.

- Props: `{ storyId: string; hasCover: boolean; active?: boolean }` (`active` defaults to `true`).
- Renders (all `aria-hidden`, `pointer-events-none`, absolutely positioned `inset-0`):
  - A blurred, scaled cover layer: a `<div>` with `background-image: url(/api/v1/cover/${storyId})`, `bg-cover bg-center`, `blur(30px) saturate(1.45) brightness(0.92)`, `scale-[1.3]`. When `!hasCover`, fall back to the existing `accent-gradient-soft` (no image).
  - The gradient scrim layer (the default scrim above) on top of the cover layer.
- Opacity is driven by `active` (`opacity-100` vs `opacity-0`) with a `transition-opacity duration-500 ease-out` so the slider can **crossfade** backdrops between slides. Respects `prefers-reduced-motion` (instant swap — rely on the existing reduced-motion handling that already stops auto-rotate; the opacity transition is mild and acceptable, but no motion-based transforms animate).

### `FeaturedSlider` (in `apps/frontend/src/routes/index.tsx`) — image-forward

Keep the existing 2-column section shell (`rounded-xl border bg-bg-elevated`, left marketing column, right slide panel, dot tabs, auto-rotate + reduced-motion guard). Changes confined to the **right slide panel**:

- Stack one `HeroCoverBackdrop` per slide inside the right panel, each with `active={i === active}` so the backdrop **crossfades** in sync with the existing slide opacity logic. Remove the current faint static pink gradient overlay (replaced by the scrim inside the backdrop).
- Slide overlay text becomes **white**: eyebrow (`MỚI CẬP NHẬT` / `TRUYỆN NỔI BẬT`) `text-white/80`, title `text-white` with a subtle `drop-shadow`, author `text-white/85`, "Đọc ngay" `text-white`. The crisp floating cover (`StoryCover`) stays on top (raised above the backdrop).
- Left marketing column unchanged (clean white, dark text, pink-gradient CTA).
- Dot tabs: active dot stays `bg-accent`; inactive becomes `bg-white/40 hover:bg-white/70` (they now sit over the dark panel).

### `LoggedInHero` ("Tiếp tục đọc") — image-forward

Currently a white card with a small cover thumbnail + dark text + a blurred accent blob. Redesign to mirror the hero:

- Use `HeroCoverBackdrop` with the continue-reading story's `storyId`/`hasCover` (`active` defaults true) as the card background. Remove the existing `bg-accent/20` blur blob (replaced by the scrim).
- Overlay text becomes white: eyebrow `ĐỌC TIẾP · CHƯƠNG N / M` `text-white/85` (keep the accent-tinted variant only if contrast holds — default white), title `text-white`, subtitle `text-white/85`.
- Keep the crisp cover thumbnail, the **"Tiếp tục đọc"** pink-gradient CTA, and the secondary "Xem truyện" button (restyle the secondary to a translucent `border-white/30 text-white hover:bg-white/10` so it reads on the dark card).
- Card border becomes `border-white/10` (was `border-accent/20`).

### Part B — light "pop" pass (no base-token change)

Small, homepage-scoped polish so cards stop blending into white:

- **Card elevation:** the homepage story cards rendered by `RecentUpdatesGrid` and `SuggestedStoriesSidebar` get a clearer resting separation + hover lift — `border-border` → `border-border-strong` (or add a `shadow-elev`/soft shadow at rest) and a `hover:-translate-y-0.5 hover:shadow-elev transition` (200ms, non-layout-shifting beyond the small translate; respects reduced-motion). Exact per-component edits decided in the plan after reading each card file.
- **CTA consistency:** confirm primary CTAs use `bg-accent-gradient` + `shadow-glow-pink-soft hover:shadow-glow-pink` (the hero CTAs already do — apply the same to any homepage primary CTA that doesn't).
- Base color tokens stay untouched; this is component-level styling only.

## Behavior & accessibility

- Backdrop is purely decorative: `aria-hidden`, `pointer-events-none`. Screen readers see only the existing slide links/text.
- **Contrast:** white overlay text sits over the dark portion of the scrim (left/center where text lives) — must meet ≥4.5:1. The scrim's dark left stop (`rgba(12,6,10,0.74)`) over typical covers clears this; verify in Playwright on the lightest cover available.
- **Reduced motion:** auto-rotate already disabled under `prefers-reduced-motion`; no transform-based motion animates on load. The opacity crossfade is retained (mild) — acceptable.
- **Mobile (<lg):** slider stacks (text column on top, image panel below, existing `min-h`); `LoggedInHero` stacks cover + text. Backdrop fills the panel in both layouts.
- Cover source is the existing cached `/api/v1/cover/:id` (no new endpoint). Backdrop reuses the same URL the slide already loads, so no extra network cost beyond the decorative layer.

## Testing

- **No unit tests** (purely visual/layout). Verification is **Playwright MCP proof** on localhost:
  1. Desktop hero: right panel shows the cover-art backdrop + scrim + white overlay text; left column clean.
  2. Slide change (click a dot): backdrop **crossfades** to the new cover; text updates.
  3. `LoggedInHero` (logged in with continue-reading): image-forward card renders, text readable.
  4. Mobile width (~390px): hero + continue card stack correctly, text readable.
  5. Card hover-lift on homepage grid/sidebar cards.
  - Capture before/after screenshots as proof.
- `pnpm --filter @smanga/frontend typecheck` + existing test suite stay green.
