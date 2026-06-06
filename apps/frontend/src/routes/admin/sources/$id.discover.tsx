import { discoverApi } from '@/api/discover';
import { sourcesApi } from '@/api/sources';
import { DiscoverActionBar } from '@/components/admin/DiscoverActionBar';
import { DiscoverFilters } from '@/components/admin/DiscoverFilters';
import { DiscoverPagination } from '@/components/admin/DiscoverPagination';
import { DiscoverTable } from '@/components/admin/DiscoverTable';
import { useDiscoverImportStore } from '@/stores/discover-import-store';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Download, Loader2, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';

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
  const globalNavigate = useNavigate();
  const clearSelection = useDiscoverImportStore((s) => s.clearSelection);

  const [showImportAll, setShowImportAll] = useState(false);
  const [importAllToast, setImportAllToast] = useState<{
    type: 'success' | 'error' | 'conflict';
    message: string;
  } | null>(null);

  const feedsQ = useQuery({
    queryKey: ['source-feeds', sourceId],
    queryFn: () => discoverApi.feeds(sourceId),
    staleTime: 5 * 60_000,
  });

  // Default feed = first one from the source's declared feeds (typically 'newest').
  const activeFeed = search.feed ?? feedsQ.data?.feeds[0]?.id ?? null;
  const searching = search.q.length > 0;

  const browseQ = useQuery({
    queryKey: [
      'discover',
      sourceId,
      searching ? `q:${search.q}` : `feed:${activeFeed}`,
      search.page,
    ],
    queryFn: () =>
      discoverApi.browse(sourceId, {
        feed: searching ? undefined : (activeFeed ?? undefined),
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
  const activeFeedLabel = feeds.find((f) => f.id === activeFeed)?.label ?? activeFeed ?? '';

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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">
              Khám phá {sourceName}
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              Chọn truyện từ catalog của <code>{baseUrl}</code> để import metadata. Việc quét
              chapter và crawl nội dung sẽ chạy theo lệnh sau khi anh duyệt từng truyện.
            </p>
          </div>
          {activeFeed && !searching && (
            <button
              type="button"
              onClick={() => {
                setImportAllToast(null);
                setShowImportAll(true);
              }}
              className="mt-1 inline-flex h-10 items-center gap-2 rounded-md bg-accent-gradient px-4 text-body-sm font-bold text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg whitespace-nowrap"
            >
              <Zap className="h-4 w-4" aria-hidden />
              Import tất cả truyện trong feed này
            </button>
          )}
        </div>
        {importAllToast && (
          <p
            role="alert"
            className={`mt-3 text-body-sm ${importAllToast.type === 'success' ? 'text-positive' : 'text-destructive'}`}
          >
            {importAllToast.message}
          </p>
        )}
      </div>

      <DiscoverFilters
        feeds={feeds}
        activeFeed={activeFeed}
        query={search.q}
        supportsSearch={supportsSearch}
        onFeedChange={setFeed}
        onQueryChange={setQuery}
      />

      <DiscoverTable items={browseQ.data?.items ?? []} isLoading={browseQ.isLoading} />

      {browseQ.data && (
        <DiscoverPagination
          page={browseQ.data.page}
          hasNextPage={browseQ.data.hasNextPage}
          isLoading={browseQ.isFetching}
          onChange={setPage}
        />
      )}

      <DiscoverActionBar onImported={() => browseQ.refetch()} />

      {showImportAll && activeFeed && (
        <ImportAllConfirm
          sourceId={sourceId}
          feedId={activeFeed}
          feedLabel={activeFeedLabel}
          onCancel={() => setShowImportAll(false)}
          onSuccess={(msg) => {
            setShowImportAll(false);
            setImportAllToast({ type: 'success', message: msg });
            setTimeout(() => void globalNavigate({ to: '/admin/jobs' }), 800);
          }}
          onError={(msg) => {
            setShowImportAll(false);
            setImportAllToast({ type: 'error', message: msg });
          }}
        />
      )}
    </div>
  );
}

function ImportAllConfirm({
  sourceId,
  feedId,
  feedLabel,
  onCancel,
  onSuccess,
  onError,
}: {
  sourceId: string;
  feedId: string;
  feedLabel: string;
  onCancel: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [autoCrawl, setAutoCrawl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      await sourcesApi.discoverAll(sourceId, feedId, autoCrawl);
      onSuccess('Đã queue. Đang chuyển tới Jobs...');
    } catch (err) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
      const status = axiosErr.response?.status;
      const raw = axiosErr.response?.data?.message;
      const msg = Array.isArray(raw)
        ? raw.join(', ')
        : typeof raw === 'string'
          ? raw
          : ((err as Error).message ?? 'Lỗi không xác định');
      if (status === 409) {
        setError('Job đang chạy. Mở trang Jobs để xem.');
      } else {
        onError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-all-title"
        className="w-full max-w-md rounded-xl border border-border bg-bg-elevated p-6 shadow-elev"
      >
        <h2 id="import-all-title" className="font-sans text-heading-md text-fg">
          Import tất cả truyện trong feed này?
        </h2>
        <p className="mt-2 text-body-sm text-fg-muted">
          Hệ thống sẽ quét toàn bộ trang của feed{' '}
          <span className="font-medium text-fg">"{feedLabel}"</span> và queue một job import cho mỗi
          truyện. Quá trình có thể mất nhiều phút tới vài giờ tuỳ kích thước catalog.
        </p>

        <label className="mt-4 flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoCrawl}
            onChange={(e) => setAutoCrawl(e.target.checked)}
            disabled={busy}
            className="mt-0.5 h-4 w-4 rounded border-border-strong bg-bg-elevated text-accent focus:ring-2 focus:ring-accent cursor-pointer"
          />
          <span className="text-body-sm text-fg-muted">
            Tự động crawl chapter content{' '}
            <span className="text-fg-subtle">(chạy ngay sau khi metadata sẵn sàng)</span>
          </span>
        </label>

        {error ? (
          <p className="mt-3 text-body-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-10 items-center rounded-md px-4 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent-gradient px-4 text-body-sm font-semibold text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Đang xử lý…
              </>
            ) : autoCrawl ? (
              <>
                <Zap className="h-4 w-4" aria-hidden />
                Import tất cả →
              </>
            ) : (
              <>
                <Download className="h-4 w-4" aria-hidden />
                Import tất cả →
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
