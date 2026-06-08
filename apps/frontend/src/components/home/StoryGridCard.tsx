import type { StorySummary } from '@/api/stories';
import { StoryCover } from '@/components/ui/StoryCover';
import { Link } from '@tanstack/react-router';
import { BookOpen } from 'lucide-react';

const NEW_THRESHOLD_DAYS = 7;

function isFreshlyUpdated(updatedAt: string): boolean {
  const updated = new Date(updatedAt).getTime();
  if (Number.isNaN(updated)) return false;
  const ageMs = Date.now() - updated;
  return ageMs < NEW_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Home grid story card — cover with badge + chapter pill overlay, plain title below.
 * - MỚI green pill (top-left): story.updatedAt within last 7 days
 * - FULL red pill (top-right): story.status === 'completed'
 * - Ch.N pill (bottom-left, on cover): floor(MAX(chapter.index)) from API
 * Hides any badge whose data is missing.
 */
export function StoryGridCard({ story }: { story: StorySummary }) {
  const isNew = isFreshlyUpdated(story.updatedAt);
  const isCompleted = story.status === 'completed';
  const ch = story.latestChapterIndex;

  return (
    <Link
      to="/truyen/$slug"
      params={{ slug: story.slug }}
      search={{ page: 1, commentsPage: 1 }}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-bg-subtle">
        <StoryCover
          storyId={story.id}
          title={story.title}
          hasCover={story.hasCover}
          decorative
          imgClassName="absolute inset-0 transition-transform duration-200 group-hover:scale-105"
        />

        {/* Top-left MỚI badge */}
        {isNew && (
          <span className="absolute top-2 left-2 inline-flex items-center rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
            Mới
          </span>
        )}

        {/* Top-right FULL badge */}
        {isCompleted && (
          <span className="absolute top-2 right-2 inline-flex items-center rounded-md bg-rose-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
            Full
          </span>
        )}

        {/* Bottom-left chapter pill */}
        {ch != null && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            <BookOpen className="h-3 w-3" aria-hidden />
            Ch.{ch}
          </span>
        )}
      </div>
      <h3 className="mt-3 text-body font-medium line-clamp-2 group-hover:text-accent transition-colors duration-fast">
        {story.title}
      </h3>
    </Link>
  );
}
