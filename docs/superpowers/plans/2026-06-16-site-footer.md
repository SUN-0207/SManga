# Site Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop-only minimal `AppShell` footer with a proper `SiteFooter` (brand + tagline / nav / genres / copyright) shown on all breakpoints.

**Architecture:** A new presentational `SiteFooter` component reuses the existing `Logo` and `FooterGenreBlock`. `AppShell` renders `<SiteFooter />` (no longer breakpoint-gated) in place of its inline `<footer>`. No backend, no data changes.

**Tech Stack:** Vite + React 19 + TanStack Router + Tailwind (semantic CSS-var tokens) + Lucide.

**Spec:** `docs/superpowers/specs/2026-06-16-site-footer-design.md`

---

## ⚠️ Verification model (read first)

Purely visual/layout work — **NO unit tests.** Do NOT fabricate them. Per-task check: `pnpm --filter @smanga/frontend typecheck` passes. Final visual check is a **Playwright MCP proof run by the controller** (Task 3).

**Commit hygiene (all tasks):** commit ONLY the files listed (explicit `git add <path>`; never `git add -A`). `apps/frontend/vite.config.ts` is intentionally modified (local dev proxy → :3010) and must **NOT** be committed. English-only identifiers (Vietnamese only in JSX text). Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push or amend. lefthook pre-commit runs lint+typecheck — fix causes, never bypass.

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `apps/frontend/src/components/layout/SiteFooter.tsx` | The full site footer (brand + nav + genres + copyright) | Create |
| `apps/frontend/src/components/layout/AppShell.tsx` | Render `<SiteFooter />` instead of the inline footer | Modify |

`apps/frontend/src/components/layout/FooterGenreBlock.tsx` is reused unchanged (now imported by `SiteFooter` instead of `AppShell`).

---

## Task 1: Create `SiteFooter`

**Files:**
- Create: `apps/frontend/src/components/layout/SiteFooter.tsx`

**Context:** `Logo` (`@/components/ui/Logo`) renders the brand mark + "SManga" wordmark (`<Logo size={28} />`). `FooterGenreBlock` (`./FooterGenreBlock`) renders a "Khám phá theo thể loại" heading + top-genre links (returns `null` if no genres). Route search params: `/` and `/tu-sach` take none; `/kham-pha` needs `{ q: '', page: 1, genre: undefined }`; `/bang-xep-hang` needs `{ tab: 'hot', page: 1 }`.

- [ ] **Step 1: Create the component**

Create `apps/frontend/src/components/layout/SiteFooter.tsx`:

```tsx
import { FooterGenreBlock } from '@/components/layout/FooterGenreBlock';
import { Logo } from '@/components/ui/Logo';
import { Link } from '@tanstack/react-router';

const linkClass =
  'text-body-sm text-fg-muted hover:text-fg transition-colors duration-fast rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer';

/**
 * Public/reader site footer (rendered by AppShell on all breakpoints):
 * brand + tagline, primary nav, top genres, and a copyright bar.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-bg-subtle">
      <div className="container py-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.5fr_1fr_1.5fr]">
          {/* Brand */}
          <div>
            <Logo size={28} />
            <p className="mt-4 max-w-xs text-body-sm text-fg-muted leading-relaxed">
              Thư viện truyện chữ Việt — đọc online miễn phí, không quảng cáo, không pop-up.
            </p>
          </div>

          {/* Primary nav */}
          <nav aria-label="Điều hướng chân trang">
            <h4 className="text-label uppercase text-fg-muted mb-3">Điều hướng</h4>
            <ul className="space-y-2 list-none p-0">
              <li>
                <Link to="/" className={linkClass}>
                  Trang chủ
                </Link>
              </li>
              <li>
                <Link
                  to="/kham-pha"
                  search={{ q: '', page: 1, genre: undefined }}
                  className={linkClass}
                >
                  Khám phá
                </Link>
              </li>
              <li>
                <Link to="/bang-xep-hang" search={{ tab: 'hot', page: 1 }} className={linkClass}>
                  Bảng xếp hạng
                </Link>
              </li>
              <li>
                <Link to="/tu-sach" className={linkClass}>
                  Tủ sách
                </Link>
              </li>
            </ul>
          </nav>

          {/* Genres (reused block) */}
          <FooterGenreBlock />
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-body-sm text-fg-muted text-center md:text-left">
            © {year} SManga · Đọc truyện chữ Việt
          </p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors. (If `/bang-xep-hang` or `/kham-pha` search typing complains, the search objects above are the correct shapes from their route `validateSearch` — adjust only if the route definition differs.) Component not yet imported — this just verifies it compiles.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/layout/SiteFooter.tsx
git commit -m "feat(frontend): SiteFooter (brand + nav + genres + copyright)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Render `SiteFooter` in `AppShell`

**Files:**
- Modify: `apps/frontend/src/components/layout/AppShell.tsx`

**Context:** `AppShell` currently renders an inline `<footer className="hidden lg:block …">` (desktop-only) that uses `FooterGenreBlock` + a one-line copyright. Replace it with `<SiteFooter />` (shows on all breakpoints) and swap the import. The footer is no longer desktop-gated.

- [ ] **Step 1: Swap the import**

In `apps/frontend/src/components/layout/AppShell.tsx`, replace the line:

```tsx
import { FooterGenreBlock } from './FooterGenreBlock';
```

with:

```tsx
import { SiteFooter } from './SiteFooter';
```

- [ ] **Step 2: Replace the inline footer + update the doc comment**

Replace the inline footer block:

```tsx
      <main className="flex-1">{children}</main>
      <footer className="hidden lg:block border-t border-border py-8">
        <div className="container space-y-6">
          <FooterGenreBlock />
          <p className="text-body-sm text-fg-muted text-center">SManga · Đọc truyện chữ</p>
        </div>
      </footer>
    </div>
