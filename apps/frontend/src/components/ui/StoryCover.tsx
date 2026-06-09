import { BookMark } from '@/components/ui/Logo';
import { useState } from 'react';

interface StoryCoverProps {
  storyId: string;
  title: string;
  /**
   * When known up-front, pass it through and the component skips the fetch
   * entirely on `false`. When undefined (callers without the flag in their
   * payload, e.g. ShelfItem from bookmarks/progress), the component attempts
   * the fetch and falls back via `onError`.
   */
  hasCover?: boolean;
  decorative?: boolean;
  loading?: 'lazy' | 'eager';
  /** Extra classes applied to the rendered <img> when a cover is present. */
  imgClassName?: string;
}

/**
 * Pattern-only default cover palettes. Each palette is a 2-blob mesh on a
 * soft linear base — all warm pink-adjacent tones to stay on-brand. The
 * fallback never renders the story title (titles are already shown in the
 * card caption, the story page header, etc.), so length-invariant: a 2-word
 * title and a 17-word title get the same recognizable cover signature.
 *
 * 6 entries gives enough visual diversity in a 4-col grid that adjacent
 * stories rarely collide on the same palette, while staying within the
 * Soft Blush Mesh-adjacent palette so no cover feels off-brand.
 */
type Palette = {
  base: string;
  blobA: { pos: string; color: string };
  blobB: { pos: string; color: string };
};

// Tuple type with explicit first element so TS can prove PALETTES[0] is
// always defined even under noUncheckedIndexedAccess — that's the fallback
// in paletteFor() and removes the need for a `!` non-null assertion.
const PALETTES: readonly [Palette, ...Palette[]] = [
  {
    base: 'linear-gradient(135deg, #FCE7F3 0%, #FBCFE8 100%)',
    blobA: { pos: '20% 30%', color: 'rgba(255,201,221,0.85)' },
    blobB: { pos: '80% 70%', color: 'rgba(255,212,229,0.75)' },
  },
  {
    base: 'linear-gradient(135deg, #FFE8E0 0%, #FBCFE8 100%)',
    blobA: { pos: '70% 20%', color: 'rgba(255,217,200,0.85)' },
    blobB: { pos: '25% 80%', color: 'rgba(255,212,229,0.75)' },
  },
  {
    base: 'linear-gradient(135deg, #F5F3FF 0%, #FCE7F3 100%)',
    blobA: { pos: '40% 60%', color: 'rgba(233,213,255,0.80)' },
    blobB: { pos: '80% 30%', color: 'rgba(251,207,232,0.78)' },
  },
  {
    base: 'linear-gradient(135deg, #FFF1F2 0%, #F5F3FF 100%)',
    blobA: { pos: '60% 80%', color: 'rgba(252,210,210,0.82)' },
    blobB: { pos: '20% 20%', color: 'rgba(221,214,254,0.74)' },
  },
  {
    base: 'linear-gradient(135deg, #FFFBEB 0%, #FCE7F3 100%)',
    blobA: { pos: '30% 70%', color: 'rgba(251,207,232,0.80)' },
    blobB: { pos: '75% 25%', color: 'rgba(254,243,199,0.70)' },
  },
  {
    base: 'linear-gradient(135deg, #FFF7ED 0%, #FECDD3 100%)',
    blobA: { pos: '50% 30%', color: 'rgba(254,215,170,0.78)' },
    blobB: { pos: '30% 80%', color: 'rgba(254,205,211,0.80)' },
  },
];

/** Deterministic hash so the same story always gets the same palette.
 * djb2-ish; storyId is a UUID string. PALETTES is typed as a non-empty
 * tuple `[Palette, ...Palette[]]`, so PALETTES[0] is provably defined and
 * acts as the safe fallback under noUncheckedIndexedAccess. */
function paletteFor(storyId: string): Palette {
  let h = 5381;
  for (let i = 0; i < storyId.length; i += 1) {
    h = ((h << 5) + h + storyId.charCodeAt(i)) >>> 0;
  }
  return PALETTES[h % PALETTES.length] ?? PALETTES[0];
}

export function StoryCover({
  storyId,
  title,
  hasCover,
  decorative = false,
  loading = 'lazy',
  imgClassName = '',
}: StoryCoverProps) {
  const [errored, setErrored] = useState(false);
  const showFallback = hasCover === false || errored;

  if (!showFallback) {
    return (
      <img
        src={`/api/v1/cover/${storyId}`}
        alt={decorative ? '' : `Bìa ${title}`}
        loading={loading}
        onError={() => setErrored(true)}
        className={`w-full h-full object-cover ${imgClassName}`}
      />
    );
  }

  const palette = paletteFor(storyId);
  return (
    <div
      role={decorative ? 'presentation' : undefined}
      aria-label={decorative ? undefined : `Không có bìa cho ${title}`}
      className="relative w-full h-full overflow-hidden flex items-end p-[6%]"
      style={{
        background: `radial-gradient(circle at ${palette.blobA.pos}, ${palette.blobA.color} 0%, transparent 55%), radial-gradient(circle at ${palette.blobB.pos}, ${palette.blobB.color} 0%, transparent 60%), ${palette.base}`,
        // Container queries so the SManga badge scales with the cover size —
        // at sidebar thumbnail (~40px) the badge shrinks to almost-invisible,
        // at hero cover (~300px) it sits comfortably bottom-left.
        containerType: 'inline-size',
      }}
    >
      <div
        className="inline-flex items-center gap-[5cqi] bg-white/65 backdrop-blur-sm rounded-[3cqi] border border-pink-200/40"
        style={{
          padding: 'clamp(2px, 2.5cqi, 8px) clamp(3px, 4cqi, 10px)',
        }}
      >
        <span style={{ flexShrink: 0, display: 'inline-flex' }}>
          <BookMark size={14} />
        </span>
        <span
          className="font-sans font-bold text-zinc-900 tracking-tight"
          style={{ fontSize: 'clamp(7px, 4.5cqi, 11px)', lineHeight: 1 }}
        >
          SManga
        </span>
      </div>
    </div>
  );
}
