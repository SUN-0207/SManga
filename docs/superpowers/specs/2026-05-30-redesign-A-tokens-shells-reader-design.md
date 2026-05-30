# SManga Redesign — Spec A: Tokens, Shells, Reader Pages

**Date:** 2026-05-30
**Part:** A of 3 (sibling specs: [B-auth-account-admin](./2026-05-30-redesign-B-auth-account-admin-design.md), [C-differentiators](./2026-05-30-redesign-C-differentiators-design.md))
**Approach:** Modern Tech-Editorial · Reader's Companion DNA · dark default + light opt-in

## Why this exists

Current UI is functional but inconsistent — the editorial direction (Newsreader serif + zinc + pink) was retrofitted onto shadcn defaults across many sessions, leaving stale tokens in `design-system/smanga/MASTER.md` (sky blue + Outfit) that no longer reflect reality. The reader pages (where users spend 90% of their time) lack the typography polish and continue-reading affordances that would set SManga apart from typical Vietnamese novel-reader sites (truyenfull, truyenyy) and justify it as a curated reading destination.

This spec sets the **foundation layer**: design tokens, layout shells (desktop + mobile bottom-tab), navigation IA, and the redesigned reader pages (Home / Story detail / Chapter reader / Library / Discover / Bạn tab). It establishes the visual + structural baseline that specs B and C build on.

## Decisions (locked from brainstorming)

| Decision | Choice |
|---|---|
| Visual direction | Modern Tech-Editorial — dark-first, Inter sans, neon pink gradient, glow signature |
| Theme | Dark default · light opt-in via Cài đặt drawer (system-aware not used) |
| Mobile nav | Bottom tab bar (4 tabs: Đọc / Khám phá / Tủ sách / Bạn) |
| Motion | Moderate — page transitions, hover lifts, scroll-driven chapter progress, micro-anim on pink CTA; `prefers-reduced-motion` strictly respected |
| Reading prose font | Keep Newsreader serif (long-form readability) — Inter elsewhere |
| Brand DNA | Reader's Companion — typography + continue-reading + streaks + beautiful empty states |

## Design tokens

CSS custom properties on `:root[data-theme="dark"]` and `:root[data-theme="light"]`. Tailwind config consumes via `hsl(var(--…))`. Replaces the old shadcn defaults and the stale MASTER.md tokens.

```css
:root[data-theme="dark"] {
  --bg:           #0A0A0A;          /* page bg, deeper than zinc-900 */
  --bg-elevated:  #18181B;          /* cards, modals */
  --bg-subtle:    rgba(255,255,255,0.04);
  --fg:           #FAFAFA;
  --fg-muted:     rgba(255,255,255,0.6);
  --fg-subtle:    rgba(255,255,255,0.4);
  --accent:       #EC4899;          /* pink-500, used for CTA + active state */
  --accent-strong:#F472B6;          /* pink-400, gradient stop */
  --border:       rgba(255,255,255,0.08);
  --border-strong:rgba(255,255,255,0.16);
  --destructive:  #F43F5E;
  --positive:     #34D399;
}

:root[data-theme="light"] {
  --bg:           #FAFAFA;
  --bg-elevated:  #FFFFFF;
  --bg-subtle:    #F4F4F5;
  --fg:           #18181B;
  --fg-muted:     #52525B;
  --fg-subtle:    #A1A1AA;
  --accent:       #EC4899;          /* same brand color both themes */
  --accent-strong:#F472B6;
  --border:       #E4E4E7;
  --border-strong:#D4D4D8;
  --destructive:  #E11D48;
  --positive:     #059669;
}
```

**Typography**

```
--font-sans:  'Inter', system-ui, sans-serif;        /* UI chrome: all headings, body, buttons, inputs, labels */
--font-prose: 'Newsreader', 'Source Serif Pro', Georgia, serif;  /* CHAPTER READER content only */
--font-mono:  'JetBrains Mono', ui-monospace;        /* admin tables, IDs, timestamps */
```

Type scale (only sizes used in app):

| Token | Size / line-height | Usage |
|---|---|---|
| `text-display-xl` | 64/1.0 800 -0.03em | Hero on landing (lg+ only) |
| `text-display-lg` | 48/1.05 800 -0.03em | Hero (sm-md) |
| `text-display-md` | 36/1.05 800 -0.02em | Page heading (lg+) |
| `text-display-sm` | 28/1.1 800 -0.02em | Page heading (mobile) |
| `text-heading-lg` | 22/1.2 700 -0.02em | Section heading |
| `text-heading-md` | 18/1.3 700 -0.01em | Card heading |
| `text-body` | 14/1.5 400 | Default body |
| `text-body-sm` | 13/1.5 400 | Compact body, captions |
| `text-label` | 11/1 600 0.18em uppercase | Eyebrow labels |
| `text-prose` | 18/1.75 400 (16/1.7 mobile) | Chapter content (user-adjustable) |
| `text-mono` | 12/1.4 | Admin data, code |