```

with:

```tsx
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
```

Then update the component's JSDoc comment so the layout lines read (footer now on both breakpoints):

```tsx
/**
 * Reader root layout. Renders:
 *   Desktop (≥1024px):  DesktopTopNav (sticky) → main → SiteFooter
 *   Mobile (<1024px):   ReaderHeader (mini, with hamburger → MobileNavDrawer) → main → SiteFooter
 *
 * BottomTabBar removed 2026-06-08 — mobile primary nav now lives in the
 * hamburger drawer mirroring DesktopTopNav.NAV, so the two breakpoints
 * share the exact same nav surface (Đọc / Khám phá / Bảng xếp hạng / Tủ sách).
 */
```

- [ ] **Step 3: Typecheck + full frontend test**

Run: `pnpm --filter @smanga/frontend typecheck`
Expected: no errors, no remaining reference to `FooterGenreBlock` in `AppShell.tsx`.

Run: `pnpm --filter @smanga/frontend test`
Expected: existing suite stays green.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/layout/AppShell.tsx
git commit -m "feat(frontend): render SiteFooter on all breakpoints

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Controller verification (Playwright MCP proof)

**Context:** Controller-only (needs the running dev stack + Playwright MCP). The dev stack is already running (frontend :3000, API :3010, proxy temp-pointed to :3010). Not for implementer subagents.

- [ ] **Step 1: Desktop footer**

Navigate to `http://localhost:3000/`, ensure `data-theme="light"`, scroll to the bottom. Verify + screenshot: 3 columns (brand + tagline / Điều hướng / Thể loại) + a `© {current year} SManga · Đọc truyện chữ Việt` bar; the nav + genre links resolve.

- [ ] **Step 2: Mobile footer**

Resize to ~390×800, scroll to the bottom of `/`. Verify the footer is now **present** (it was absent before) and the columns stack; copyright centered. Screenshot.

- [ ] **Step 3: Other-page + shell exclusions**

Navigate to `/kham-pha` — confirm the same footer appears at the bottom. Navigate to `/dang-nhap` and `/admin` — confirm there is NO `SiteFooter` (those shells are excluded). Screenshot `/kham-pha`.

- [ ] **Step 4: Refresh the graph + report**

Run: `graphify update .`
Summarize the screenshots as proof. Do NOT push without explicit user instruction (remote is `SManga`).

---

## Self-Review

**Spec coverage:**
- Replace desktop-only inline footer with `SiteFooter` → Tasks 1 + 2. ✓
- Shown on all breakpoints (mobile included) → Task 2 (no `hidden lg:block`); verified Task 3 Step 2. ✓
- Standard content: brand+tagline / nav / genres / `© {year}` → Task 1 Step 1. ✓
- Reuse `Logo` + `FooterGenreBlock` → Task 1 imports. ✓
- Public/reader shell only; admin + auth excluded → unchanged `__root.tsx` ownsShell logic; verified Task 3 Step 3. ✓
- Styling (border-t + bg-bg-subtle band, label headings, muted links + focus rings) → Task 1 Step 1. ✓
- Verification = Playwright, no unit tests → Task 3 + banner. ✓

**Placeholder scan:** No TBD/TODO; complete code in every code step.

**Type consistency:** `SiteFooter` is a zero-prop component — `AppShell` renders `<SiteFooter />` (matches). Route search shapes match each route's `validateSearch` (`/kham-pha` = `{q,page,genre}`, `/bang-xep-hang` = `{tab,page}`, `/` + `/tu-sach` = none). `Logo` accepts `size` (number). `FooterGenreBlock` is a zero-prop component. ✓
