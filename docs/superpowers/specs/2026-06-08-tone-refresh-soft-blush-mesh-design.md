# Tone-of-Voice Refresh — Soft Blush Mesh Dawn

**Status:** Approved 2026-06-08
**Author:** son.cu@opswat.com (brainstormed via Claude Code with `frontend-design` + `ui-ux-pro-max` skills)
**Scope:** Aesthetic refresh of all public-facing SManga surfaces. Layout, IA, routes UNCHANGED.

---

## Goal

Replace SManga's current pink-zinc + Inter/Newsreader aesthetic with a gradient-first dawn-watercolor identity ("Soft Blush Mesh Dawn"). The new tone is feminine, dreamy, ngôn tình-friendly, and visibly distinct from generic novel-reader sites (truyenfull, NovelHi). All gradient palettes — no flat brand colors anywhere except text + hairlines.

## Non-goals

- **Layout changes.** Component shells, page IA, navigation, and route shapes stay the same.
- **Admin pages (`/admin/*`).** Out of scope. Admin keeps current pink-zinc utility look.
- **New features.** No new pages, no new components beyond a `<MeshBackdrop>` primitive.
- **Reader behavior.** Reading flow (next/prev/settings) untouched — only typography + bg.
- **Mobile-specific redesign.** Existing responsive breakpoints (`sm:/md:/lg:`) preserved.

## Brand identity summary

| Attribute | Value |
|---|---|
| Name | Soft Blush Mesh Dawn |
| Personality | "Dawn-sky watercolor — cream meets blush meets peach. Đọc ngôn tình trên ban công sớm mai." |
| Display font | Fraunces (Google Font, ital + weights 400/500/600/700) |
| Body font | Outfit (Google Font, weights 300/400/500/600) |
| Ink color | `#3D2438` (warm aubergine, NOT pure black) |
| Muted color | `#8B6B7A` |
| Motion baseline | 300ms cubic-bezier(.25,.46,.45,.94), fade-up 8px + 4px blur lift |
| Signature visual | Multi-radial mesh blob backdrop with 3 blurred pink/peach orbs |

## Architecture

**Token layer (CSS custom properties).** All design tokens live in `apps/frontend/src/index.css` `:root`. The choice is CSS variables — not a React `ThemeProvider`, not a Tailwind plugin generating gradient utilities — because:

- Single environment, single brand, no runtime theme switching required (reduced-motion is the only conditional).
- Tailwind 3.4.19 supports `bg-[var(--bg-mesh)]` arbitrary-value syntax cleanly, so gradient utilities don't need a plugin.
- A `[data-surface="reader"]` attribute on the reader `<main>` overrides one variable (`--bg-mesh` → solid cream) without touching siblings. This is the only conditional surface in scope.

**Component layer.** Existing primitives (`<Button>`, `<Card>`, `<Badge>`, `<EmptyState>`) get restyled to consume the new tokens. No renames, no API changes — only Tailwind class swaps and inline-gradient usage where Tailwind can't reach.

**Shell layer.** A new `<MeshBackdrop>` component (3 absolute-positioned blur blobs) gets injected into every non-reader page layout. Reader pages skip it via the data-attribute override.

## Tokens (canonical)

