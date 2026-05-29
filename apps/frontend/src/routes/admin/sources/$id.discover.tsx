import { useEffect } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { discoverApi } from '@/api/discover';
import { DiscoverActionBar } from '@/components/admin/DiscoverActionBar';
import { DiscoverFilters } from '@/components/admin/DiscoverFilters';
import { DiscoverGrid } from '@/components/admin/DiscoverGrid';
import { DiscoverPagination } from '@/components/admin/DiscoverPagination';
import { useDiscoverImportStore } from '@/stores/discover-import-store';

export const Route = createFileRoute('/admin/sources/$id/discover')({
  component: DiscoverPage,
  validateSearch: (s: Record<string, unknown>) => ({
    feed: typeof s.feed === 'string' ? s.feed : undefined,
    page: Number(s.page) || 1,
    q: typeof s.q === 'string' ? s.q : '',
  }),
});

function DiscoverPage() {
  const { id: sourceId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const clearSelection = useDiscoverImportStore((s) => s.clearSelection);

  const feedsQ = useQuery({
    queryKey: ['source-feeds', sourceId],
    queryFn: () => discoverApi.feeds(sourceId),
    staleTime: 5 * 60_000,
  });

  // Default feed = first one from the source's declared feeds (typically 'newest').
  const activeFeed = search.feed ?? feedsQ.data?.feeds[0]?.id ?? null;
  const searching = search.q.length > 0;

  const browseQ = useQuery({
    queryKey: ['discover', sourceId, searching ? `q:${search.q}` : `feed:${activeFeed}`, search.page],
    queryFn: () =>
      discoverApi.browse(sourceId, {
        feed: searching ? undefined : activeFeed ?? undefined,
        page: search.page,
        q: searching ? search.q : undefined,
      }),
    enabled: Boolean(searching || activeFeed),
    placeholderData: (prev) => prev,
  });

  // Reset selection when feed/query/page changes — avoids cross-page selection
  // that the user can't see + the action bar count getting out of sync.
  useEffect(() => {
    clearSelection();
  }, [activeFeed, search.q, search.page, clearSelection]);

  function setFeed(feedId: string) {
    navigate({ search: { feed: feedId, page: 1, q: '' } });
  }

  function setQuery(q: string) {
    navigate({ search: { feed: undefined, page: 1, q } });
  }

  function setPage(p: number) {
    navigate({ search: { ...search, page: p } });
  }

  if (feedsQ.isLoading || !feedsQ.data) {
    return <p className="text-sm text-muted-foreground p-8">Đang tải feeds...</p>;
  }
  if (feedsQ.error) {
    return (
      <p className="text-sm text-destructive p-8">
        Không tải được feeds. Source <code>{sourceId}</code> chưa được đăng ký adapter?
      </p>
    );
  }

  const { sourceName, baseUrl, feeds, supportsSearch } = feedsQ.data;

  return (
    <div className="space-y-6 pb-24">
      <div>
        <Link
          to="/admin/sources"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Sources
        </Link>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">
          Khám phá {sourceName}
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl">
          Chọn truyện từ catalog của <code>{baseUrl}</code> để import metadata. Việc quét chapter
          và crawl nội dung sẽ chạy theo lệnh sau khi anh duyệt từng truyện.
        </p>
      </div>

      <DiscoverFilters
        feeds={feeds}
        activeFeed={activeFeed}
        query={search.q}
        supportsSearch={supportsSearch}
        onFeedChange={setFeed}
        onQueryChange={setQuery}
      />

      <DiscoverGrid items={browseQ.data?.items ?? []} isLoading={browseQ.isLoading} />

      {browseQ.data && (
        <DiscoverPagination
          page={browseQ.data.page}
          hasNextPage={browseQ.data.hasNextPage}
          isLoading={browseQ.isFetching}
          onChange={setPage}
        />
      )}

      <DiscoverActionBar onImported={() => browseQ.refetch()} />
    </div>
  );
}
