import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { listStories } from '@/api/stories';
import { ImportStoryForm } from '@/components/admin/ImportStoryForm';

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

function AdminStoriesPage() {
  const { data: stories = [], isLoading } = useQuery({
    queryKey: ['stories', { page: 1, limit: 100 }],
    queryFn: () => listStories(1, 100),
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
          Nội dung
        </p>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">Truyện</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl">
          Import truyện mới và theo dõi tiến độ crawl theo từng truyện.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-background p-5">
        <h2 className="font-heading font-semibold text-base mb-4">Import truyện mới</h2>
        <ImportStoryForm />
      </div>

      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-heading font-semibold text-base">Danh sách truyện</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{stories.length}</span>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground p-8 text-center">Đang tải...</p>
        ) : stories.length === 0 ? (
          <p className="text-sm text-muted-foreground p-8 text-center">Chưa có truyện nào.</p>
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
                {stories.map((r) => (
                  <tr key={r.id} className="group border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors duration-150">
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
                    <td className="px-5 py-3 tabular-nums">{r.totalChapters}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground tabular-nums">
                      {new Date(r.updatedAt).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <ChevronRight className="h-4 w-4 inline text-muted-foreground/40 transition-all duration-200 group-hover:text-foreground group-hover:translate-x-0.5" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
