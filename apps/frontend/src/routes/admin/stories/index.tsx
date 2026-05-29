import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Compass } from 'lucide-react';
import { listStories } from '@/api/stories';
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
  const { data: stories = [], isLoading } = useQuery({
    queryKey: ['stories', { page: 1, limit: 100 }],
    queryFn: () => listStories(1, 100),
  });

  const [filter, setFilter] = useState<Filter>('all');

  const stubCount = stories.filter((s) => s.discoveryStatus !== 'complete').length;
  const fullCount = stories.length - stubCount;

  const filtered = stories.filter((s) => {
    if (filter === 'full') return s.discoveryStatus === 'complete';
    if (filter === 'stub') return s.discoveryStatus !== 'complete';
    return true;
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
          Nội dung
        </p>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">Truyện</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl">
          Khám phá catalog từ source rồi import metadata. Quét chapter và crawl nội dung chạy theo
          lệnh từng truyện.
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
          <p className="text-sm text-muted-foreground p-8 text-center">
            {filter === 'all'
              ? 'Chưa có truyện nào.'
              : filter === 'stub'
                ? 'Không có truyện chỉ metadata.'
                : 'Không có truyện đã đủ chapter.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Tiêu đề
                  </th>
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Tác giả
                  </th>
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Trạng thái
                  </th>
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Discovery
                  </th>
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground tabular-nums">
                    Chapter
                  </th>
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Cập nhật
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isStub = r.discoveryStatus !== 'complete';
                  return (
                    <tr
                      key={r.id}
                      className="group border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors duration-150"
                    >
                      <td className="px-5 py-3 font-medium">
                        <Link
                          to="/admin/stories/$id"
                          params={{ id: r.id }}
                          className="hover:underline underline-offset-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                        >
                          {r.title}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{r.author ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] border ${STATUS_TONE[r.status] ?? STATUS_TONE.unknown}`}
                        >
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <StubBadge status={r.discoveryStatus} />
                      </td>
                      <td className="px-5 py-3 tabular-nums">
                        {isStub ? <span className="text-muted-foreground">—</span> : r.totalChapters}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground tabular-nums">
                        {new Date(r.updatedAt).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-5 py-3 text-right">
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
    </div>
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