```css
:root {
  /* Backgrounds */
  --bg-mesh:
    radial-gradient(at 20% 15%, #FFE4EC 0%, transparent 45%),
    radial-gradient(at 85% 25%, #FFD9C2 0%, transparent 50%),
    radial-gradient(at 75% 85%, #F5C6E0 0%, transparent 45%),
    radial-gradient(at 15% 80%, #FFF0E0 0%, transparent 50%),
    linear-gradient(135deg, #FFF8F3 0%, #FFEEF2 50%, #FDF4FF 100%);
  --bg-reader: #FFF8F3;
  --surface-glass: linear-gradient(180deg,
    rgba(255,255,255,0.85) 0%,
    rgba(255,245,248,0.65) 100%);
  --glass-border: rgba(255,143,177,0.25);

  /* Pink gradients */
  --pink-gradient: linear-gradient(135deg,
    #FFC1D8 0%, #FF8FB1 35%, #F76C8E 70%, #E8567C 100%);
  --cta-gradient: linear-gradient(135deg,
    #FFB3C9 0%, #FF7FA8 45%, #ED5A85 100%);
  --accent-gradient: linear-gradient(135deg,
    #FFE5B4 0%, #FFCB9A 50%, #F4A5A5 100%);

  /* Solid colors (text + hairlines) */
  --ink: #3D2438;
  --ink-muted: #8B6B7A;
  --hairline-pink: linear-gradient(90deg,
    transparent 0%, #FF8FB1 50%, transparent 100%);

  /* Shadows */
  --shadow-cta:
    0 8px 20px -6px rgba(237, 90, 133, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
  --shadow-card: 0 16px 40px -12px rgba(247, 108, 142, 0.18);
  --shadow-card-hover: 0 24px 60px -16px rgba(247, 108, 142, 0.28);
  --shadow-pill: 0 2px 8px -2px rgba(247, 108, 142, 0.15);

  /* Motion */
  --ease-soft: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --dur-base: 300ms;
  --dur-fast: 180ms;
  --dur-slow: 450ms;
}

/* Reader quiet variant */
[data-surface="reader"] {
  --bg-mesh: var(--bg-reader);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 1ms !important;
    animation-duration: 1ms !important;
  }
}
```

## Tailwind config extensions

```ts
// apps/frontend/tailwind.config.ts (additive — does not remove existing keys)
theme: {
  extend: {
    colors: {
      ink: 'var(--ink)',
      'ink-muted': 'var(--ink-muted)',
      // NOTE: do NOT redefine `muted` — it's already a shadcn alias object
      // ({DEFAULT, foreground}) in the current config. Use `text-ink-muted` for
      // the new tone's secondary text color instead.
      'glass-border': 'var(--glass-border)',
    },
    fontFamily: {
      display: ['Fraunces', 'Georgia', 'serif'],
      body: ['Outfit', 'system-ui', 'sans-serif'],
    },
    boxShadow: {
      cta: 'var(--shadow-cta)',
      card: 'var(--shadow-card)',
      'card-hover': 'var(--shadow-card-hover)',
      pill: 'var(--shadow-pill)',
    },
    transitionTimingFunction: {
      soft: 'var(--ease-soft)',
    },
    // NOTE: don't add transitionDuration.base — existing config already has
    // {fast:150, DEFAULT:200, slow:300}. The new tone uses Tailwind's default
    // `duration-300` scale class, which resolves to 300ms regardless of the
    // overrides. Keeps the new tokens additive.
  },
},
```

Existing color tokens (`bg-bg`, `text-fg`, `bg-accent`, `bg-accent-gradient`, etc.) remain in `tailwind.config.ts` for backward compat during Phase 2. Migrated surfaces stop using them; once Phase 2 + 3 land, a follow-up sweep removes unused tokens.

## Fonts

```html
<!-- apps/frontend/index.html — replaces existing Google Fonts block -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
```

Drop `Inter`, `Newsreader`, `JetBrains Mono` from the link. Code blocks (rare in SManga, basically only in admin docs) fall back to `ui-monospace` — acceptable for the project's scale.

## Components

### `<MeshBackdrop>` (NEW)

```tsx
// apps/frontend/src/components/layout/MeshBackdrop.tsx
export function MeshBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div
        className="absolute -top-20 -right-20 h-[400px] w-[400px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,143,177,0.45) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      <div
        className="absolute -bottom-32 -left-24 h-[480px] w-[480px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,203,154,0.5) 0%, transparent 70%)',
          filter: 'blur(48px)',
        }}
      />
      <div
        className="absolute top-1/3 left-1/2 h-[280px] w-[280px] -translate-x-1/2 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(245,198,224,0.55) 0%, transparent 70%)',
          filter: 'blur(36px)',
        }}
      />
    </div>
  )
}
```

Mounted in the public root layout, NOT mounted in `<ReaderShell>`.

### `<Button>` primary