**Spacing** (4px base): xs=4 · sm=8 · md=12 · lg=16 · xl=24 · 2xl=32 · 3xl=48 · 4xl=64 · 5xl=96

**Radius**: sm=6 (inputs, chips) · md=10 (buttons, small cards) · lg=16 (cards) · xl=24 (modals, drawers) · pill=9999

**Motion**: fast=150ms · base=200ms · slow=300ms. Default ease `cubic-bezier(0.4, 0, 0.2, 1)`. Spring ease `cubic-bezier(0.34, 1.56, 0.64, 1)` for pill snap.

**Signature shadows**

```
--glow-pink:        0 0 24px rgba(236,72,153,0.4), 0 0 64px rgba(236,72,153,0.15);
--glow-pink-soft:   0 0 16px rgba(236,72,153,0.2);
--shadow-elev:      0 8px 24px rgba(0,0,0,0.4);     /* dark only */
--shadow-elev-light:0 8px 24px rgba(0,0,0,0.08);    /* light only */
```

**Gradient**: `linear-gradient(135deg, var(--accent), var(--accent-strong))` used for: drop-caps, primary CTA backgrounds, active sparkline bars, avatar fallback chips.

## Layout shells

### Desktop shell (≥1024px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Top header (h-14, sticky, bg/85% + backdrop-blur, border-b)         │
│ ─────────────────────────────────────────────────────────────────── │
│  SManga  │  Đọc  Khám phá  Tủ sách        🔍  ⚙  [A]               │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│ Đọc tiếp bar (h-12, sticky below header, conditional render)        │
│ ─────────────────────────────────────────────────────────────────── │
│ ▮ Đọc tiếp · Ch.47/671    Xuyên Thư Chi Bá Ái...    [Tiếp tục →]  │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│ Content area  (max-w-6xl mx-auto, px-6)                              │
│ ...                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

- Active nav item: gradient pink underline 2px + `text-fg` (vs `text-fg-muted` for inactive)
- Avatar: gradient pink/fuchsia circle with first letter, click opens dropdown (existing pattern)
- Đọc tiếp bar: subtle gradient `linear-gradient(90deg, pink/12%, pink/4%)`, hides when chapter reader is the active route OR when no `reading_progress` row exists

### Mobile shell (<768px)

```
┌─────────────────────────────────────────┐
│ Top mini-header (h-12, sticky, no nav)  │
│ SManga                  🔍  [A]         │
├─────────────────────────────────────────┤
│ Đọc tiếp bar (h-10, sticky, condition.) │
│ ▮ Ch.47 · Xuyên Thư...           →     │
├─────────────────────────────────────────┤
│                                         │
│  Content area (px-4)                    │
│                                         │
├─────────────────────────────────────────┤
│ Bottom tab bar (h-16, sticky, blur)     │
│  📖   🔍   📚   👤                       │
│  Đọc  Khám  Tủ   Bạn                    │
└─────────────────────────────────────────┘
```

Bottom tab bar:
- 4 items, equal width grid
- Active: pink filled icon + pink label (text-[10px] 700)
- Inactive: white/60% outlined icon + label
- Active indicator: 2px pink line at top of tab (subtle)
- Safe area inset bottom for iOS PWA later

### Tablet (768–1023px)

Uses mobile shell (bottom tab bar) with wider content padding (`px-8`). Content grids step up to 2-col where appropriate. Switch to desktop top-nav shell at `lg` breakpoint.

### Navigation IA — 4 reader tabs

| Tab | Route | Purpose |
|---|---|---|
| **Đọc** | `/` | Home. Logged-in w/ progress → Đọc tiếp hero. Else → tagline hero. Always shows Mới cập nhật + Đề xuất |
| **Khám phá** | `/kham-pha` (new) | Search input + genre chips + full catalog browse |
| **Tủ sách** | `/tu-sach` (existing) | Personal library — 3 sub-tabs Đang đọc / Đã lưu / Đã hoàn thành |
| **Bạn** | `/ban` (new, redirect → `/tai-khoan` profile if logged in) | Profile + settings + admin shortcut (admin only) + logout |

