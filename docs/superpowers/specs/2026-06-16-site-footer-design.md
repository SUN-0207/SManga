# Site Footer — Design

> **Status:** Approved 2026-06-16. Next step: writing-plans.
> **Problem:** The app has only a minimal, **desktop-only** footer (`AppShell` inline `<footer className="hidden lg:block">` = a genre-links row + a one-line "SManga · Đọc truyện chữ"). On mobile there is no footer at all, and on desktop it's barely present.

## Goal

Replace the inline footer with a proper, structured `SiteFooter` shown on **all breakpoints** — brand + tagline, navigation links, genre links, and a copyright bar — matching the design system.

## Decisions (locked)

- **Content depth: "Standard"** — brand+tagline / nav / genres / copyright. No About/Contact/Privacy columns, no social, no newsletter (YAGNI; those pages don't exist).
- **Shown on all breakpoints** (mobile included) — drop the current `hidden lg:block`.
- **Scope: public/reader shell only** (`AppShell`). Admin (`/admin/*`) and auth (`/dang-nhap`, `/dang-ky`) own their shells and get no footer — unchanged.

## Architecture

### New component: `SiteFooter`

`apps/frontend/src/components/layout/SiteFooter.tsx` — a self-contained presentational footer.

- **Structure (desktop ≥ md): a 3-column grid + a bottom bar.**
  - **Brand column** (spans wider): `<Logo />` (from `@/components/ui/Logo`, the same lockup the top nav uses) + a tagline paragraph: *"Thư viện truyện chữ Việt — đọc online miễn phí, không quảng cáo, không pop-up."*
  - **"Điều hướng" column**: a heading + vertical list of links — Trang chủ (`/`), Khám phá (`/kham-pha`), Bảng xếp hạng (`/bang-xep-hang`), Tủ sách (`/tu-sach`). `/kham-pha` uses `search={{ q: '', page: 1, genre: undefined }}` (mirroring the homepage links); others use plain `to`. Any route requiring search params is satisfied to keep TanStack Router typing happy (resolved at typecheck).
  - **"Thể loại" column**: reuses the existing `FooterGenreBlock` component (top genres with `storyCount > 0`, links to `/kham-pha?genre=…`).
  - **Bottom bar** (full width, divider above): `© {year} SManga · Đọc truyện chữ Việt`, where `year = new Date().getFullYear()`.
- **Mobile (< md):** the three columns stack vertically (`grid-cols-1`); the bottom bar centers.

### `AppShell` change

`apps/frontend/src/components/layout/AppShell.tsx`: replace the current inline `<footer className="hidden lg:block …">…</footer>` block (which renders `FooterGenreBlock` + the one-line copyright) with `<SiteFooter />`. The footer is no longer breakpoint-gated, so it shows on mobile and desktop. `FooterGenreBlock` is no longer imported by `AppShell` directly (it's now imported by `SiteFooter`).

## Styling (on-brand)

- Footer wrapper: `border-t border-border bg-bg-subtle` so it reads as a distinct band beneath the page; inner `container` with `py-12` (generous) padding.
- Column headings: `text-label uppercase text-fg-muted` (the project's label token).
- Links: `text-body-sm text-fg-muted hover:text-fg transition-colors duration-fast`, visible focus ring (`focus-visible:ring-2 focus-visible:ring-accent`), `cursor-pointer`.
- Tagline/copyright: `text-body-sm text-fg-muted`.
- Accent only on the `Logo` mark. No emoji icons.
- Respects `prefers-reduced-motion` (only color transitions, which are mild). Responsive at 375 / 768 / 1024 / 1440.

## Testing

- **No unit tests** (purely presentational/layout). Verification is **Playwright MCP proof** on localhost:
  1. Desktop (~1366px): footer shows the 3 columns (brand+tagline / Điều hướng / Thể loại) + copyright bar with the current year; nav + genre links resolve.
  2. Mobile (~390px): footer is present (previously absent) and columns stack; copyright centered.
  3. Spot-check a non-home AppShell page (e.g. `/kham-pha`) shows the same footer; confirm `/admin` and `/dang-nhap` still have NO footer.
  - Capture screenshots as proof.
- `pnpm --filter @smanga/frontend typecheck` + existing test suite stay green.
