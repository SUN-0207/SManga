import { jobsApi } from '@/api/jobs';
import { JobsTable } from '@/components/admin/JobsTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { EmptyQueue } from '@/components/ui/illustrations/EmptyQueue';
import { useAuthStore } from '@/stores/auth-store';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  Timer,
} from 'lucide-react';
import { useState } from 'react';

export const Route = createFileRoute('/admin/jobs')({
  component: AdminJobsPage,
});

const STAT_META: Record<
  string,
  { label: string; icon: typeof CheckCircle2; tone: 'neutral' | 'positive' | 'warning' }
> = {
  waiting: { label: 'Chờ', icon: Clock, tone: 'neutral' },
  active: { label: 'Đang chạy', icon: Loader2, tone: 'neutral' },
  completed: { label: 'Hoàn thành', icon: CheckCircle2, tone: 'positive' },
  failed: { label: 'Thất bại', icon: AlertTriangle, tone: 'warning' },
  // "Đang lỗi" = jobs waiting for retry that already failed at least one
  // attempt (failedReason set, state='waiting'). Surfaces what Bull's
  // failed bucket misses — see jobs.service.stats() for the sampling.
  erroring: { label: 'Đang lỗi', icon: AlertCircle, tone: 'warning' },
  delayed: { label: 'Delay', icon: Timer, tone: 'neutral' },
  paused: { label: 'Dừng', icon: PauseCircle, tone: 'neutral' },
};

const STAT_ORDER = ['waiting', 'active', 'completed', 'failed', 'erroring', 'delayed', 'paused'];

