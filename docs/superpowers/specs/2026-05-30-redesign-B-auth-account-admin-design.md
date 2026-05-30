# SManga Redesign — Spec B: Auth, Account, Admin Retoken

**Date:** 2026-05-30
**Part:** B of 3 (sibling specs: [A-tokens-shells-reader](./2026-05-30-redesign-A-tokens-shells-reader-design.md), [C-differentiators](./2026-05-30-redesign-C-differentiators-design.md))
**Depends on:** Spec A (Phase A1 token layer must ship first)

## Why this exists

Auth, Account, and Admin pages all have working structure but use the **stale token set** (sky-blue MASTER.md remnants + ad-hoc zinc/pink mixes from many sessions). Once Spec A's token layer lands, these pages need a focused retoken pass to look consistent with the new dark-default Modern Tech-Editorial direction. No structural changes — just visual + a small UX upgrade to the Reader Settings drawer.

This spec is intentionally **smaller in scope** than Spec A — the heavy lift on these surfaces was done in earlier sessions. The work here is mostly token swap + a few polish moments (segmented control in settings, sidebar active state with glow, table chrome refresh).

## Decisions (locked from Spec A brainstorming)

Inherits everything from Spec A's "Decisions" table. No new decisions in B.

## Pages affected

### 1. Auth — `/dang-nhap` + `/dang-ky`

Current state (post-recent session): split-screen editorial layout with hero left (pink gradient + serif quote) + form right. Already redesigned with new approach but uses Tailwind defaults + zinc tokens.

**Retoken**:
- LEFT pane: swap pink-50/rose-50 gradient → **dark gradient** `linear-gradient(135deg, #0A0A0A, rgba(236,72,153,0.12))` with a glow orb in top-right (radial pink/25%). Eyebrow "TẠP CHÍ TRUYỆN CHỮ VIỆT" in white/40%, blockquote in display-md Inter (NOT Newsreader — auth = chrome, not prose), tagline italic in white/60%.
- RIGHT pane: pure `bg` background, form panel (no card wrapper), input borders `border` token, focus ring pink/40 with glow.
- Inputs: h-11 rounded-md, bg `bg-elevated`, placeholder `fg-subtle`, value `fg`.
- Password show/hide toggle: keep current eye icon, restyle button bg `bg-subtle` on hover.
- **Google button** (when providers.google = true): bg `bg-elevated`, border `border-strong`, Google G logo full-color (not monochrome — official guideline), hover bg `bg-subtle`. Stays above email/pass form with "HOẶC" divider.
- **Primary CTA "Đăng nhập" / "Tạo tài khoản"**: gradient pink → fuchsia bg + `--glow-pink-soft` shadow + white text 14px bold. On disabled state: opacity 50% + cursor not-allowed.
- Cross-link "Tạo tài khoản mới / Đăng nhập" at bottom: muted text + accent link.
- Mobile: stack vertically, hero collapses to compact header (logo + mini eyebrow).

### 2. Account — `/tai-khoan`

Current: container max-w-3xl with 3 cards stacked (Ảnh đại diện / Thông tin cá nhân / Bảo mật). Recent session added this whole page.

**Retoken**:
- Page header: eyebrow "TÀI KHOẢN" → uppercase tracking-[0.22em] muted; H1 display-md.
- Cards: `bg-elevated` background, border `border` token, radius `lg` (16px), padding p-5/p-6, header section border-bottom `border`/60%.
- Avatar card: preview circle h-20 w-20 with `border` ring; "Tải ảnh lên" button styled as outlined `border-strong` with Camera icon; "Xoá ảnh" as destructive ghost button (text-destructive on hover).
- Form fields: same input styling as Auth (above).
- "Lưu thay đổi" primary button: dark `bg-fg` text-bg (NOT pink — saving is utilitarian, not branded). Disabled when not dirty.
- "✓ Đã lưu" flash: positive token color with Check icon.
- "Đổi mật khẩu" form: same primary button styling, pink hint chip when new password meets criteria.

**Slot for Reading stats card** (Spec C plugs in here): top of page, between page header and first existing card. Component name `ReadingStatsCard` lives in Spec C.

### 3. Reader Settings drawer (`ReaderSettings.tsx`)

Current: opens from avatar dropdown → "Cài đặt" → right slide-over drawer. Has 3 RadioGroups (Giao diện / Cỡ chữ / Phông chữ) + Khôi phục mặc định button.

**Upgrade radio groups to segmented controls**:
- Container: pill-bg `bg-subtle` rounded-pill p-1, options as buttons
- Active option: `bg-fg` text-bg shadow-sm (or `bg-elevated` in dark) — looks like the active option pops out
- Inactive: transparent, hover `bg-subtle/60%`
- Animation: active background slides between options (200ms ease-out, with `view-transitions` if browser supports, fallback CSS transform)

**Add live preview** (small addition):
- Below the 3 segmented controls, a "Bản xem trước" section: shows a 3-line excerpt of fake chapter text rendered with current font-size + font-family choices. Updates instantly on change so user sees what 18px Newsreader will look like before closing the drawer.

