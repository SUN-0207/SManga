# Dark Mode — "Branded Ink" Redesign

> **Status:** SUPERSEDED 2026-06-17 — shipped as branded-ink, then revised to **Editorial Noir** via the `ui-ux-pro-max` skill (see Amendment below). Final shipped commit `819ce6d`.
> **Problem:** The dark theme reads muddy and "not eye-catching": surfaces don't separate (page `#0a0a0a`, `bg-subtle` = `rgba(255,255,255,.04)`, `bg-elevated` `#18181b`, borders `rgba(255,255,255,.08)` — all near-black, barely distinguishable), card-lift shadows are invisible on black, the homepage hero's light-mode pink wash turns into a muddy maroon smear, and the pink accent is underused.

## Amendment (2026-06-17) — revised to "Editorial Noir"

The branded-ink (plum) palette below shipped first but still read "not eye-catching." Using the `ui-ux-pro-max` design skill (top palette match: *"editorial black + accent pink #EC4899"*; OLED dark-mode guidance), we pivoted to a **cool near-neutral** base so the warm pink accent *pops* (warm-on-cool contrast) instead of muddying (warm-on-warm). This is what shipped (commit `819ce6d`); the dark token block in `apps/frontend/src/styles.css` now reads:

| Token | Editorial Noir (shipped) |
|---|---|
| `--bg` | `#0a0a0c` (cool zinc-black) |
| `--bg-subtle` | `#17171b` |
| `--bg-elevated` | `#212127` |
| `--fg` / `--fg-muted` / `--fg-subtle` | `#fafafa` / `#a1a1aa` / `#71717a` |
| `--accent` / `--accent-strong` | `#f0529c` / `#f77fbf` (vivid pink) |
| `--border` / `--border-strong` | `#2a2a31` / `#3b3b44` |
| `--glow-pink` | `0 0 24px rgba(240,82,156,.45), 0 0 60px rgba(240,82,156,.18)` |
| `--glow-pink-soft` | `0 0 16px rgba(240,82,156,.28)` |
| `--shadow-elev` | `0 12px 32px rgba(0,0,0,.6)` |
| `--hero-wash` (dark) | `linear-gradient(135deg, rgba(240,82,156,.13), rgba(129,140,248,.05) 45%, transparent 78%)` |

Light theme + `--hero-wash` (light) unchanged. The "branded ink" sections below are retained as the design trail.

## Goal

Retune the **dark theme only** into a "branded ink" palette: a deep plum-ink base with **clearly-stepped solid surfaces**, **visible borders**, and a **brighter pink accent + glow**, so surfaces separate, the brand reads, and content pops. Light theme unchanged.

## Decisions (locked)

- **Branded-ink direction**, executed with *clean, solid, clearly-stepped* surfaces (no uncontrolled rgba tinting — that muddiness is the current bug).
- **Scope = dark-theme CSS tokens only** in `apps/frontend/src/styles.css` (the `:root, :root[data-theme="dark"]` block) + one small theme-aware tweak to the `FeaturedSlider` left-column wash. No light-theme, layout, or per-component restructuring.
- Components inherit automatically via the existing semantic Tailwind tokens (`bg`, `bg-elevated`, `bg-subtle`, `fg`, `fg-muted`, `fg-subtle`, `accent`, `accent-strong`, `border`, `border-strong`).

## Token changes (dark block only)

Replace the values in the `:root, :root[data-theme="dark"]` block of `apps/frontend/src/styles.css`:

| Token | Current | New (Branded Ink) |
|---|---|---|
| `--bg` | `#0a0a0a` | `#0C0A12` |
| `--bg-elevated` | `#18181b` | `#1A1622` |
| `--bg-subtle` | `rgba(255,255,255,0.04)` | `#15121C` |
| `--fg` | `#fafafa` | `#F6F4F8` |
| `--fg-muted` | `rgba(255,255,255,0.6)` | `#A8A1B4` |
| `--fg-subtle` | `rgba(255,255,255,0.4)` | `#6E6878` |
| `--accent` | `#ec4899` | `#F25EA6` |
| `--accent-strong` | `#f472b6` | `#F98AC8` |
| `--border` | `rgba(255,255,255,0.08)` | `#2C2536` |
| `--border-strong` | `rgba(255,255,255,0.16)` | `#3C3448` |
| `--glow-pink` | (pink-on-`ec4899`) | `0 0 26px rgba(242,94,166,0.45), 0 0 64px rgba(242,94,166,0.18)` |
| `--glow-pink-soft` | (pink-on-`ec4899`) | `0 0 18px rgba(242,94,166,0.28)` |
| `--shadow-elev` | `0 8px 24px rgba(0,0,0,0.4)` | `0 10px 30px rgba(0,0,0,0.55)` |

Unchanged in the dark block: `--destructive` (`#f43f5e`), `--positive` (`#34d399`), `color-scheme: dark`. The shadcn alias mappings (`--background`, `--primary`, etc.) already reference these vars — no change needed.

Light theme (`:root[data-theme="light"]`) is **untouched**, including its `--accent` `#ec4899` / `--accent-strong` `#f472b6`.

## Hero-wash fix (theme-aware)

The `FeaturedSlider` left column in `apps/frontend/src/routes/index.tsx` currently hardcodes a light-mode inline gradient:
`linear-gradient(135deg, rgba(236,72,153,0.10) 0%, rgba(244,114,182,0.03) 45%, transparent 75%)` — the muddy-maroon-on-black offender.

Make it token-driven:
1. Add a `--hero-wash` CSS var to both theme blocks in `styles.css`:
   - light: `--hero-wash: linear-gradient(135deg, rgba(236,72,153,0.10) 0%, rgba(244,114,182,0.03) 45%, transparent 75%);` (the current value)
   - dark: `--hero-wash: linear-gradient(135deg, rgba(242,94,166,0.14) 0%, rgba(168,85,247,0.06) 45%, transparent 78%);` (pink-glow on ink — verified in preview)
2. In `index.tsx`, change the left column's inline style to `style={{ background: 'var(--hero-wash)' }}`.

## Accessibility

- Body text `#F6F4F8` on `#0C0A12` and on `#1A1622` cards → well above 4.5:1.
- `--fg-muted` `#A8A1B4` on `#0C0A12` ≈ 7:1 (passes for body/secondary text).
- Accent `#F25EA6` is used for fills (white text on the pink gradient CTA) and small accents; confirm any **accent-colored text on dark** still clears 4.5:1 (it does at `#F25EA6`).
- `prefers-reduced-motion` unaffected (no new motion).

## Testing

- **No unit tests** (CSS token retune). Verification = **Playwright MCP proof** in dark mode:
  1. Homepage: hero is a cleanly-elevated plum card with a subtle pink glow (no muddy maroon); grid cards, sidebar, and footer band visibly separate from the page.
  2. Story-detail: chips, search, tabs, and chapter rows have visible definition; accent pills/CTAs pop.
  3. Chapter reader page: prose readable on the ink base.
  4. Toggle to **light** and confirm it's visually **unchanged** from before.
  5. Spot 4.5:1 contrast on body + muted text.
  - Capture before/after dark screenshots.
- `pnpm --filter @smanga/frontend typecheck` stays clean (CSS-only + one `style` attr change).
