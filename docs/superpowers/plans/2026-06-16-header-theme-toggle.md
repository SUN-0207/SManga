# Header Theme Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-tap light↔dark `ThemeToggle` icon to both headers (desktop + mobile), reusing the existing reader-prefs store.

**Architecture:** A new `ThemeToggle` button reads `theme`/`setTheme` from `useReaderPrefs`, resolves the current appearance (handling `system`), and flips to the opposite explicit theme. `ThemeProvider` already maps `theme` → `data-theme`, so no extra wiring. Rendered in `DesktopTopNav` + `ReaderHeader` between search and the notification bell.

**Tech Stack:** Vite + React 19 + TanStack Router + Tailwind + Lucide + zustand.

**Spec:** `docs/superpowers/specs/2026-06-16-header-theme-toggle-design.md`

---

## ⚠️ Verification model (read first)

Trivial presentational UI — **NO unit tests.** Do NOT fabricate them. Per-task check: `pnpm --filter @smanga/frontend typecheck` passes. Final visual check is a **Playwright MCP proof run by the controller** (Task 3).

**Commit hygiene (all tasks):** commit ONLY the listed files (explicit `git add <path>`; never `git add -A`). `apps/frontend/vite.config.ts` is intentionally modified (local dev proxy → :3010) and must **NOT** be committed. English-only identifiers (Vietnamese only in JSX text). Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push or amend. lefthook pre-commit runs lint+typecheck — fix causes, never bypass.

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `apps/frontend/src/components/reader/ThemeToggle.tsx` | Light↔dark toggle icon button | Create |
| `apps/frontend/src/components/layout/DesktopTopNav.tsx` | Render `<ThemeToggle />` (desktop) | Modify |
| `apps/frontend/src/components/reader/ReaderHeader.tsx` | Render `<ThemeToggle />` (mobile) | Modify |

---

## Task 1: Create `ThemeToggle`

**Files:**
- Create: `apps/frontend/src/components/reader/ThemeToggle.tsx`

**Context:** `useReaderPrefs` (`@/stores/reader-prefs-store`) exposes `theme: 'light'|'dark'|'system'` and `setTheme`. The button must reflect the *resolved* appearance (so the icon is right even when `theme === 'system'`), tracking `prefers-color-scheme`. This is a Vite SPA (no SSR). Styling matches the existing header icon buttons.

- [ ] **Step 1: Create the component**

Create `apps/frontend/src/components/reader/ThemeToggle.tsx`:

```tsx
import { useReaderPrefs } from '@/stores/reader-prefs-store';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Header quick-toggle: flips light ↔ dark. The full 3-option control
 * (Sáng / Tối / Hệ thống) stays in the reader-settings drawer; this shortcut
 * always lands on an explicit theme. Reuses useReaderPrefs, so ThemeProvider's
 * data-theme effect performs the actual switch.
 */
export function ThemeToggle() {
  const theme = useReaderPrefs((s) => s.theme);
  const setTheme = useReaderPrefs((s) => s.setTheme);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark);

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-pressed={isDark}
      aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      title={isDark ? 'Giao diện sáng' : 'Giao diện tối'}
      className="inline-flex items-center justify-center h-9 w-9 rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors. (Not yet imported anywhere — verifies it compiles.)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/reader/ThemeToggle.tsx
git commit -m "feat(frontend): ThemeToggle (light/dark header toggle)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Render `ThemeToggle` in both headers

**Files:**
- Modify: `apps/frontend/src/components/layout/DesktopTopNav.tsx`
- Modify: `apps/frontend/src/components/reader/ReaderHeader.tsx`

**Context:** Both headers have a right-cluster `<div>` containing a search `<button>`, then `<NotificationBell />`, then the avatar/login. Insert `<ThemeToggle />` between the search button and `<NotificationBell />` in each, and add the import.

- [ ] **Step 1: DesktopTopNav — add import**

In `apps/frontend/src/components/layout/DesktopTopNav.tsx`, add this import alongside the other `@/components` imports (e.g., after the `SearchModal` import):

```ts
import { ThemeToggle } from '@/components/reader/ThemeToggle';
```

- [ ] **Step 2: DesktopTopNav — insert the toggle**

In the same file, find the search button immediately followed by `<NotificationBell />`:

```tsx
              <SearchIcon className="h-4 w-4" />
            </button>
            <NotificationBell />
