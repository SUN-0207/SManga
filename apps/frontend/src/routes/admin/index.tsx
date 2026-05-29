import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Database, FileText, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { sourcesApi } from '@/api/sources';
import { jobsApi } from '@/api/jobs';
import { listStories } from '@/api/stories';
import { useAuthStore } from '@/stores/auth-store';

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
});

function AdminDashboard() {
  const isLoggedIn = useAuthStore((s) => s.user !== null);
  const sourcesQ = useQuery({
    queryKey: ['sources'],
    queryFn: sourcesApi.list,
    enabled: isLoggedIn,
    retry: false,
  });
  const storiesQ = useQuery({
    queryKey: ['stories', { page: 1, limit: 1000 }],
    queryFn: () => listStories(1, 1000),
    enabled: isLoggedIn,
    retry: false,
  });
  const jobsStatsQ = useQuery({
    queryKey: ['jobs', 'stats'],
    queryFn: jobsApi.stats,
    enabled: isLoggedIn,
    refetchInterval: isLoggedIn ? 10_000 : false,
    retry: false,
  });

  const stats = jobsStatsQ.data;
  const chapterCount = storiesQ.data
    ? storiesQ.data.reduce((sum, s) => sum + (s.totalChapters ?? 0), 0)
    : null;

  return (
    <div className="space-y-10">
      <div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
          Bảng điều khiển
        </p>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">Tổng quan</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Nhanh chóng theo dõi thư viện và tình trạng hàng đợi crawl.
        </p>
      </div>

      <Section eyebrow="Thư viện" title="Nội dung">
        <StatCard
          icon={Database}
          label="Sources"
          value={sourcesQ.data?.length}
          href="/admin/sources"
        />
        <StatCard
          icon={BookOpen}
          label="Truyện"
          value={storiesQ.data?.length}
          href="/admin/stories"
        />
        <StatCard
          icon={FileText}
          label="Chapter (tổng)"
          value={chapterCount}
          href="/admin/stories"
        />
      </Section>

      <Section eyebrow="Hàng đợi" title="Crawler">
        <StatCard
          icon={CheckCircle2}
          label="Hoàn thành"
          value={stats?.completed}
          tone="positive"
          href="/admin/jobs"
        />
        <StatCard
          icon={Loader2}
          label="Đang chạy + chờ"
          value={
            stats !== undefined
              ? (stats?.waiting ?? 0) + (stats?.active ?? 0)
              : undefined
          }
          href="/admin/jobs"
        />
        <StatCard
          icon={AlertTriangle}
          label="Thất bại"
          value={stats?.failed}
          tone={stats?.failed && stats.failed > 0 ? 'warning' : 'neutral'}
          href="/admin/jobs"
        />
      </Section>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4">
        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-1">
          {eyebrow}
        </p>
        <h2 className="font-heading font-semibold text-lg tracking-tight">{title}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
    </section>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
  href,
}: {
  icon: typeof Database;
  label: string;
  value: number | null | undefined;
  tone?: 'neutral' | 'positive' | 'warning';
  href: string;
}) {
  const display = value === undefined || value === null ? '—' : value.toLocaleString('vi-VN');
  const valueTone =
    tone === 'warning' && value && value > 0
      ? 'text-[hsl(var(--color-cta))]'
      : 'text-foreground';

  return (
    <Link
      to={href}
      aria-label={`${label}: ${display}`}
      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
    >
      <div className="group h-full rounded-xl border border-border bg-background p-5 transition-all duration-200 hover:border-foreground/40 hover:shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon className="h-4 w-4" aria-hidden />
            <p className="text-xs uppercase tracking-[0.18em] font-medium">{label}</p>
          </div>
          <ArrowRight
            className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
            aria-hidden
          />
        </div>
        <div className={`mt-3 font-heading font-bold text-4xl tabular-nums tracking-tight ${valueTone}`}>
          {display}
        </div>
      </div>
    </Link>
  );
}
