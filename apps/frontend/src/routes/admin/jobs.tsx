import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  PauseCircle,
  RefreshCw,
  Timer,
} from 'lucide-react';
import { jobsApi } from '@/api/jobs';
import { JobsTable } from '@/components/admin/JobsTable';
import { useAuthStore } from '@/stores/auth-store';

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
  delayed: { label: 'Delay', icon: Timer, tone: 'neutral' },
  paused: { label: 'Dừng', icon: PauseCircle, tone: 'neutral' },
};

const STAT_ORDER = ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'];

function AdminJobsPage() {
  // Only poll while we have an admin session — prevents stray 403s during logout unmount
  const isLoggedIn = useAuthStore((s) => s.user !== null);

  const statsQ = useQuery({
    queryKey: ['jobs', 'stats'],
    queryFn: jobsApi.stats,
    enabled: isLoggedIn,
    refetchInterval: isLoggedIn ? 5000 : false,
    retry: false,
  });

  const jobsQ = useQuery({
    queryKey: ['jobs', 'list'],
    queryFn: jobsApi.list,
    enabled: isLoggedIn,
    refetchInterval: isLoggedIn ? 5000 : false,
    retry: false,
  });

  const stats = (statsQ.data ?? {}) as Record<string, number>;
  const jobs = jobsQ.data ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
            Hàng đợi
          </p>
          <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">Jobs</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Theo dõi và retry job crawl. Tự động cập nhật mỗi 5 giây.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void statsQ.refetch();
            void jobsQ.refetch();
          }}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm border border-border hover:border-foreground/40 hover:bg-muted/60 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RefreshCw className="h-4 w-4" />
          Làm mới
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAT_ORDER.map((state) => {
          const meta = STAT_META[state];
          const count = stats[state] ?? 0;
          const Icon = meta.icon;
          const valueClass =
            meta.tone === 'warning' && count > 0
              ? 'text-[hsl(var(--color-cta))]'
              : 'text-foreground';
          return (
            <div
              key={state}
              className="rounded-xl border border-border bg-background p-4"
            >
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                <p className="text-[10px] uppercase tracking-[0.18em] font-medium">
                  {meta.label}
                </p>
              </div>
              <div className={`mt-2 font-heading font-bold text-2xl tabular-nums ${valueClass}`}>
                {count.toLocaleString('vi-VN')}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-heading font-semibold text-base">Job gần đây</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{jobs.length}</span>
        </div>
        {jobsQ.isLoading ? (
          <p className="text-sm text-muted-foreground p-8 text-center">Đang tải...</p>
        ) : (
          <JobsTable jobs={jobs} />
        )}
      </div>
    </div>
  );
}