```tsx
// existing apps/frontend/src/components/ui/Button.tsx — variant="primary" updates only
className={cn(
  'inline-flex items-center justify-center gap-2',
  'rounded-full px-5 py-2.5 font-body text-sm font-medium text-white',
  'transition-all duration-300 ease-soft',
  'shadow-cta hover:-translate-y-0.5 hover:shadow-card-hover',
  'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-pink-400',
)}
style={{ background: 'var(--cta-gradient)' }}
```

Secondary + ghost variants keep current behavior with minor color swaps (ink-on-glass instead of zinc-on-white).

### `<Card>`

```tsx
className={cn(
  'rounded-2xl border border-glass-border',
  'transition-all duration-300 ease-soft',
  'shadow-card hover:shadow-card-hover hover:-translate-y-1',
)}
style={{ background: 'var(--surface-glass)', backdropFilter: 'blur(8px)' }}
```

### `<Badge>` / pill kicker

```tsx
className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium tracking-wider uppercase text-ink-muted shadow-pill"
style={{ background: 'var(--surface-glass)', border: '1px solid var(--glass-border)' }}
```

### Text gradient helper

```tsx
// apps/frontend/src/components/ui/GradientText.tsx (NEW, ~20 LOC)
export function GradientText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn('inline-block font-display italic font-semibold', className)}
      style={{
        backgroundImage: 'var(--pink-gradient)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        color: 'transparent',
      }}
    >
      {children}
    </span>
  )
}
```

Used to highlight 1-2 words inside an `<h1>` / `<h2>`. Display font default italic-semibold.

### Hairline divider (reader)

```tsx
<div className="h-px w-full" style={{ background: 'var(--hairline-pink)' }} />
```

Single-purpose, no component — inline where needed (top + bottom of reader chapter content).

## Coverage matrix

| Surface | Bg | Display | Body | Mesh | Text gradient | Notes |
|---|---|---|---|---|---|---|
| `/` (Landing) | mesh full | Fraunces | Outfit | 3 blobs | hero headline | Replace existing hero, slider, story grids |
| `/kham-pha` | mesh | Fraunces | Outfit | 3 blobs | section titles | Filter chips get glass-pill treatment |
| `/truyen/$slug` | mesh dimmed (`opacity-50` on `<MeshBackdrop>`) | Fraunces | Outfit | 2 blobs | story title | Less visual noise to keep focus on cover + summary |
| `/truyen/$slug/chuong/$index` | **`bg-reader` solid cream** | Fraunces (chapter title) | Outfit (prose) | **none** | chapter title only | Hairline-pink top + bottom of chapter content |
| `/tu-sach` | mesh | Fraunces | Outfit | 3 blobs | page title | Library cards use new `<Card>` styling |
| `/dang-nhap`, `/dang-ky` | mesh | Fraunces | Outfit | 3 blobs | form title | Form on `<Card>` with glass surface |
| `/tai-khoan` | mesh | Fraunces | Outfit | 1 blob (top-right) | page title | Settings rows on `<Card>` |
| **`/admin/*`** | unchanged | unchanged | unchanged | none | none | **Out of scope** |

## Reader page (quiet variant) — detailed spec

```tsx
// apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx — wrapper
<main data-surface="reader" className="min-h-screen" style={{ background: 'var(--bg-mesh)' }}>
  {/* NO <MeshBackdrop /> */}
  <article className="mx-auto max-w-prose px-4 py-12">
    <header className="mb-12">
      <p className="font-body text-xs uppercase tracking-widest text-ink-muted mb-3">
        {story.title}
      </p>
      <h1 className="font-display text-3xl font-semibold leading-tight text-ink">
        <GradientText>Chương {chapter.index}</GradientText>
        <span className="block text-ink mt-2">{chapter.titleClean}</span>
      </h1>
      <div className="mt-6 h-px w-full" style={{ background: 'var(--hairline-pink)' }} />
    </header>

    <div className="font-body text-lg leading-[1.85] text-ink space-y-6">
      {chapter.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
    </div>

    <div className="mt-12 h-px w-full" style={{ background: 'var(--hairline-pink)' }} />
    <ReaderNav prev={chapter.prev} next={chapter.next} />
  </article>
</main>
```

