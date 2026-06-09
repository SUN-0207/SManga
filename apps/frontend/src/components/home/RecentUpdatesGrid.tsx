import type { StorySummary } from '@/api/stories';
import { Link } from '@tanstack/react-router';
import { Flame } from 'lucide-react';
import { StoryGridCard } from './StoryGridCard';

const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const;

/**
 * Home left-column section — 4-column grid of recently-updated stories with
 * MỚI/FULL badges + chapter pill via StoryGridCard. Replaces the old
 * UpdatedSection. Skeleton matches grid shape to avoid layout shift.
 */
export function RecentUpdatesGrid({
  stories,
  isLoading,
}: {
  stories: StorySummary[];
  isLoading: boolean;
}) {
  return (
    <section>
      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 className="text-heading-lg inline-flex items-center gap-2">
            <Flame className="h-5 w-5 text-accent" aria-hidden />
            Mới cập nhật
          </h2>
          <p className="text-body-sm text-fg-muted mt-1">Những truyện vừa có chương mới.</p>
        </div>
        <Link
          to="/kham-pha"
          search={{ q: '', page: 1, genre: undefined }}
          className="text-body-sm text-fg-muted hover:text-fg transition-colors duration-fast"
        >
          Xem tất cả →
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6">
          {SKELETON_KEYS.map((k) => (
            <div key={k} className="space-y-3">
              <div className="aspect-[3/4] rounded-md bg-bg-subtle animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-bg-subtle animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6">
          {stories.map((s) => (
            <StoryGridCard key={s.id} story={s} />
          ))}
        </div>
      )}
    </section>
  );
}
