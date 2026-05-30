import { useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Compass, Download, Loader2, Search, X, Zap } from 'lucide-react';
import { listStories } from '@/api/stories';
import { discoverApi, type BulkAction } from '@/api/discover';
import { ImportStoryForm } from '@/components/admin/ImportStoryForm';
import { StubBadge } from '@/components/admin/StubBadge';

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
  ongoing: 'bg-[hsl(var(--color-cta))]/15 text-[hsl(var(--color-cta))] border-[hsl(var(--color-cta))]/30',
  completed: 'bg-foreground/10 text-foreground border-foreground/20',
  dropped: 'bg-muted text-muted-foreground border-border',
  unknown: 'bg-muted text-muted-foreground border-border',
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
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected =
    visibleIds.some((id) => selected.has(id)) && !allVisibleSelected;

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
        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
          Nội dung
        </p>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">Truyện</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl">
          Khám phá catalog từ source rồi import metadata. Chọn nhiều truyện và bấm quét + crawl
          hàng loạt thay vì làm từng truyện.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-background p-5">
        <h2 className="font-heading font-semibold text-base mb-4">Bắt đầu từ catalog</h2>
        <Link
          to="/admin/sources"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
        >
          <Compass className="h-4 w-4" />
          Chọn nguồn để khám phá
        </Link>
        <details className="mt-4 group">
          <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors duration-200 select-none">
            Hoặc dán URL trực tiếp một truyện
          </summary>
          <div className="mt-3 pt-3 border-t border-border/60">
            <ImportStoryForm />
          </div>
        </details>
      </div>

      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-heading font-semibold text-base mr-2">Danh sách truyện</h2>
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
          <p className="text-sm text-muted-foreground p-8 text-center">Đang tải...</p>
        ) : filtered.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pl-5 pr-2 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someVisibleSelected;
                      }}
                      onChange={toggleAll}
                      aria-label="Chọn tất cả truyện hiển thị"
                      className="h-4 w-4 rounded border-border accent-[hsl(var(--color-cta))] cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Tiêu đề
                  </th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Tác giả
                  </th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Trạng thái
                  </th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Discovery
                  </th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground tabular-nums">
                    Chapter
                  </th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
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
                      className={`group border-b border-border/60 last:border-0 transition-colors duration-150 ${
                        isChecked ? 'bg-muted/40' : 'hover:bg-muted/30'
                      }`}
                    >
                      <td className="pl-5 pr-2 py-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOne(r.id)}
                          aria-label={`Chọn ${r.title}`}
                          className="h-4 w-4 rounded border-border accent-[hsl(var(--color-cta))] cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-3 font-medium">
                        <Link
                          to="/admin/stories/$id"
                          params={{ id: r.id }}
                          className="hover:underline underline-offset-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                        >
                          {r.title}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{r.author ?? '—'}</td>
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
                      <td className="px-3 py-3 tabular-nums">
                        {isStub ? <span className="text-muted-foreground">—</span> : r.totalChapters}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">
                        {new Date(r.updatedAt).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <ChevronRight className="h-4 w-4 inline text-muted-foreground/40 transition-all duration-200 group-hover:text-foreground group-hover:translate-x-0.5" />
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

function EmptyState({ filter }: { filter: Filter }) {
  let msg = 'Chưa có truyện nào.';
  if (filter === 'stub') msg = 'Không có truyện chỉ metadata.';
  else if (filter === 'full') msg = 'Không có truyện đã đủ chapter.';
  return <p className="text-sm text-muted-foreground p-8 text-center">{msg}</p>;
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
        `Đã enqueue ${res.queued.length} truyện cho ${labels[vars.action]}` +
          (skip > 0 ? `, bỏ qua ${skip}` : '') +
          '. Theo dõi ở Jobs.',
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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[min(720px,calc(100%-3rem))] rounded-2xl border border-border bg-background shadow-[0_30px_60px_-20px_rgba(0,0,0,0.35)] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-foreground text-background text-xs font-bold tabular-nums">
            {ids.length}
          </span>
          <span className="text-muted-foreground">
            đã chọn{ids.length > 100 ? ' (vượt giới hạn 100)' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={onClear}
            disabled={mut.isPending || ids.length === 0}
            aria-label="Bỏ chọn tất cả"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-4 w-4" />
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
      {error && <p className="text-xs text-destructive">{error}</p>}
      {info && !error && <p className="text-xs text-emerald-600">{info}</p>}
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
  const base =
    'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  const cls =
    variant === 'cta'
      ? `${base} bg-[hsl(var(--color-cta))] text-white hover:opacity-95 focus-visible:ring-[hsl(var(--color-cta))]`
      : `${base} border border-border hover:border-foreground/40 hover:bg-muted/60 focus-visible:ring-primary`;
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
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
      className={
        active
          ? 'inline-flex items-center h-7 px-3 rounded-full text-[11px] font-medium bg-foreground text-background transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2'
          : 'inline-flex items-center h-7 px-3 rounded-full text-[11px] border border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground hover:bg-muted/60 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
      }
    >
      {children}
    </button>
  );
}
