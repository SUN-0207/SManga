import { recommendationsApi } from '@/api/recommendations';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery } from '@tanstack/react-query';
import { RecommendationCard } from './RecommendationCard';

type Props = { kind: 'similar'; storyId: string } | { kind: 'forYou' };

export function RecommendationSection(props: Props) {
  const user = useAuthStore((s) => s.user);

  const query = useQuery({
    queryKey:
      props.kind === 'similar'
        ? (['recommendations', 'similar', props.storyId] as const)
        : (['recommendations', 'forYou', user?.id] as const),
    queryFn: () =>
      props.kind === 'similar'
        ? recommendationsApi.similar(props.storyId)
        : recommendationsApi.forYou(),
    staleTime: 10 * 60_000,
    enabled: props.kind === 'similar' ? true : !!user,
  });

  // forYou: hide section when not logged in
  if (props.kind === 'forYou' && !user) return null;

  // Error: hide silently
  if (query.isError) {
    console.error('[RecommendationSection] query error:', query.error);
    return null;
  }

  // Empty: hide silently
  if (!query.isLoading && (query.data?.items.length ?? 0) === 0) return null;

  const title = props.kind === 'similar' ? 'Truyện tương tự' : 'Dành cho anh';

  return (
    <section className="container py-10">
      <div className="mb-6">
        <p className="text-label text-fg-muted uppercase mb-2">ĐỀ XUẤT</p>
        <h2 className="text-heading-lg">{title}</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
        {query.isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-md bg-bg-subtle animate-pulse" />
            ))
          : query.data?.items.map((item) => <RecommendationCard key={item.id} item={item} />)}
      </div>
    </section>
  );
}
