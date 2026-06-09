import { type StorySummary, listStories } from '@/api/stories';
import { StoryCover } from '@/components/ui/StoryCover';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

interface SimilarStoriesRailProps {
  /** Page heading text. e.g. "Cùng tác giả" or "Cùng thể loại". */
  title: string;
  by: 'author' | 'genre';
  /** Author name or genre slug to filter on. */
  value: string;
  /** Story id to exclude (the page we're currently on). */
  excludeId: string;
}

const LIMIT = 6;

export function SimilarStoriesRail({ title, by, value, excludeId }: SimilarStoriesRailProps) {
  const query = useQuery({
    queryKey: ['similar-stories', by, value] as const,
    queryFn: () =>
      by === 'author'
        ? listStories(1, LIMIT + 1, undefined, undefined, undefined, value)
        : listStories(1, LIMIT + 1, value),
    staleTime: 10 * 60_000,
  });

  const items: StorySummary[] = (query.data ?? [])
    .filter((s) => s.id !== excludeId)
    .slice(0, LIMIT);

  if (query.isLoading) return null;
  if (items.length === 0) return null;

  return (
    <section className="container py-10 border-t border-border">
      <h2 className="text-heading-lg font-prose font-semibold mb-5">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {items.map((s) => (
          <Link
            key={s.id}
            to="/truyen/$slug"
            params={{ slug: s.slug }}
            search={{ page: 1, commentsPage: 1 }}
            className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
          >
            <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-bg-subtle">
              <StoryCover storyId={s.id} title={s.title} hasCover={s.hasCover} decorative />
            </div>
            <h3 className="mt-2 text-body-sm font-medium line-clamp-2 group-hover:text-accent transition-colors duration-fast">
              {s.title}
            </h3>
          </Link>
        ))}
      </div>
    </section>
  );
}