**Drawer chrome retoken**: header h-14, "Cài đặt đọc" Inter heading-lg, X close button bg `bg-subtle` on hover. Background `bg-elevated`. Border `border`.

### 4. Admin — `/admin/*` retoken

Structure-preserving — sidebar shell + top bar + content area all keep current layout. Apply Spec A tokens consistently.

**Sidebar** (`/admin/route.tsx`):
- Background `bg` (was border-r `border` to main `bg-muted/20`)
- Brand area top: same SManga + ADMIN label, h-16, border-bottom `border`/60%
- Nav items: h-9 px-3 rounded-md, inactive `text-fg-muted hover:bg-bg-subtle`, **active `bg-gradient-to-r from-accent to-accent-strong text-white` with `--glow-pink-soft` shadow** (the signature touch)
- Footer "Xem trang đọc" link: same as nav item style but icon ExternalLink

**Top bar** (admin layout):
- Sticky h-14 sm:h-16, `bg/95% backdrop-blur-md`, border-b `border`
- Right side: email muted + "Đăng xuất" outlined button (icon + label, always visible per past feedback)
- Mobile: hamburger left + "SManga Admin" label + Đăng xuất right (preserved from current)

**Tables** (Jobs, Users, Stories, Sources, Discover):
- Header row: sticky top with `bg/95% backdrop-blur`, border-b `border`, label text-[11px] uppercase muted
- Body rows: border-b `border`/60% (last:border-0), hover `bg-bg-subtle/60%`
- Selected row (where applicable, e.g., Discover, Stories bulk): `bg-bg-subtle` solid + pink accent border-left 2px
- Status badges: refresh tone to use new tokens (e.g., "Hoàn thành" positive token, "Thất bại" destructive token, "Mới" accent token)
- Action buttons in rows: outlined `bg-bg-subtle` ghost style; destructive (delete) hover `bg-destructive/10`

**Dashboard stat cards** (`/admin/index.tsx`):
- Card style same as Account cards
- Value display: `text-display-sm tabular-nums tracking-tight`
- When value is positive accent (e.g., Đã crawl > 0): value text gets gradient treatment via `bg-clip-text`
- Sub-line: text-body-sm muted

**Discover ActionBar + Stories ActionBar**:
- Floating bottom pill bar: `bg-elevated` rounded-2xl, border `border-strong`, shadow-elev
- Count chip: gradient pink + white text
- Primary action (Import + crawl / Quét + Crawl): gradient pink button with glow
- Secondary actions: outlined `border-strong` + bg-subtle hover

**Modal pattern (Delete confirm in /admin/users)**:
- Backdrop: `bg-fg/40 backdrop-blur-sm` (current)
- Modal panel: `bg-elevated` rounded-xl border `border` shadow-elev
- Destructive accent: `bg-destructive` text-white for the final confirm button

## Routes affected

None added or removed. All current admin/auth/account routes preserved.

## Acceptance criteria

- Auth pages render correctly in dark theme (default), light theme (Cài đặt drawer toggle)
- Login + register flows still work end-to-end (no behavior change)
- Google button shows correctly when `providers.google === true`
- Account page renders all 3 existing cards + leaves slot above for Spec C's ReadingStatsCard
- Avatar upload still produces 256×256 webp (no logic change, just card styling)
- Password change error path still displays "Mật khẩu hiện tại không đúng." in destructive token
- Reader Settings drawer opens from avatar dropdown → segmented controls + live preview render + selections persist
- Admin sidebar active item shows gradient pink with glow
- Admin tables, stat cards, action bars all use Spec A tokens consistently
- Delete user modal still requires email confirmation, button styling matches new destructive token

## Out of scope

- All structural / behavior changes (those happened in earlier sessions)
- Reader pages, layout shells, navigation IA → **Spec A**
- Reading stats endpoint + card content → **Spec C**
- Drop-cap, empty states, continue-reading bar logic → **Spec C**
- New admin features (no scope creep)

## Risks + mitigations

- **Risk**: Token swap on admin tables could break sticky header behavior if `bg-opacity` doesn't carry. **Mitigation**: explicit `backdrop-blur-md` + `bg/95%` on sticky elements; test in both themes.
- **Risk**: Segmented control with sliding active background is complex (View Transitions API spotty in Firefox). **Mitigation**: CSS-only fallback (animate `transform` on active position via React layout effect measuring offset).
- **Risk**: Live preview in settings drawer adds re-renders. **Mitigation**: preview is one component reading from same zustand store; React reconciler handles it fine.

## Migration phases (within this spec)

1. **Phase B1**: Auth retoken (login + register) — smallest blast radius, easy to verify visually
2. **Phase B2**: Account retoken + segmented control in Reader Settings drawer
3. **Phase B3**: Admin retoken — sidebar + top bar first, then tables + dashboard + action bars

Each phase = own commit set + local verify. Push only when user explicitly confirms.