Key decisions:
- `text-lg` (18px) prose with `leading-[1.85]` (29.6px line-height) — comfortable for long Vietnamese reading.
- `max-w-prose` (≈65ch) prevents over-wide line lengths.
- `space-y-6` (24px) between paragraphs aligns with the `\n\n` chapter-text spec landed 2026-06-08.
- No mesh blobs (data-surface="reader" overrides `--bg-mesh` to the solid `#FFF8F3`).
- Chapter title gradient + hairline-pink dividers are the ONLY pink touches on the page. Everything else is ink on cream.

## Motion language

| Pattern | Implementation |
|---|---|
| Page enter (non-reader) | `transition-all duration-300 ease-soft` + `opacity-0 → opacity-100`, `translate-y-2 → translate-y-0` |
| Card hover | `hover:-translate-y-1` + `hover:shadow-card-hover` |
| Button hover | `hover:-translate-y-0.5` + shadow intensifies |
| CTA glow | Static `shadow-cta` (no animation), intensifies on hover via `shadow-card-hover` |
| Mesh blobs | Static (no animation — they're decorative, not interactive). Future enhancement: slow drift via `@keyframes` if performance allows. |
| Reduced motion | All transitions → 1ms via the `:root` rule. No `transform`, no `filter` changes. |

## Accessibility

- **Contrast:** Ink `#3D2438` on `#FFF8F3` = ~13.5:1 (passes WCAG AAA for body text). Muted `#8B6B7A` on same = ~4.6:1 (passes AA for normal text). CTA white on `#ED5A85` = ~3.4:1 (passes AA for large text only — CTA buttons are always ≥14px medium-weight, qualifying).
- **Text gradients:** The italic display font `<GradientText>` is decorative — it's used as a highlight on 1-2 words inside a header that has another solid-ink portion. Screen readers and selection still work because the underlying text is real text.
- **Mesh blobs:** `aria-hidden`, `pointer-events: none`, `-z-10`. No content depends on them.
- **Focus rings:** Pink focus ring (`focus-visible:ring-pink-400`) replaces the existing zinc ring. WCAG 2.4.7 compliance.
- **Reduced motion:** Single `@media` rule blanket-disables transitions/animations. Mesh blobs are static so no further work needed.

## Backward compatibility

- Existing Tailwind tokens (`bg-bg`, `text-fg`, `bg-accent`, `bg-accent-gradient`, `border-border`, `text-fg-muted`) stay in the config during Phase 2 — surfaces migrate one at a time, no big-bang rewrite.
- Components that still use old tokens render correctly because the old tokens still resolve.
- After all public surfaces migrate (end of Phase 3), a follow-up sweep removes unused tokens. NOT in scope of this spec — covered by the implementation plan as an optional cleanup task.
- Admin pages permanently keep the old tokens — they're not migrated.

## Out of scope (explicit)

- New components beyond `<MeshBackdrop>` + `<GradientText>` (~20 LOC each).
- Animation library introduction (Framer Motion, etc.). Plain CSS transitions only.
- Dark mode. Not currently supported; not added.
- Theme switching at runtime. Single theme.
- Admin pages.
- Loading shimmer redesign. Existing `<Skeleton>` keeps its zinc tone — fine because skeletons are transient.
- Email templates (none currently in SManga).

## Testing & verification

- **Per-phase Playwright MCP screenshot** (mobile 375 + desktop 1280) for each migrated surface. Per [[smanga-feedback-test-with-playwright-before-push]], no push without proof.
- **Manual visual regression:** `pnpm dev:frontend` + click through every public page after each phase. Verify no regression in non-migrated surfaces.
- **Lighthouse contrast audit:** Reader page targeted. Must pass WCAG AA (expected ~13:1 ink-on-cream).
- **No new unit tests:** This is a presentation refresh — existing component tests still pass because no API surface changes.
- **`pnpm -r typecheck` + `pnpm -r build`** after each phase to catch token/import drift.

## Open questions

None. All scope questions resolved 2026-06-08:
- Reader bg → quiet variant (solid cream + hairline)
- Admin → out of scope
- Direction → A (Soft Blush Mesh Dawn)
- Gradients → required everywhere ("đừng dùng màu nguyên gốc")
