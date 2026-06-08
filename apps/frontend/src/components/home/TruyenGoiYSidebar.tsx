import { rankingsApi } from '@/api/rankings';
import { recommendationsApi } from '@/api/recommendations';
import { StoryCover } from '@/components/ui/StoryCover';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BookOpen } from 'lucide-react';

const LIMIT = 9;
const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'] as const;

type SidebarItem = {
  id: string;
  slug: string;
  title: string;
  hasCover: boolean;
};

/**
 * Home right-column sidebar — numbered 1-N list of suggested stories.
 * - Logged-in: /me/recommendations (forYou, personalized)
 * - Anonymous OR empty recs: fallback to /rankings/hot (no auth needed)
 * Hides itself if both queries return empty (extreme cold-start).
 */
export function TruyenGoiYSidebar() {
  const user = useAuthStore((s) => s.user);

  const recsQ = useQuery({
    queryKey: ['recommendations', 'forYou', user?.id, LIMIT] as const,
    queryFn: () => recommendationsApi.forYou(LIMIT),
    staleTime: 10 * 60_000,
    enabled: !!user,
  });

  const hasRecs = (recsQ.data?.items.length ?? 0) > 0;

  // Fire rankings query when:
  //  - no logged-in user (recs query is disabled), OR
  //  - recs query resolved with an empty list
  const rankingsEnabled = !user || (recsQ.isFetched && !hasRecs);
  const rankQ = useQuery({
    queryKey: ['rankings', 'hot', LIMIT] as const,
    queryFn: () => rankingsApi.hot(LIMIT),
    staleTime: 10 * 60_000,
    enabled: rankingsEnabled,
  });

  const items: SidebarItem[] = hasRecs
    ? (recsQ.data?.items ?? []).map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        hasCover: r.hasCover,
      }))
    : (rankQ.data?.items ?? []).map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        hasCover: r.hasCover,
      }));

  const isLoading =
    (!!user && recsQ.isLoading) || (rankingsEnabled && rankQ.isLoading && items.length === 0);

  // Hide silently if both queries finished and there's nothing to show
  if (!isLoading && items.length === 0) return null;

  return (
    <aside aria-label="Truyện gợi ý" className="lg:sticky lg:top-20">
      <div className="rounded-lg border border-border bg-bg-elevated p-5">
        <h2 className="text-heading-md inline-flex items-center gap-2 mb-4">
          <BookOpen className="h-4 w-4 text-accent" aria-hidden />
          Truyện gợi ý
        </h2>

        {isLoading ? (
          <ol className="space-y-3">
            {SKELETON_KEYS.map((k) => (
              <li key={k} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded bg-bg-subtle animate-pulse" />
                <div className="w-10 h-12 rounded bg-bg-subtle animate-pulse flex-shrink-0" />
                <div className="flex-1 h-4 rounded bg-bg-subtle animate-pulse" />
              </li>
            ))}
          </ol>
        ) : (
          <ol className="space-y-3">
            {items.slice(0, LIMIT).map((item, i) => (
              <li key={item.id}>
                <Link
                  to="/truyen/$slug"
                  params={{ slug: item.slug }}
                  search={{ page: 1, commentsPage: 1 }}
                  className="group flex items-center gap-3 rounded-md p-1 -m-1 transition-colors duration-fast hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span
                    aria-hidden
                    className={`flex-shrink-0 w-5 text-center text-body-sm font-bold tabular-nums ${
                      i < 3 ? 'text-accent' : 'text-fg-muted'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="w-10 h-12 flex-shrink-0 overflow-hidden rounded border border-border bg-bg-subtle">
                    <StoryCover
                      storyId={item.id}
                      title={item.title}
                      hasCover={item.hasCover}
                      decorative
                    />
                  </div>
                  <span className="flex-1 text-body-sm line-clamp-2 leading-snug group-hover:text-accent transition-colors duration-fast">
                    {item.title}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}
