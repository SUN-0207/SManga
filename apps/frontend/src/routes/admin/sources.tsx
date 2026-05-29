import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Compass, Trash2, ExternalLink } from 'lucide-react';
import { sourcesApi } from '@/api/sources';
import { SourceForm } from '@/components/admin/SourceForm';

export const Route = createFileRoute('/admin/sources')({
  component: AdminSourcesPage,
});

function AdminSourcesPage() {
  const queryClient = useQueryClient();
  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: sourcesApi.list,
  });
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleRemove(id: string) {
    if (!confirm(`Xóa source "${id}"?`)) return;
    setDeleting(id);
    try {
      await sourcesApi.remove(id);
      await queryClient.invalidateQueries({ queryKey: ['sources'] });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
          Hệ thống
        </p>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">Sources</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl">
          Các nguồn (adapter) được đăng ký để crawl truyện. ID phải khớp với folder
          adapter trong{' '}
          <code className="text-xs px-1.5 py-0.5 rounded bg-muted">packages/crawler/src/sources/</code>.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-background p-5">
        <h2 className="font-heading font-semibold text-base mb-4">Thêm source mới</h2>
        <SourceForm />
      </div>

      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-heading font-semibold text-base">Danh sách</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{sources.length}</span>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground p-8 text-center">Đang tải...</p>
        ) : sources.length === 0 ? (
          <p className="text-sm text-muted-foreground p-8 text-center">Chưa có source nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    ID
                  </th>
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Tên
                  </th>
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Base URL
                  </th>
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground tabular-nums">
                    RPS
                  </th>
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    Trạng thái
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sources.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{r.id}</td>
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-5 py-3">
                      <a
                        href={r.baseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer"
                      >
                        {r.baseUrl}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                    <td className="px-5 py-3 tabular-nums text-sm">{r.rateLimitRps}</td>
                    <td className="px-5 py-3">
                      <StatusDot active={r.isActive} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          to="/admin/sources/$id/discover"
                          params={{ id: r.id }}
                          search={{ feed: undefined, page: 1, q: '' }}
                          aria-label={`Khám phá ${r.name}`}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Compass className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleRemove(r.id)}
                          disabled={deleting === r.id}
                          aria-label="Xóa source"
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
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

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
      />
      {active ? 'active' : 'inactive'}
    </span>
  );
}
