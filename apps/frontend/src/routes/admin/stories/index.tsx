import { type BulkAction, discoverApi } from '@/api/discover';
import { listStories } from '@/api/stories';
import { ImportStoryForm } from '@/components/admin/ImportStoryForm';
import { StubBadge } from '@/components/admin/StubBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { EmptyFolder } from '@/components/ui/illustrations/EmptyFolder';
import { EmptySearch } from '@/components/ui/illustrations/EmptySearch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { ChevronRight, Compass, Download, Loader2, Search, X, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';

export const Route = createFileRoute('/admin/stories/')({
  component: AdminStoriesPage,
});

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

type Filter = 'all' | 'full' | 'stub';

function AdminStoriesPage() {
  const qc = useQueryClient();
  const { data: stories = [], isLoading } = useQuery({
    queryKey: ['stories', { page: 1, limit: 100 }],
    queryFn: () => listStories(1, 100),
  });

  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const stubCount = stories.filter((s) => s.discoveryStatus !== 'complete').length;
  const fullCount = stories.length - stubCount;

  const filtered = useMemo(
    () =>
      stories.filter((s) => {
        if (filter === 'full') return s.discoveryStatus === 'complete';
        if (filter === 'stub') return s.discoveryStatus !== 'complete';
        return true;
      }),
    [stories, filter],
  );

  const visibleIds = filtered.map((s) => s.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id)) && !allVisibleSelected;

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
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
        <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-sans font-semibold text-heading-md text-fg mr-2">
              Danh sách truyện
            </h2>
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              Tất cả ({stories.length})
            </FilterChip>
            <FilterChip active={filter === 'full'} onClick={() => setFilter('full')}>
              Đã có chapter ({fullCount})
            </FilterChip>
            <FilterChip active={filter === 'stub'} onClick={() => setFilter('stub')}>
              Chỉ metadata ({stubCount})
            </FilterChip>
          </div>
        </div>
        {isLoading ? (
          <p className="text-body-sm text-fg-muted p-8 text-center">Đang tải...</p>
        ) : filtered.length === 0 ? (
          <StoriesEmptyState filter={filter} />
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
                    Cập nhật
                  </th>
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
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
                        {isStub ? <span className="text-fg-muted">—</span> : r.totalChapters}
                      </td>
                      <td className="px-3 py-3 text-[11px] text-fg-muted tabular-nums">
                        {new Date(r.updatedAt).toLocaleDateString('vi-VN')}
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
        'discover-and-crawl': 'quét + crawl',
      };
      const skip = res.skipped.length;
      setInfo(
        `Đã enqueue ${res.queued.length} truyện cho ${labels[vars.action]}${skip > 0 ? `, bỏ qua ${skip}` : ''}. Theo dõi ở Jobs.`,
      );
      onDone();
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
      {error && <p className="mt-2 text-[11px] text-destructive text-center">{error}</p>}
      {info && !error && <p className="mt-2 text-[11px] text-positive text-center">{info}</p>}
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
