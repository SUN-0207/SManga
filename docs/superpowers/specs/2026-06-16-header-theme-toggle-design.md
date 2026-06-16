# Header Theme Toggle — Design

> **Status:** Approved 2026-06-16. Next step: writing-plans.
> **Problem:** The light/dark theme control is buried in the reader-settings drawer (Giao diện: Sáng / Tối / Hệ thống). There's no quick way to flip light↔dark from the header.

## Goal

Add a one-tap **light ↔ dark** toggle icon to the header (both breakpoints), as a shortcut. The full 3-option control stays in the reader-settings drawer.

## Decisions (locked)

- **2-state toggle (light ↔ dark)** — not a 3-way cycle. "Hệ thống" (system) remains available only in the drawer.
- **Shown in both headers** — `DesktopTopNav` (≥1024px) and `ReaderHeader` (mobile), in the right icon cluster between the search button and the notification bell.
- **Reuses the existing store + persistence** — no new state, no new storage.

## Architecture

### New component: `ThemeToggle`

`apps/frontend/src/components/reader/ThemeToggle.tsx` — a single icon button.

- Reads `{ theme, setTheme }` from `useReaderPrefs` (`@/stores/reader-prefs-store`; `ReaderTheme = 'light' | 'dark' | 'system'`).
- **Resolved appearance:** `isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark)`, where `systemPrefersDark` tracks `window.matchMedia('(prefers-color-scheme: dark)')` via a `useState` + `useEffect` listener (so the icon stays correct while `theme === 'system'`).
- **Click:** `setTheme(isDark ? 'light' : 'dark')` — always lands on an explicit theme.
- **Icon (Lucide):** `Moon` when currently light (action → dark); `Sun` when currently dark (action → light). Icon swap with a 150ms color transition (no morph animation).
- **A11y:** `type="button"`, dynamic `aria-label` ("Chuyển sang giao diện tối" when light / "Chuyển sang giao diện sáng" when dark), `aria-pressed={isDark}`, visible focus ring.
- **Styling:** identical to the existing header icon buttons — `inline-flex items-center justify-center h-9 w-9 rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer`.

`ThemeProvider` already maps `theme` → `data-theme` on `<html>`; calling `setTheme` triggers the existing effect, so the toggle needs no extra wiring.

### Header integration

- `apps/frontend/src/components/layout/DesktopTopNav.tsx`: render `<ThemeToggle />` in the right cluster, between the search `<button>` and `<NotificationBell />`.
- `apps/frontend/src/components/reader/ReaderHeader.tsx`: same — `<ThemeToggle />` between the search `<button>` and `<NotificationBell />`.

### Unchanged

The reader-settings drawer (`ReaderSettings`) keeps its 3-option "Giao diện" segmented control (Sáng / Tối / Hệ thống). No store/persistence changes. Admin and auth shells unchanged (they don't render these headers).

## Testing

- **No unit tests** (trivial presentational toggle). Verification is **Playwright MCP proof** on localhost:
  1. Desktop: the toggle appears between search and the bell; clicking flips `document.documentElement.dataset.theme` light↔dark and swaps the icon (Moon↔Sun).
  2. Mobile (~390px): the toggle appears in `ReaderHeader` and toggles correctly.
  3. The drawer's 3-option control still works and stays in sync (toggling in the header updates the drawer selection, and vice-versa, since both read the same store).
  - Capture before/after screenshots.
- `pnpm --filter @smanga/frontend typecheck` + existing test suite stay green.
