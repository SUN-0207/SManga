import { cn } from '@/lib/cn';

interface LogoProps {
  /** Render the mark only (no wordmark). Useful for square slots like favicons,
   * avatar fallbacks, or mobile-collapsed headers. */
  iconOnly?: boolean;
  /** Override the mark size. The default 34px works for most header heights;
   * use ~20px in compact mobile headers and ~48px for hero / standalone use. */
  size?: number;
  /** Force a foreground tone. By default the wordmark uses `currentColor`
   * (whatever text color it sits inside) — pass 'light' on dark backgrounds
   * or 'dark' on light backgrounds when you want an explicit override. */
  tone?: 'auto' | 'light' | 'dark';
  className?: string;
}

/**
 * SManga brand mark — a paired book-spine icon (white page + pink page) next
 * to the "SManga" wordmark. The mark scales independently of the wordmark so
 * `iconOnly` slots (favicons, mobile-collapsed nav) reuse the same SVG.
 *
 * The icon is inline SVG so it picks up `currentColor` for the page outlines,
 * keeping the brand readable on any background without per-theme tweaks. The
 * pink page stays #EC4899 always — the accent is what makes the mark a mark.
 */
export function Logo({ iconOnly = false, size = 34, tone = 'auto', className }: LogoProps) {
  const wordColor = tone === 'light' ? 'text-white' : tone === 'dark' ? 'text-zinc-900' : 'text-fg';

  return (
    <span
      className={cn('inline-flex items-center gap-2.5 leading-none', className)}
      aria-label="SManga"
    >
      <BookMark size={size} />
      {!iconOnly && (
        <span
          className={cn(
            'font-sans font-extrabold tracking-tight',
            // Scale the wordmark proportionally to the mark.
            size >= 40 ? 'text-[1.625rem]' : size >= 28 ? 'text-heading-lg' : 'text-body',
            wordColor,
          )}
        >
          SManga
        </span>
      )}
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
