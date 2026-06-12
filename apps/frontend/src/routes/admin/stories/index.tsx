import { type BulkAction, discoverApi } from '@/api/discover';
import { getStoriesCounts, listStories } from '@/api/stories';
import { ImportStoryForm } from '@/components/admin/ImportStoryForm';
import { StubBadge } from '@/components/admin/StubBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyFolder } from '@/components/ui/illustrations/EmptyFolder';
import { EmptySearch } from '@/components/ui/illustrations/EmptySearch';
import { type CrawlBadgeKind, crawlBadge } from '@/lib/crawl-badge';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Compass,
  Download,
  Loader2,
  Search,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';

export const Route = createFileRoute('/admin/stories/')({
  component: AdminStoriesPage,
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search.page === 'number' ? search.page : Number(search.page) || 1,
    q: typeof search.q === 'string' ? search.q : '',
  }),
});

const PAGE_SIZE = 50;

const STATUS_LABEL: Record<string, string> = {
  ongoing: 'Đang ra',
  completed: 'Hoàn thành',
  dropped: 'Tạm dừng',
  unknown: '—',
};

const STATUS_TONE: Record<string, string> = {
  completed: 'bg-positive/15 text-positive border-positive/30',
  ongoing: 'bg-accent/15 text-accent border-accent/30',
  dropped: 'bg-bg-subtle text-fg-muted border-border',
  unknown: 'bg-bg-subtle text-fg-muted border-border',
};

const CRAWL_BADGE: Record<
  Exclude<CrawlBadgeKind, 'stub'>,
  { label: (n: number) => string; tone: string; icon: typeof CheckCircle2 }
> = {
  full: {
    label: () => 'Đủ',
    tone: 'bg-positive/15 text-positive border-positive/30',
    icon: CheckCircle2,
  },
  failed: {
    label: (n) => `Lỗi ${n}`,
    tone: 'bg-destructive/15 text-destructive border-destructive/30',
    icon: XCircle,
  },
  untouched: {
    label: () => 'Chưa crawl',
    tone: 'bg-bg-subtle text-fg-muted border-border',
    icon: Circle,
  },
  partial: {
    label: (n) => `Thiếu ${n}`,
    tone: 'bg-accent/15 text-accent border-accent/30',
    icon: AlertTriangle,
  },
};

type Filter = 'all' | 'full' | 'stub' | 'needs-crawl' | 'has-errors';

