import { useState } from 'react';
import { Star } from 'lucide-react';

type StarValue = 1 | 2 | 3 | 4 | 5;

interface RatingStarsProps {
  /**
   * Aggregate avg for read-only display (rounded to nearest integer for fill).
   * Pass `mine` for interactive mode — it drives the committed selection.
   */
  value:     number | null;
  /** User's own committed rating — preselects fill in interactive mode. */
  mine?:     StarValue | null;
  /**
   * When provided the component becomes interactive.
   * Clicking a filled star that equals `mine` calls onChange(null) (clear).
   */
  onChange?: (v: StarValue | null) => void;
  size?:     'sm' | 'md' | 'lg';
}

const SIZE_CLASS: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export function RatingStars({ value, mine, onChange, size = 'md' }: RatingStarsProps) {
  const [hovered, setHovered] = useState<StarValue | null>(null);
  const interactive = !!onChange;
  const iconClass   = SIZE_CLASS[size];

  // Interactive: hover preview takes priority; fall back to mine then 0.
  // Read-only: round the aggregate avg for display.
  const displayValue = interactive
    ? (hovered ?? mine ?? 0)
    : Math.round(value ?? 0);

  return (
    <span
      className="inline-flex items-center gap-0.5"
      role={interactive ? 'group' : undefined}
      aria-label={interactive ? 'Chọn đánh giá' : `${value ?? 0} sao`}
    >
      {([1, 2, 3, 4, 5] as StarValue[]).map((i) => {
        const filled = i <= displayValue;
        if (interactive) {
          return (
            <button
              key={i}
              type="button"
              aria-label={`Đánh giá ${i} sao`}
              className={[
                'cursor-pointer transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded',
                filled ? 'text-accent' : 'text-fg-subtle',
              ].join(' ')}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onChange(i === mine ? null : i)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  onChange(Math.min(5, i + 1) as StarValue);
                }
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  onChange(Math.max(1, i - 1) as StarValue);
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onChange(i === mine ? null : i);
                }
              }}
            >
              <Star className={iconClass} fill={filled ? 'currentColor' : 'none'} aria-hidden />
            </button>
          );
        }
        return (
          <Star
            key={i}
            className={`${iconClass} ${filled ? 'text-accent' : 'text-fg-subtle'}`}
            fill={filled ? 'currentColor' : 'none'}
            aria-hidden
          />
        );
      })}
    </span>
  );
}
