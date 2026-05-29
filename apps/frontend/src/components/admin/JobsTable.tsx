import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { jobsApi, type JobRow } from '@/api/jobs';

const PAGE_SIZE = 25;

const STATE_TONE: Record<string, string> = {
  completed: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  active: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  waiting: 'bg-muted text-foreground/70 border-border',
  failed: 'bg-destructive/15 text-destructive border-destructive/30',
  delayed: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  paused: 'bg-muted text-muted-foreground border-border',
};

export function JobsTable({ jobs }: { jobs: JobRow[] }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const slice = useMemo(
    () => jobs.slice(startIdx, startIdx + PAGE_SIZE),
    [jobs, startIdx],
  );

  async function retry(id: string) {
    setBusy(id);
    try {
      await jobsApi.retry(id);
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } finally {
      setBusy(null);
    }
  }

  if (jobs.length === 0) {
    return <p className="text-sm text-muted-foreground p-8 text-center">Không có job nào.</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-5 py-2.5 w-44 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                Job
              </th>
              <th className="px-5 py-2.5 w-28 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                State
              </th>
              <th className="px-5 py-2.5 w-20 text-[11px] uppercase tracking-wider font-medium text-muted-foreground tabular-nums">
                Retry
              </th>
              <th className="px-5 py-2.5 w-36 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                Tạo
              </th>
              <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                Lỗi
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {slice.map((j) => (
              <tr key={j.id} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-2 font-mono text-xs">{j.name}</td>
                <td className="px-5 py-2">
                  <span
                    className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] border ${
                      STATE_TONE[j.state] ?? STATE_TONE.waiting
                    }`}
                  >
                    {j.state}
                  </span>
                </td>
                <td className="px-5 py-2 tabular-nums text-sm">{j.attemptsMade}</td>
                <td className="px-5 py-2 text-xs text-muted-foreground tabular-nums">
                  {j.timestamp ? new Date(j.timestamp).toLocaleString('vi-VN') : '—'}
                </td>
                <td className="px-5 py-2 text-xs text-destructive truncate max-w-md">
                  {j.failedReason ?? ''}
                </td>
                <td className="px-5 py-2 text-right">
                  {j.state === 'failed' && (
                    <button
                      type="button"
                      onClick={() => retry(j.id)}
                      disabled={busy === j.id}
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs border border-border hover:border-foreground/40 hover:bg-muted/60 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="border-t border-border px-5 py-3 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Hiển thị {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, jobs.length)} / {jobs.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              aria-label="Trang trước"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border hover:border-foreground/40 hover:bg-muted/60 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 text-muted-foreground tabular-nums">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              aria-label="Trang sau"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border hover:border-foreground/40 hover:bg-muted/60 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