```

Replace it with (insert `<ThemeToggle />` between them):

```tsx
              <SearchIcon className="h-4 w-4" />
            </button>
            <ThemeToggle />
            <NotificationBell />
```

- [ ] **Step 3: ReaderHeader — add import**

In `apps/frontend/src/components/reader/ReaderHeader.tsx`, add alongside the other imports (e.g., after the `AvatarMenu` import):

```ts
import { ThemeToggle } from '@/components/reader/ThemeToggle';
```

- [ ] **Step 4: ReaderHeader — insert the toggle**

In the same file, find the search button immediately followed by `<NotificationBell />`:

```tsx
              <SearchIcon className="h-4 w-4" />
            </button>
            <NotificationBell />
```

Replace it with:

```tsx
              <SearchIcon className="h-4 w-4" />
            </button>
            <ThemeToggle />
            <NotificationBell />
```

- [ ] **Step 5: Typecheck + full frontend test**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors; `ThemeToggle` import resolves in both files.

Run: `pnpm --filter @smanga/frontend test`
Expected: existing suite stays green.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/layout/DesktopTopNav.tsx apps/frontend/src/components/reader/ReaderHeader.tsx
git commit -m "feat(frontend): theme toggle in desktop + mobile headers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Controller verification (Playwright MCP proof)

**Context:** Controller-only (needs the running dev stack + Playwright MCP). Dev stack already running (frontend :3000, API :3010, proxy → :3010).

- [ ] **Step 1: Desktop toggle**

Navigate to `http://localhost:3000/`. Verify a Moon icon button sits between search and the notification bell. Click it → `document.documentElement.dataset.theme` flips to `dark`, the page goes dark, and the icon becomes a Sun. Click again → back to `light` / Moon. Screenshot both states.

- [ ] **Step 2: Mobile toggle**

Resize to ~390×800. Verify the toggle appears in `ReaderHeader` (between search and bell) and toggles `data-theme` light↔dark. Screenshot.

- [ ] **Step 3: Drawer sync**

Open the reader-settings drawer ("Cài đặt đọc"); confirm its "Giao diện" segmented control reflects the current theme set via the header toggle (both read the same `useReaderPrefs` store), and that choosing "Hệ thống" there still works.

- [ ] **Step 4: Refresh the graph + report**

Run: `graphify update .`
Summarize screenshots as proof. Do NOT push without explicit user instruction (remote is `SManga`).

---

## Self-Review

**Spec coverage:**
- 2-state light↔dark toggle, lands on explicit theme → Task 1 (`setTheme(isDark ? 'light' : 'dark')`). ✓
- Resolved-appearance icon incl. `system` via matchMedia → Task 1 (`systemPrefersDark` state + listener). ✓
- Moon-in-light / Sun-in-dark, dynamic aria-label + aria-pressed, focus ring, header-button styling → Task 1. ✓
- Both headers, between search and bell → Task 2 (DesktopTopNav + ReaderHeader). ✓
- Reuse store/persistence; drawer 3-option unchanged → no store/ReaderSettings edits in any task. ✓
- Verification = Playwright, no unit tests → Task 3 + banner. ✓

**Placeholder scan:** No TBD/TODO; complete code in every code step. The two header insertion anchors are identical 3-line snippets but live in different files (each edit is file-scoped, so unambiguous).

**Type consistency:** `ThemeToggle` is a zero-prop component — both headers render `<ThemeToggle />`. `useReaderPrefs` selectors return `theme: ReaderTheme` and `setTheme: (t: ReaderTheme) => void`; `setTheme('light'|'dark')` passes valid `ReaderTheme` values. ✓