Notes:
- `/tim-kiem` existing route consolidates into Khám phá tab (search at top of that page).
- Admin pages (`/admin/*`) keep separate top nav + sidebar (not in tab bar).
- Chapter reader (`/truyen/$slug/chuong/$index`) hides bottom tab bar (full-screen reading).

## Page-by-page design

### Đọc (Home) — `/`

**Logged-in user with `reading_progress` rows:**

1. **"Đọc tiếp" hero** (top): big card with cover thumbnail (h-32 w-24), story title (heading-lg), "Chương N / Total · X% đọc", progress bar (gradient pink), primary CTA "Tiếp tục đọc" (pink filled, glow). Card has subtle backdrop gradient using cover-extracted color via canvas (defer to spec C).
2. **Mới cập nhật** section: grid of story cards (3-col desktop, 2-col tablet, 1-col mobile carousel). Each card: cover (3:4), title (heading-md, 2-line clamp), author (body-sm muted).
3. **Đề xuất theo thể loại** section: genre-aware curated row, defer ML to spec C — for MVP use most-read genres.

**Anonymous or no-progress user:**

1. **Hero**: large display heading with gradient text accent (current vibe), tagline, 2 CTAs (pink "Khám phá truyện" + outlined "Đăng nhập").
2. **Featured story**: cover-driven card with story title + author + first line of description.
3. **Mới cập nhật** + **Đề xuất** as above.

### Story detail — `/truyen/$slug`

- **Hero** (split layout): cover left (max 240px wide on desktop, 160px mobile) with gradient backdrop bleed; info right with eyebrow "TRUYỆN NỔI BẬT", title (display-sm), author + status pill + genre pills row, totalChapters + lastChapterAt, description (collapsible after 4 lines).
- **CTAs**: "Đọc từ đầu" outline + "Đọc tiếp Chương N" pink filled (replaces single "Đọc ngay" when user has progress).
- **Lưu truyện** button (Library icon) — adds to bookmarks.
- **Chapter list**: paginated 50/page (existing API), grid 3-col on desktop / 2-col tablet / 1-col mobile. Each row: "Chương N" mono label (5.25rem fixed width) + chapter title (truncate). Crawled rows are clickable; pending rows muted with Clock icon.

### Chapter reader — `/truyen/$slug/chuong/$index`

Centerpiece. Distraction-first.

- **No persistent app chrome** (top header + bottom tab bar both hide); replaced with auto-hide overlay
- **Top overlay** (fade in on tap/mouse-move/scroll-up): back button + breadcrumb (story title small + "Chương N / Total") + 2 right-icons (Mục lục drawer, Cài đặt drawer)
- **Bottom floating pill** (always visible): "← Ch.N-1" outlined + "Ch.N+1 →" pink filled (glow). Position `fixed bottom-4 left-1/2 -translate-x-1/2`, thumb-zone on mobile.
- **Top progress bar**: 2px pink gradient bar tracking scroll, glow. CSS `scroll-timeline` where supported.
- **Title block**: chapter title (`text-display-sm` Newsreader serif 600 — note: title is Newsreader to match prose), eyebrow "CHƯƠNG N · 4 PHÚT ĐỌC" (mono label).
- **Prose**: Newsreader 18/1.75 (user adjustable to 15/17/20/24), max-w 65ch centered, first chapter paragraph gets **drop-cap** (4 lines tall, pink gradient text — spec C details).
- **Auto-save progress**: existing 5s on-page trigger keeps working.

### Tủ sách — `/tu-sach`

- **Tabs row** (top): Đang đọc · Đã lưu · Đã hoàn thành (count badges)
- **Reading stats card** (top-of-page hero — spec C): only shown if logged in with any progress. Compact version on mobile.
- Each tab = grid of "library cards" (different from generic story cards):
  - cover (3:4, lg=h-48 / md=h-40 / sm=h-32)
  - title + author below
  - progress bar (3px gradient pink) — shows X% if Đang đọc, hides on Đã lưu / Đã hoàn thành
  - "Đọc tiếp" mini-button bottom-right (pink) jump straight to next chapter
  - last read time (body-sm muted)
- **Empty state** for each tab: spec C details (sách-themed illustration + copy + CTA "Khám phá truyện").

### Khám phá — `/kham-pha` (new, partially replaces `/tim-kiem`)

- **Search input** at top (sticky on desktop): large rounded-pill input with search icon, placeholder "Tìm truyện, tác giả..."; submit triggers search results inline below
- **Genre chips** horizontal scroll on mobile, wrap-flex on desktop
- **Featured sections**: Mới cập nhật / Hoàn thành mới / Đọc nhiều — each = 3-col grid
- **Full catalog** browse: infinite scroll grid w/ filter (status, chapter count range, sort) drawer slide-from-right

