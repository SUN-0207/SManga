import { cn } from '@/lib/cn';

interface LogoProps {
  /** Render the square "S" mark only (no wordmark). For favicon-style slots,
   * avatar fallbacks, or mobile-collapsed headers. */
  iconOnly?: boolean;
  /** Rendered height in px (the logo art keeps its aspect ratio). Default 28
   * suits the header; ~22 for compact headers, ~40+ for hero / standalone. */
  size?: number;
  /** Theme adaptation. 'auto' (default) swaps the light/dark art with the
   * active theme via the `[data-theme="dark"]` selector. Force 'light' on a
   * known-dark background (white art) or 'dark' on a known-light one. */
  tone?: 'auto' | 'light' | 'dark';
  className?: string;
}

// Two pre-rendered variants per slot: `light` art (black wordmark) reads on
// LIGHT backgrounds, `dark` art (white wordmark) reads on DARK ones. Generated
// from the source logos with the baked background flood-filled out.
const SRC = {
  wordmark: { light: '/logo-wordmark-light.png', dark: '/logo-wordmark-dark.png' },
  mark: { light: '/logo-mark-light.png', dark: '/logo-mark-dark.png' },
} as const;

// Intrinsic aspect of the trimmed art — used to reserve width so swapping in
// the raster logo doesn't shift layout (CLS) before the image loads.
const ASPECT = { wordmark: 2.24, mark: 1 } as const;

/**
 * SManga brand wordmark — the comic "S" speech-bubble + "SManga" lettering,
 * rendered as a theme-aware raster image. The source art is black-on-light /
 * white-on-dark, so a single asset can't serve both themes; `auto` ships both
 * and CSS shows the right one. `iconOnly` swaps the wordmark for the square S.
 */
export function Logo({ iconOnly = false, size = 28, tone = 'auto', className }: LogoProps) {
  const kind = iconOnly ? 'mark' : 'wordmark';
  const set = SRC[kind];
  const width = Math.round(size * ASPECT[kind]);
  // `alt` stays an explicit attribute on each <img> (not spread) so the a11y
  // linter can see it statically.
  const imgProps = {
    width,
    height: size,
    draggable: false,
    style: { height: size, width },
  } as const;

  // Forced tone: caller sits on a known background regardless of the theme.
  // (Spread first, then `alt` — so the a11y linter sees alt provably present.)
  if (tone === 'light') {
    return (
      <img
        {...imgProps}
        alt="SManga"
        src={set.dark}
        className={cn('block select-none', className)}
      />
    );
  }
  if (tone === 'dark') {
    return (
      <img
        {...imgProps}
        alt="SManga"
        src={set.light}
        className={cn('block select-none', className)}
      />
    );
  }

  // Auto: render both, let the theme selector reveal one. The `display:none`
  // one is dropped from the a11y tree, so "SManga" is announced exactly once.
  return (
    <span className={cn('inline-flex items-center leading-none', className)}>
      <img {...imgProps} alt="SManga" src={set.light} className="block select-none dark:hidden" />
      <img {...imgProps} alt="SManga" src={set.dark} className="hidden select-none dark:block" />
    </span>
  );
}

/** The mark on its own — exported so favicon-style slots (route loaders,
 * meta tags) can render it without the wordmark wrapper. The outer <Logo>
 * already provides an aria-label, so the inner BookMark hides itself from
 * a11y trees via aria-hidden — but biome's noSvgWithoutTitle wants a
 * <title> regardless, so include a minimal one that's only surfaced when
 * the mark is used standalone (favicons, etc.). */
export function BookMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 34 34"
      role="img"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <title>SManga</title>
      {/* Left page — neutral, picks up currentColor for the outline */}
      <rect x="3" y="6" width="13" height="22" rx="1.5" fill="currentColor" />
      {/* Right page — the brand accent, always pink */}
      <rect x="18" y="6" width="13" height="22" rx="1.5" fill="#EC4899" />
      {/* Page rules on the left half */}
      <line x1="6" y1="11" x2="13" y2="11" stroke="#18181B" strokeWidth="1.2" opacity="0.25" />
      <line x1="6" y1="14" x2="13" y2="14" stroke="#18181B" strokeWidth="1.2" opacity="0.25" />
      <line x1="6" y1="17" x2="11" y2="17" stroke="#18181B" strokeWidth="1.2" opacity="0.25" />
    </svg>
  );
}
