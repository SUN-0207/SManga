import { BookText } from 'lucide-react';
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

  const initial = (title.trim().charAt(0) || '?').toUpperCase();
  return (
    <div
      role={decorative ? 'presentation' : undefined}
      aria-label={decorative ? undefined : `Không có bìa cho ${title}`}
      className="relative w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/12 via-bg-subtle to-bg-elevated overflow-hidden"
    >
      <span className="font-prose font-semibold text-[clamp(2.25rem,7vw,5rem)] leading-none text-fg-muted/45 select-none">
        {initial}
      </span>
      <BookText className="absolute bottom-2 right-2 h-3.5 w-3.5 text-fg-muted/55" aria-hidden />
    </div>
  );
}
