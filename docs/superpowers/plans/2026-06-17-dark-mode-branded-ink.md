# Dark Mode "Branded Ink" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retune the dark theme into a "Branded Ink" palette (deep plum-ink, clearly-stepped solid surfaces, visible borders, brighter pink accent + glow) and make the hero-left wash theme-aware — fixing the flat/muddy dark mode. Light theme untouched.

**Architecture:** Pure CSS-token change in `apps/frontend/src/styles.css` (the `:root, :root[data-theme="dark"]` block) — every component inherits via the existing semantic tokens. Plus a new `--hero-wash` token (both themes) consumed by `FeaturedSlider` in `apps/frontend/src/routes/index.tsx`.

**Tech Stack:** Tailwind 3 (CSS-var semantic tokens) + Vite/React 19.

**Spec:** `docs/superpowers/specs/2026-06-17-dark-mode-branded-ink-design.md`

## Global Constraints

- Verification is **visual (Playwright MCP, controller-run)** — there are NO unit tests; do not fabricate them. Per-task check: `pnpm --filter @smanga/frontend typecheck` passes.
- Commit ONLY the listed files (explicit `git add <path>`; never `git add -A`). `apps/frontend/vite.config.ts` is intentionally modified (local dev proxy → :3010) and must **NOT** be committed.
- English-only identifiers; commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push or amend without explicit instruction. lefthook pre-commit runs lint+typecheck (both `styles.css` and `routes/index.tsx` are normal paths — the hook lints them fine).
- **Dark-only:** do NOT change the `:root[data-theme="light"]` token *values* (only ADD the `--hero-wash` line to it).

---

## Task 1: Branded-Ink dark tokens + theme-aware hero wash

**Files:**
- Modify: `apps/frontend/src/styles.css`
- Modify: `apps/frontend/src/routes/index.tsx`

- [ ] **Step 1: Retune the dark token block + add `--hero-wash`**

In `apps/frontend/src/styles.css`, replace the entire `:root, :root[data-theme="dark"] { … }` block (currently lines 5–35) with:

```css
:root,
:root[data-theme="dark"] {
  /* Surfaces — Branded Ink: deep plum, clearly stepped solid hexes */
  --bg: #0c0a12;
  --bg-elevated: #1a1622;
  --bg-subtle: #15121c;

  /* Foreground */
  --fg: #f6f4f8;
  --fg-muted: #a8a1b4;
  --fg-subtle: #6e6878;

  /* Brand — brighter pink reads better on ink */
  --accent: #f25ea6;
  --accent-strong: #f98ac8;

  /* Borders — visible plum */
  --border: #2c2536;
  --border-strong: #3c3448;

  /* Status */
  --destructive: #f43f5e;
  --positive: #34d399;

  /* Shadows (signature) */
  --glow-pink: 0 0 26px rgba(242, 94, 166, 0.45), 0 0 64px rgba(242, 94, 166, 0.18);
  --glow-pink-soft: 0 0 18px rgba(242, 94, 166, 0.28);
  --shadow-elev: 0 10px 30px rgba(0, 0, 0, 0.55);

  /* FeaturedSlider left-column wash (theme-aware) */
  --hero-wash: linear-gradient(135deg, rgba(242, 94, 166, 0.14) 0%, rgba(168, 85, 247, 0.06) 45%, transparent 78%);

  color-scheme: dark;
}
```

- [ ] **Step 2: Add `--hero-wash` to the light block (value unchanged from today's hero gradient)**

In the same file, inside the `:root[data-theme="light"] { … }` block, add this line immediately before `color-scheme: light;` (do NOT change any other light value):

```css
  --hero-wash: linear-gradient(135deg, rgba(236, 72, 153, 0.1) 0%, rgba(244, 114, 182, 0.03) 45%, transparent 75%);
```

- [ ] **Step 3: Consume `--hero-wash` in the FeaturedSlider left column**

In `apps/frontend/src/routes/index.tsx`, replace the left-column `<div>` (currently lines 86–92):

```tsx
        <div
          className="relative p-8 sm:p-12 lg:p-16"
          style={{
            background:
              'linear-gradient(135deg, rgba(236,72,153,0.10) 0%, rgba(244,114,182,0.03) 45%, transparent 75%)',
          }}
        >
```

with:

```tsx
        <div
          className="relative p-8 sm:p-12 lg:p-16"
          style={{ background: 'var(--hero-wash)' }}
        >
```

(If biome reformats the `<div>` onto one line on commit, that's fine.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/styles.css apps/frontend/src/routes/index.tsx
git commit -m "feat(frontend): branded-ink dark theme + theme-aware hero wash

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Controller verification (Playwright MCP proof)

**Context:** Controller-only (needs the running dev stack — frontend :3000, API :3010 — + Playwright MCP). A fresh page load is required so any earlier injected preview styles are cleared and the **committed** CSS is what renders.

- [ ] **Step 1: Force dark + reload**

In the browser, set the persisted theme to dark and reload: `localStorage['smanga:reader']` → set `state.theme = 'dark'`, then navigate to `http://localhost:3000/` (fresh load). Confirm `document.documentElement.dataset.theme === 'dark'` and `getComputedStyle(document.body).backgroundColor` is the new ink `rgb(12, 10, 18)`.

- [ ] **Step 2: Dark screenshots**

Capture (desktop ~1366 wide): homepage (hero = elevated plum card + subtle pink glow, no muddy maroon; grid/sidebar/footer visibly separate), a story-detail page `/truyen/dau-pha-thuong-khung` (chips/tabs/chapter rows defined; accent pills/CTAs pop), and a chapter reader page (prose readable on ink). Save as `dark-final-*.png`.

- [ ] **Step 3: Light-unchanged check**

Toggle to light (set `state.theme = 'light'`, reload) and confirm the light theme renders **exactly as before** (background `rgb(250, 250, 250)`, unchanged palette). Screenshot one page for the record.

- [ ] **Step 4: Contrast spot-check**

Confirm body text (`#F6F4F8`) and muted text (`#A8A1B4`) on the ink surfaces remain ≥4.5:1 (e.g. via a quick contrast check on a chapter paragraph + a `text-fg-muted` line).

- [ ] **Step 5: Refresh graph + report**

Run: `graphify update .` Summarize the before/after dark screenshots as proof. Do NOT push without explicit user instruction (remote is `SManga`).

---

## Self-Review

**Spec coverage:** dark token retune (all rows of the spec table) → Task 1 Step 1 ✓; `--hero-wash` theme-aware (both themes + consumption) → Task 1 Steps 1–3 ✓; light untouched → Global Constraints + Task 1 Step 2 only ADDs a line ✓; accessibility 4.5:1 → Task 2 Step 4 ✓; verification dark + light-unchanged → Task 2 ✓.

**Placeholder scan:** No TBD/TODO; full CSS block + exact old/new JSX shown.

**Type/value consistency:** The dark `--hero-wash` value matches the spec (`rgba(242,94,166,0.14)` … `rgba(168,85,247,0.06)` … `78%`); the light `--hero-wash` equals the current hardcoded hero gradient; all token names match the existing semantic set (no renames). `index.tsx` consumes `var(--hero-wash)`, which Task 1 Step 1/2 defines in both theme blocks.