function formatDateVN(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function AdminStoriesPage() {
  const qc = useQueryClient();
  const { page, q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Local input mirrors the URL `q` so typing feels instant; we debounce the
  // commit back to the URL (and therefore the query keys) by 400ms.
  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => {
    if (searchInput === q) return;
    const t = setTimeout(() => {
      void navigate({ search: { q: searchInput.trim(), page: 1 } });
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, q, navigate]);

  function clearSearch() {
    setSearchInput('');
    void navigate({ search: { q: '', page: 1 } });
  }

  function setPage(next: number) {
    void navigate({ search: { q, page: next } });
  }

  // Translate UI filter → server param. 'all' = no filter on discovery_status.
  // 'needs-crawl' / 'has-errors' are their own axis — leave discoveryStatus
  // unset; the server forces discovery='complete' inside those filters.
  const discoveryParam = filter === 'full' ? 'complete' : filter === 'stub' ? 'stub' : undefined;
  const crawlStateParam = filter === 'needs-crawl' || filter === 'has-errors' ? filter : undefined;
  // Pass undefined (not empty string) so the API params object omits `q`
  // entirely when the search is blank — keeps the URL/query cache clean.
  const qParam = q || undefined;

  const { data: stories = [], isLoading } = useQuery({
    queryKey: ['admin-stories', 'list', { page, limit: PAGE_SIZE, filter, q }],
    queryFn: () =>
      listStories(
        page,
        PAGE_SIZE,
        undefined,
        undefined,
        discoveryParam,
        undefined,
        qParam,
        crawlStateParam,
      ),
    placeholderData: (prev) => prev,
  });

  // ONE round-trip for all five filter-pill totals; AbortSignal cancels
  // superseded keystrokes' queries server-side.
  const countsQ = useQuery({
    queryKey: ['admin-stories', 'counts', q],
    queryFn: ({ signal }) => getStoriesCounts(qParam, signal),
    placeholderData: (prev) => prev,
  });

  const totalAll = countsQ.data?.all ?? 0;
  const totalFull = countsQ.data?.full ?? 0;
  const totalStub = countsQ.data?.stub ?? 0;
  const totalNeedsCrawl = countsQ.data?.needsCrawl ?? 0;
  const totalHasErrors = countsQ.data?.hasErrors ?? 0;
  const activeTotal =
    filter === 'full'
      ? totalFull
      : filter === 'stub'
        ? totalStub
        : filter === 'needs-crawl'
          ? totalNeedsCrawl
          : filter === 'has-errors'
            ? totalHasErrors
            : totalAll;
  const totalPages = Math.max(1, Math.ceil(activeTotal / PAGE_SIZE));

  function changeFilter(next: Filter) {
    setFilter(next);
    setPage(1);
  }

  const visibleIds = stories.map((s) => s.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id)) && !allVisibleSelected;

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSel() {
    setSelected(new Set());
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-fg-muted font-medium mb-2">
          Nội dung
        </p>
        <h1 className="font-sans font-bold text-3xl sm:text-4xl tracking-tight text-fg">Truyện</h1>
        <p className="text-body-sm text-fg-muted mt-2 max-w-xl">
          Khám phá catalog từ source rồi import metadata. Chọn nhiều truyện và bấm quét + crawl hàng
          loạt thay vì làm từng truyện.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-bg-elevated p-5">
        <h2 className="font-sans font-semibold text-heading-md text-fg mb-4">Bắt đầu từ catalog</h2>
        <Link
          to="/admin/sources"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-fg text-bg text-body-sm font-medium hover:opacity-90 transition-opacity duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2"
        >
          <Compass className="h-4 w-4" />
          Chọn nguồn để khám phá
        </Link>
        <details className="mt-4 group">
          <summary className="text-body-sm text-fg-muted cursor-pointer hover:text-fg transition-colors duration-fast select-none">
            Hoặc dán URL trực tiếp một truyện
          </summary>
          <div className="mt-3 pt-3 border-t border-border/60">
            <ImportStoryForm />
          </div>
        </details>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-bg-elevated">
        <div className="px-5 py-3 border-b border-border space-y-3">
          <div className="relative max-w-md">
            <Search
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle pointer-events-none"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm theo tên truyện hoặc tác giả..."
              aria-label="Tìm truyện theo tên hoặc tác giả"
              className="block h-10 w-full rounded-md border border-border bg-bg-subtle pl-9 pr-10 text-body-sm text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            {searchInput.length > 0 && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Xoá tìm kiếm"
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-6 w-6 rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-sans font-semibold text-heading-md text-fg mr-2">
              Danh sách truyện
            </h2>
            <FilterChip active={filter === 'all'} onClick={() => changeFilter('all')}>
              Tất cả ({totalAll.toLocaleString('vi-VN')})
            </FilterChip>
            <FilterChip active={filter === 'full'} onClick={() => changeFilter('full')}>
              Đã có chapter ({totalFull.toLocaleString('vi-VN')})
            </FilterChip>
            <FilterChip active={filter === 'stub'} onClick={() => changeFilter('stub')}>
              Chỉ metadata ({totalStub.toLocaleString('vi-VN')})
            </FilterChip>
            <FilterChip
              active={filter === 'needs-crawl'}
              onClick={() => changeFilter('needs-crawl')}
            >
              ⚠ Cần crawl ({totalNeedsCrawl.toLocaleString('vi-VN')})
            </FilterChip>
            <FilterChip active={filter === 'has-errors'} onClick={() => changeFilter('has-errors')}>
              ✕ Lỗi crawl ({totalHasErrors.toLocaleString('vi-VN')})
            </FilterChip>
          </div>
        </div>
        {isLoading ? (
          <p className="text-body-sm text-fg-muted p-8 text-center">Đang tải...</p>
        ) : stories.length === 0 ? (
          q ? (
            <EmptyState
              illustration={<EmptySearch />}
              title="Không tìm thấy truyện nào"
              description={`Không có truyện nào khớp với "${q}". Thử từ khoá khác.`}
              cta={{ label: 'Xoá tìm kiếm', onClick: clearSearch }}
            />
          ) : (
            <StoriesEmptyState filter={filter} />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="sticky top-0 z-10 bg-bg/95 backdrop-blur">
                <tr className="border-b border-border">
                  <th className="pl-5 pr-2 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someVisibleSelected;
                      }}
                      onChange={toggleAll}
                      aria-label="Chọn tất cả truyện hiển thị"
                      className="h-4 w-4 rounded border-border text-accent cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                    Tiêu đề
                  </th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                    Tác giả
                  </th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                    Trạng thái
                  </th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                    Discovery
                  </th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted tabular-nums">
                    Chapter
                  </th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                    Crawl
                  </th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                    Cập nhật
                  </th>
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {stories.map((r) => {
                  const isStub = r.discoveryStatus !== 'complete';
                  const isChecked = selected.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`group border-b border-border/60 last:border-0 transition-colors duration-fast ${
                        isChecked
                          ? 'border-l-2 border-l-accent bg-bg-subtle'
                          : 'hover:bg-bg-subtle/60'
                      }`}
                    >
                      <td className="pl-5 pr-2 py-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOne(r.id)}
                          aria-label={`Chọn ${r.title}`}
                          className="h-4 w-4 rounded border-border text-accent cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-fg">
                        <Link
                          to="/admin/stories/$id"
                          params={{ id: r.id }}
                          className="hover:underline underline-offset-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                        >
                          {r.title}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-fg-muted">{r.author ?? '—'}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] border whitespace-nowrap ${STATUS_TONE[r.status] ?? STATUS_TONE.unknown}`}
                        >
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <StubBadge status={r.discoveryStatus} />
                      </td>
                      <td className="px-3 py-3 tabular-nums text-fg">
                        {isStub ? (
                          <span className="text-fg-muted">—</span>
                        ) : (
                          `${r.crawledChapters}/${r.crawledChapters + r.pendingChapters + r.failedChapters}`
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {(() => {
                          const b = crawlBadge(r);
                          if (b.kind === 'stub') return <span className="text-fg-muted">—</span>;
                          const meta = CRAWL_BADGE[b.kind];
                          const Icon = meta.icon;
                          return (
                            <span
                              className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] border whitespace-nowrap ${meta.tone}`}
                            >
                              <Icon className="h-3 w-3" aria-hidden />
                              {meta.label(b.count)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 text-[11px] text-fg-muted tabular-nums">
                        {formatDateVN(r.updatedAt)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <ChevronRight className="h-4 w-4 inline text-fg-subtle transition-all duration-fast group-hover:text-fg group-hover:translate-x-0.5" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        isLoading={isLoading}
        onChange={(p) => {
          setPage(p);
          // page change leaves the previous-page selection ambiguous; clear it
          // so bulk-action operates only on visible rows.
          setSelected(new Set());
        }}
      />

      <BulkActionBar
        ids={[...selected]}
        onClear={clearSel}
        onDone={() => qc.invalidateQueries({ queryKey: ['stories'] })}
      />
    </div>
  );
}

function StoriesEmptyState({ filter }: Readonly<{ filter: Filter }>) {
  if (filter === 'stub') {
    return (
      <EmptyState
        illustration={<EmptySearch />}
        title="Không có truyện chỉ metadata"
        description="Tất cả truyện đã được crawl đầy đủ chapter."
      />
    );
  }
  if (filter === 'full') {
    return (
      <EmptyState
        illustration={<EmptySearch />}
        title="Không có truyện đã đủ chapter"
        description="Chưa có truyện nào hoàn thành crawl. Hãy quét + crawl từ catalog."
      />
    );
  }
  if (filter === 'needs-crawl') {
    return (
      <EmptyState
        illustration={<EmptySearch />}
        title="Không có truyện cần crawl"
        description="Mọi truyện đã khám phá đều đã crawl đủ chapter (truyện lỗi nằm ở mục Lỗi crawl)."
      />
    );
  }
  if (filter === 'has-errors') {
    return (
      <EmptyState
        illustration={<EmptySearch />}
        title="Không có truyện lỗi crawl"
        description="Không có chương nào đang ở trạng thái lỗi."
      />
    );
  }
  return (
    <EmptyState
      illustration={<EmptyFolder />}
      title="Chưa có truyện nào"
      description="Bắt đầu từ catalog của một nguồn để import metadata."
      cta={{ label: 'Chọn nguồn', to: '/admin/sources' }}
    />
  );
}

function BulkActionBar({
  ids,
  onClear,
  onDone,
}: {
  ids: string[];
  onClear: () => void;
  onDone: () => void;
}) {
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: ({ action }: { action: BulkAction }) => discoverApi.bulkAction(ids, action),
    onSuccess: (res, vars) => {
      setError(null);
      const labels: Record<BulkAction, string> = {
        discover: 'quét chương',
        'crawl-missing': 'crawl missing',
        'crawl-failed': 'crawl lỗi',
        'discover-and-crawl': 'quét + crawl',
      };
      const skip = res.skipped.length;
      setInfo(
        `Đã enqueue ${res.queued.length} truyện cho ${labels[vars.action]}${skip > 0 ? `, bỏ qua ${skip}` : ''}. Theo dõi ở Jobs.`,
      );
      onDone();
      // Auto-clear the selection so the action bar dismisses itself after a
      // successful action — operators shouldn't have to click "Bỏ chọn".
      // The success toast below lingers briefly as confirmation, then hides.
      onClear();
      setTimeout(() => setInfo(null), 8_000);
    },
    onError: (err) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error).message ??
        'Lỗi không xác định';
      setError(typeof msg === 'string' ? msg : 'Lỗi');
    },
  });

  if (ids.length === 0 && !info && !error) return null;

  return (
    <>
      {ids.length > 0 && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[min(820px,calc(100%-3rem))]">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border-strong bg-bg-elevated px-4 py-3 shadow-elev flex-wrap">
            <span className="inline-flex h-7 items-center rounded-full bg-accent-gradient px-3 text-[12px] font-semibold text-white">
              {ids.length}
            </span>
            <span className="text-body-sm text-fg-muted">
              đã chọn{ids.length > 100 ? ' (vượt giới hạn 100)' : ''}
            </span>
            <div className="ml-auto flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={onClear}
                disabled={mut.isPending || ids.length === 0}
                aria-label="Bỏ chọn tất cả"
                className="inline-flex h-9 items-center gap-1 rounded-md border border-border-strong bg-bg-subtle px-3 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-bg-subtle/80 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="h-4 w-4" />
                Bỏ chọn
              </button>
              <ActionButton
                onClick={() => mut.mutate({ action: 'discover' })}
                disabled={mut.isPending || ids.length === 0 || ids.length > 100}
                busy={mut.isPending && mut.variables?.action === 'discover'}
                icon={<Search className="h-4 w-4" aria-hidden />}
                variant="outline"
              >
                Quét chương
              </ActionButton>
              <ActionButton
                onClick={() => mut.mutate({ action: 'crawl-missing' })}
                disabled={mut.isPending || ids.length === 0 || ids.length > 100}
                busy={mut.isPending && mut.variables?.action === 'crawl-missing'}
                icon={<Download className="h-4 w-4" aria-hidden />}
                variant="outline"
              >
                Crawl missing
              </ActionButton>
              <ActionButton
                onClick={() => mut.mutate({ action: 'crawl-failed' })}
                disabled={mut.isPending || ids.length === 0 || ids.length > 100}
                busy={mut.isPending && mut.variables?.action === 'crawl-failed'}
                icon={<XCircle className="h-4 w-4" aria-hidden />}
                variant="outline"
              >
                Chỉ crawl lỗi
              </ActionButton>
              <ActionButton
                onClick={() => mut.mutate({ action: 'discover-and-crawl' })}
                disabled={mut.isPending || ids.length === 0 || ids.length > 100}
                busy={mut.isPending && mut.variables?.action === 'discover-and-crawl'}
                icon={<Zap className="h-4 w-4" aria-hidden />}
                variant="cta"
              >
                Quét + Crawl
              </ActionButton>
            </div>
          </div>
        </div>
      )}
      {(error || info) && (
        <Toast
          message={(error ?? info) as string}
          tone={error ? 'error' : 'success'}
          onClose={() => {
            setError(null);
            setInfo(null);
          }}
        />
      )}
    </>
  );
}

function Toast({
  message,
  tone,
  onClose,
}: {
  message: string;
  tone: 'success' | 'error';
  onClose: () => void;
}) {
  // Slide-in on mount via a transition — this project has no animation plugin.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const isError = tone === 'error';
  const Icon = isError ? XCircle : CheckCircle2;
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 w-[min(380px,calc(100vw-2rem))]">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-bg-elevated px-4 py-3 shadow-elev transition-all duration-slow ease-spring ${
          shown ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
        } ${isError ? 'border-destructive/40' : 'border-positive/40'}`}
      >
        <Icon
          className={`mt-0.5 h-5 w-5 shrink-0 ${isError ? 'text-destructive' : 'text-positive'}`}
          aria-hidden
        />
        <p className="flex-1 text-body-sm leading-snug text-fg">{message}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  busy,
  icon,
  variant,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  icon: React.ReactNode;
  variant: 'outline' | 'cta';
  children: React.ReactNode;
}) {
  if (variant === 'cta') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent-gradient px-4 text-body-sm font-bold text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong bg-bg-subtle px-3.5 text-body-sm font-medium text-fg transition-colors duration-fast hover:bg-bg-subtle/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center rounded-full px-3 text-body-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        active
          ? 'bg-fg text-bg'
          : 'border border-border text-fg-muted hover:border-border-strong hover:bg-bg-subtle hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}
