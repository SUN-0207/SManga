import { sourcesApi } from '@/api/sources';
import { SourceForm } from '@/components/admin/SourceForm';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Compass, ExternalLink, Trash2 } from 'lucide-react';
import { useState } from 'react';

export const Route = createFileRoute('/admin/sources/')({
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
        <p className="text-[11px] uppercase tracking-[0.28em] text-fg-muted font-medium mb-2">
          Hệ thống
        </p>
        <h1 className="font-sans font-bold text-3xl sm:text-4xl tracking-tight text-fg">Sources</h1>
        <p className="text-body-sm text-fg-muted mt-2 max-w-xl">
          Các nguồn (adapter) được đăng ký để crawl truyện. ID phải khớp với folder adapter trong{' '}
          <code className="text-[11px] px-1.5 py-0.5 rounded bg-bg-subtle text-fg-muted">
            packages/crawler/src/sources/
          </code>
          .
        </p>
      </div>

      <div className="rounded-lg border border-border bg-bg-elevated p-5">
        <h2 className="font-sans font-semibold text-heading-md text-fg mb-4">Thêm source mới</h2>
        <SourceForm />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-bg-elevated">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-sans font-semibold text-heading-md text-fg">Danh sách</h2>
          <span className="text-[11px] text-fg-muted tabular-nums">{sources.length}</span>
        </div>
        {isLoading ? (
          <p className="text-body-sm text-fg-muted p-8 text-center">Đang tải...</p>
        ) : sources.length === 0 ? (
          <p className="text-body-sm text-fg-muted p-8 text-center">Chưa có source nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="sticky top-0 z-10 bg-bg/95 backdrop-blur">
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                    ID
                  </th>
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                    Tên
                  </th>
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                    Base URL
                  </th>
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted tabular-nums">
                    RPS
                  </th>
                  <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                    Trạng thái
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sources.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 last:border-0 transition-colors duration-fast hover:bg-bg-subtle/60"
                  >
                    <td className="px-5 py-3 font-mono text-[11px] text-fg-muted">{r.id}</td>
                    <td className="px-5 py-3 font-medium text-fg">{r.name}</td>
                    <td className="px-5 py-3">
                      <a
                        href={r.baseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg transition-colors duration-fast cursor-pointer"
                      >
                        {r.baseUrl}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                    <td className="px-5 py-3 tabular-nums text-body-sm text-fg">
                      {r.rateLimitRps}
                    </td>
                    <td className="px-5 py-3">
                      <StatusDot enabled={r.isActive} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          to="/admin/sources/$id/discover"
                          params={{ id: r.id }}
                          search={{ feed: undefined, page: 1, q: '' }}
                          aria-label={`Khám phá ${r.name}`}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <Compass className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleRemove(r.id)}
                          disabled={deleting === r.id}
                          aria-label="Xóa source"
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-fg-muted transition-colors duration-fast hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50 disabled:cursor-not-allowed"
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

function StatusDot({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${enabled ? 'bg-positive' : 'bg-bg-subtle'}`}
      aria-label={enabled ? 'Đang bật' : 'Đã tắt'}
    />
  );
}