### Bạn — `/ban` (new tab, redirects to `/tai-khoan` if logged in)

- Avatar + display name + email at top
- **Reading stats card** (spec C) — same component as /tu-sach
- Sections list: Hồ sơ · Cài đặt đọc · Quản trị (admin only) · Đăng xuất

## Components affected

New components in `apps/frontend/src/components/`:

```
reader/
  ContinueReadingBar.tsx        sticky pink bar w/ truncated story info
  BottomTabBar.tsx              mobile 4-tab bottom nav
  AppShell.tsx                  reader root layout (header + nav + tab bar)
discover/
  GenreChips.tsx                horizontal scroll chips
  CatalogSearch.tsx             sticky search input
library/
  LibraryCard.tsx               specialised story card w/ progress
  LibraryEmptyState.tsx         per-tab empty state (links to spec C component)
ui/
  EmptyState.tsx                generic illustration + copy + CTA primitive
```

Updated components:

```
reader/
  ReaderHeader.tsx              REMOVE: top inline nav (move to AppShell); KEEP: avatar dropdown + drawer; ADAPT: tokens
  ChapterList.tsx               retoken; keep "Chương N" prefix
  ReaderSettings.tsx            radio groups → segmented control
  StoryHero.tsx (NEW, extracted)
admin/
  (Spec B handles admin tokens)
```

## Routes

New:
- `/kham-pha` — Khám phá tab content
- `/ban` — redirect to `/tai-khoan` if logged in, else `/dang-nhap`

Adjusted:
- `/` — restructure Home content (logged-in detection drives layout variants)
- `/tim-kiem` — keep functional but no nav link; redirect added pointing to `/kham-pha?q=…` to preserve old URLs
- `/truyen/$slug/chuong/$index` — full-screen mode, hides bottom tab bar (uses layout slot)

## Acceptance criteria

- Dark/light tokens applied via `data-theme` attribute on `<html>`, defaults to dark on first visit
- `Cài đặt` drawer toggle persists choice to `localStorage` (existing zustand store)
- Bottom tab bar shows on screens <1024px, hidden ≥1024px
- Top nav shows on ≥1024px, hidden <1024px
- "Đọc tiếp" bar visible across all pages **except** chapter reader, only when authenticated + has ≥1 `reading_progress` row
- Chapter reader: top chrome auto-hides 3s after last interaction; reappears on scroll-up / tap / mouse-move
- Chapter prose font-size persists user choice (existing setting)
- All interactive elements have visible focus ring (pink/40 ring-2 + ring-offset-2)
- `prefers-reduced-motion: reduce` disables transforms + scroll-driven animations
- WCAG 2.1 AA contrast: body text in both themes verified

## Out of scope (defer or handled elsewhere)

- Auth/Account/Admin retoken → **Spec B**
- "Đọc tiếp" bar data fetching + state mgmt → **Spec C** (Spec A defines the component shell + visual; Spec C wires the data)
- Reading stats endpoint + stats card → **Spec C**
- Drop-cap typography rules + empty state illustrations → **Spec C**
- Cover-color extraction backdrop → defer to v2
- Genre-aware Đề xuất ML → defer to v2 (MVP = most-read genres)
- PWA / offline reading → defer
- Story collections / shelves → defer

## Risks + mitigations

- **Risk**: Restructuring routes (`/kham-pha`, `/ban`) breaks bookmarks/SEO. **Mitigation**: keep `/tim-kiem` working with redirect; `/tai-khoan` URL stays canonical for Account.
- **Risk**: Tab-bar pattern duplicates existing reader header nav, increasing nav surface. **Mitigation**: top nav only shows on lg+, bottom only on <lg — never both.
- **Risk**: Chapter reader auto-hide chrome breaks accessibility for users who depend on persistent UI. **Mitigation**: chrome always visible when `prefers-reduced-motion: reduce` is set; settings drawer has a "Always show controls" toggle (defer if scope tight).

## Migration phases (within this spec)

1. **Phase A1**: Token layer alongside existing — add CSS vars + Tailwind config + theme switcher (no UI changes)
2. **Phase A2**: AppShell + BottomTabBar + new ReaderHeader (still feature-flagged by `?nav=v2` query param)
3. **Phase A3**: Page-by-page swap — Home → Story → Chapter → Library → Discover → Bạn

Each phase is its own commit set + local verify before next.
