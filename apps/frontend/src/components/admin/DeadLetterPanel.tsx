import { type DeadLetterRow, jobsApi } from '@/api/jobs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw, X } from 'lucide-react';

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-bg-subtle text-fg-muted border-border',
  retrying: 'bg-accent/15 text-accent border-accent/30',
  needs_attention: 'bg-destructive/15 text-destructive border-destructive/30',
  dead: 'bg-destructive/15 text-destructive border-destructive/30',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ retry',
  retrying: 'Đang retry',
  needs_attention: 'Cần xử lý',
  dead: 'Đã bỏ cuộc',
};

function formatNext(next: string | null): string {
  if (!next) return '—';
  const d = new Date(next);
  return d.toLocaleString('vi-VN');
}

export function DeadLetterPanel({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();

  const rowsQ = useQuery({
    queryKey: ['jobs', 'dead-letter'],
    queryFn: jobsApi.deadLetter,
    enabled,
    refetchInterval: enabled ? 15000 : false,
    retry: false,
  });

  const autoRetryQ = useQuery({
    queryKey: ['jobs', 'auto-retry'],
    queryFn: jobsApi.getAutoRetry,
    enabled,
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['jobs'] });

  const retryNow = useMutation({
    mutationFn: (id: string) => jobsApi.deadLetterRetryNow(id),
    onSuccess: invalidate,
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => jobsApi.deadLetterDismiss(id),
    onSuccess: invalidate,
  });
  const retryAll = useMutation({
    mutationFn: jobsApi.deadLetterRetryAll,
    onSuccess: (data) => {
      invalidate();
      window.alert(`Đã đưa ${data.rearmed} mục vào hàng đợi retry.`);
    },
  });
  const toggleAutoRetry = useMutation({
    mutationFn: (next: boolean) => jobsApi.setAutoRetry(next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs', 'auto-retry'] }),
  });

  const rows: DeadLetterRow[] = rowsQ.data ?? [];
  const autoRetryOn = autoRetryQ.data?.autoRetryEnabled ?? true;

  return (
    <div className="rounded-xl border border-border bg-bg overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="font-sans font-semibold text-base">Cần xử lý / Dead Letter</h2>
          <span className="text-xs text-fg-muted tabular-nums">{rows.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRetryOn}
              disabled={toggleAutoRetry.isPending}
              onChange={(e) => toggleAutoRetry.mutate(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
            />
            Tự động retry
          </label>
          {rows.length > 0 && (
            <button
              type="button"
              disabled={retryAll.isPending}
              onClick={() => retryAll.mutate()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm border border-border hover:border-fg/40 hover:bg-bg-subtle/60 disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {retryAll.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Retry tất cả
            </button>
          )}
        </div>
      </div>

      {rowsQ.isLoading ? (
        <p className="text-sm text-fg-muted p-8 text-center">Đang tải...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted p-8 text-center">Không có job nào cần xử lý.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-fg-muted border-b border-border">
                <th className="px-5 py-2 font-medium">Job</th>
                <th className="px-5 py-2 font-medium">Lỗi</th>
                <th className="px-5 py-2 font-medium">Gen</th>
                <th className="px-5 py-2 font-medium">Retry kế</th>
                <th className="px-5 py-2 font-medium">Trạng thái</th>
                <th className="px-5 py-2 font-medium text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-2">
                    <div className="font-medium">{r.jobName}</div>
                    <div className="text-xs text-fg-muted truncate max-w-[22ch]">{r.dedupKey}</div>
                  </td>
                  <td className="px-5 py-2">
                    <span
                      className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] border whitespace-nowrap ${
                        r.classification === 'permanent'
                          ? 'bg-destructive/15 text-destructive border-destructive/30'
                          : 'bg-bg-subtle text-fg-muted border-border'
                      }`}
                    >
                      {r.errorClass}
                    </span>
                    <div className="text-xs text-fg-muted truncate max-w-[28ch]">
                      {r.failedReason}
                    </div>
                  </td>
                  <td className="px-5 py-2 tabular-nums">{r.retryGeneration}</td>
                  <td className="px-5 py-2 text-xs text-fg-muted whitespace-nowrap">
                    {formatNext(r.nextRetryAt)}
                  </td>
                  <td className="px-5 py-2">
                    <span
                      className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] border whitespace-nowrap ${
                        STATUS_TONE[r.status] ?? STATUS_TONE.pending
                      }`}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-5 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        title="Retry ngay"
                        disabled={retryNow.isPending}
                        onClick={() => retryNow.mutate(r.id)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border hover:bg-bg-subtle/60 disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Bỏ qua"
                        disabled={dismiss.isPending}
                        onClick={() => dismiss.mutate(r.id)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border hover:bg-bg-subtle/60 disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <X className="h-3.5 w-3.5" />
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
  );
}