function AdminJobsPage() {
  // Only poll while we have an admin session — prevents stray 403s during logout unmount
  const isLoggedIn = useAuthStore((s) => s.user !== null);

  const statsQ = useQuery({
    queryKey: ['jobs', 'stats'],
    // Wrap so React Query's context arg isn't forwarded to stats(fresh).
    queryFn: () => jobsApi.stats(),
    enabled: isLoggedIn,
    // 15s instead of 5s — under the 2026-06-09 scaling incident,
    // 5s × stats + list × 200+100 jobs sampled was the load that pushed
    // Redis to 100% CPU. BE caches stats() for 30s so polling faster than
    // that is wasted work anyway.
    refetchInterval: isLoggedIn ? 15000 : false,
    retry: false,
  });

  const jobsQ = useQuery({
    queryKey: ['jobs', 'list'],
    queryFn: jobsApi.list,
    enabled: isLoggedIn,
    // 15s instead of 5s — under the 2026-06-09 scaling incident,
    // 5s × stats + list × 200+100 jobs sampled was the load that pushed
    // Redis to 100% CPU. BE caches stats() for 30s so polling faster than
    // that is wasted work anyway.
    refetchInterval: isLoggedIn ? 15000 : false,
    retry: false,
  });

  const stats = (statsQ.data ?? {}) as Record<string, number>;
  const jobs = jobsQ.data ?? [];
  const failedCount = stats.failed ?? 0;

  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const retryAll = useMutation({
    mutationFn: jobsApi.retryAllFailed,
    onSuccess: (data) => {
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      window.alert(
        `Đã enqueue lại ${data.retried} job${data.skipped > 0 ? ` (bỏ qua ${data.skipped})` : ''}.`,
      );
    },
    onError: () => {
      window.alert('Retry thất bại. Xem log api để biết chi tiết.');
    },
  });

  const [refetchOpen, setRefetchOpen] = useState(false);
  const refetchAll = useMutation({
    mutationFn: jobsApi.refetchAllChapters,
    onSuccess: (data) => {
      setRefetchOpen(false);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      window.alert(
        `Đã enqueue ${data.enqueued.toLocaleString('vi-VN')} chapter để re-crawl. Theo dõi ở tab này.`,
      );
    },
    onError: () => {
      window.alert('Re-crawl thất bại. Xem log api để biết chi tiết.');
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-fg-muted font-medium mb-2">
            Hàng đợi
          </p>
          <h1 className="font-sans font-bold text-3xl sm:text-4xl tracking-tight">Jobs</h1>
          <p className="text-sm text-fg-muted mt-2">
            Theo dõi và retry job crawl. Tự động cập nhật mỗi 15 giây.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {failedCount > 0 && (
            <button
              type="button"
              disabled={retryAll.isPending}
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {retryAll.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Retry tất cả thất bại ({failedCount.toLocaleString('vi-VN')})
            </button>
          )}
          <button
            type="button"
            disabled={refetchAll.isPending}
            onClick={() => setRefetchOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm border border-border hover:border-fg/40 hover:bg-bg-subtle/60 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {refetchAll.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Re-crawl tất cả chapter
          </button>
          <button
            type="button"
            onClick={async () => {
              // Drop the React Query cache for both queries so the next
              // fetch goes through, AND fire stats() with fresh=true so the
              // BE skips its 30s server-side cache. Without the fresh flag
              // the operator gets the same stale numbers they were already
              // seeing — defeating the point of a "Làm mới" button.
              queryClient.removeQueries({ queryKey: ['jobs'] });
              const freshStats = await jobsApi.stats(true);
              queryClient.setQueryData(['jobs', 'stats'], freshStats);
              void jobsQ.refetch();
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm border border-border hover:border-fg/40 hover:bg-bg-subtle/60 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-bg border border-border p-6 shadow-elev">
            <h3 className="font-sans font-semibold text-lg">Retry {failedCount} job thất bại?</h3>
            <p className="mt-2 text-sm text-fg-muted">
              Tất cả job ở trạng thái <strong>Thất bại</strong> sẽ được enqueue lại. Token bucket 1
              rps vẫn áp dụng, nên ước tính ~{Math.ceil(failedCount / 60)} phút để chạy xong.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={retryAll.isPending}
                onClick={() => setConfirmOpen(false)}
                className="inline-flex items-center h-9 px-3 rounded-md text-sm border border-border hover:bg-bg-subtle/60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={retryAll.isPending}
                onClick={() => retryAll.mutate()}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {retryAll.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Xác nhận retry
              </button>
            </div>
          </div>
        </div>
      )}

      {refetchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-bg border border-border p-6 shadow-elev">
            <h3 className="font-sans font-semibold text-lg">Re-crawl tất cả chapter?</h3>
            <p className="mt-2 text-sm text-fg-muted">
              Toàn bộ chapter status=crawled sẽ được fetch lại từ source để áp dụng parser mới
              (paragraph spacing). Rate limit 0.5 rps, nội dung cũ sẽ được ghi đè. Ước tính ~6 giờ
              background cho ~10k chapter. Các operation crawl khác có thể chậm trong thời gian này.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={refetchAll.isPending}
                onClick={() => setRefetchOpen(false)}
                className="inline-flex items-center h-9 px-3 rounded-md text-sm border border-border hover:bg-bg-subtle/60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={refetchAll.isPending}
                onClick={() => refetchAll.mutate()}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {refetchAll.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Xác nhận re-crawl
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        {STAT_ORDER.map((state) => {
          const meta = STAT_META[state] ?? { label: state, icon: Clock, tone: 'neutral' as const };
          const count = stats[state] ?? 0;
          const Icon = meta.icon;
          const valueClass =
            meta.tone === 'warning' && count > 0 ? 'text-[var(--accent)]' : 'text-fg';
          // For the "Đang lỗi" card, append the sampled denominator so the
          // reader knows this is an approximation (e.g. "13 / 50 mẫu").
          // When the BE skips sampling on huge queues (erroringSampled=0),
          // show "—" so it's obvious the figure is unavailable rather than
          // a true zero.
          const erroringSkipped =
            state === 'erroring' && (stats.waiting ?? 0) > 0 && (stats.erroringSampled ?? 0) === 0;
          const sampleHint =
            state === 'erroring' && (stats.erroringSampled ?? 0) > 0
              ? `/${(stats.erroringSampled ?? 0).toLocaleString('vi-VN')} mẫu`
              : null;
          return (
            <div key={state} className="rounded-xl border border-border bg-bg p-4">
              <div className="flex items-center gap-1.5 text-fg-muted">
                <Icon className="h-3.5 w-3.5" />
                <p className="text-[10px] uppercase tracking-[0.18em] font-medium">{meta.label}</p>
              </div>
              <div className={`mt-2 font-sans font-bold text-2xl tabular-nums ${valueClass}`}>
                {erroringSkipped ? (
                  <span title="Bỏ qua sampling vì hàng đợi quá lớn (>100k)">—</span>
                ) : (
                  count.toLocaleString('vi-VN')
                )}
                {sampleHint && (
                  <span className="ml-1 text-[10px] font-normal text-fg-muted tracking-normal">
                    {sampleHint}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-bg overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-sans font-semibold text-base">Job gần đây</h2>
          <span className="text-xs text-fg-muted tabular-nums">{jobs.length}</span>
        </div>
        {jobsQ.isLoading ? (
          <p className="text-sm text-fg-muted p-8 text-center">Đang tải...</p>
        ) : jobs.length === 0 ? (
          <EmptyState
            illustration={<EmptyQueue />}
            title="Hàng đợi đang trống"
            description="Crawl một truyện để thấy job xuất hiện ở đây."
            cta={{ label: 'Đi đến Truyện', to: '/admin/stories' }}
          />
        ) : (
          <JobsTable jobs={jobs} />
        )}
      </div>
    </div>
  );
}
