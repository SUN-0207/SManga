import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, Database, FileCheck2, FileText, HardDrive, Loader2 } from 'lucide-react';
import { sourcesApi } from '@/api/sources';
import { jobsApi } from '@/api/jobs';
import { getStorageStats, listStories } from '@/api/stories';
import { useAuthStore } from '@/stores/auth-store';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

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
  const storageQ = useQuery({
    queryKey: ['stories', 'storage-stats'],
    queryFn: getStorageStats,
    enabled: isLoggedIn,
    refetchInterval: isLoggedIn ? 30_000 : false,
    retry: false,
  });

  const stats = jobsStatsQ.data;
  const chapterCount = storiesQ.data
    ? storiesQ.data.reduce((sum, s) => sum + (s.totalChapters ?? 0), 0)
    : null;

  return (
    <div className="space-y-10">
      <header className="mb-8 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-fg-muted">
          TỔNG QUAN
        </p>
        <h1 className="font-sans text-display-md text-fg">Bảng điều khiển</h1>
        <p className="text-body-sm text-fg-muted">Số liệu nhanh về thư viện và hàng đợi crawler.</p>
      </header>

      <Section eyebrow="THƯ VIỆN" title="Nội dung">
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
        <StatCard
          icon={HardDrive}
          label="Dung lượng"
          textValue={storageQ.data ? formatBytes(storageQ.data.totalBytes) : undefined}
          subValue={
            storageQ.data
              ? `Nội dung ${formatBytes(storageQ.data.contentBytes)} · Bìa ${formatBytes(storageQ.data.coverBytes)}`
              : undefined
          }
          href="/admin/stories"
        />
      </Section>

      <Section eyebrow="HÀNG ĐỢI" title="Crawler">
        <StatCard
          icon={FileCheck2}
          label="Chapter đã crawl"
          value={storageQ.data?.chaptersWithContent}
          subValue="Đếm thẳng từ DB · không bị Bull queue trim"
          tone="positive"
          href="/admin/stories"
        />
        <StatCard
          icon={CheckCircle2}
          label="Job hoàn thành"
          value={stats?.completed}
          subValue="20k gần nhất trong queue"
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
          tone={stats?.failed && stats.failed > 0 ? 'warning' : 'default'}
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
    <section className="space-y-4">
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-fg-muted">
          {eyebrow}
        </p>
        <h2 className="font-sans text-heading-md text-fg">{title}</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

type StatTone = 'default' | 'positive' | 'warning' | 'accent';

type StatCardProps = {
  href: string;
  icon: typeof BookOpen; // any lucide-react icon
  label: string;
  value?: number | null;  // numeric value (used when textValue is absent); null treated as missing
  textValue?: string;     // pre-formatted string (e.g., "12.4 MB"); takes precedence
  subValue?: string;
  tone?: StatTone;
};

function StatCard({ href, icon: Icon, label, value, textValue, subValue, tone = 'default' }: StatCardProps) {
  const displayValue =
    textValue !== undefined
      ? textValue
      : value === undefined || value === null
        ? '—'
        : value.toLocaleString('vi-VN');

  // Gradient bg-clip-text only when the value is a positive accent (Spec B line 86-88).
  const numericValue = typeof value === 'number' ? value : Number(textValue?.replace(/[^\d]/g, '') ?? 0);
  const accentValue = tone === 'positive' && numericValue > 0;

  return (
    <Link
      to={href}
      className="group flex flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-6 transition-all duration-fast hover:border-border-strong hover:shadow-elev focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-center gap-2 text-fg-muted">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-medium uppercase tracking-[0.18em]">{label}</span>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`text-display-sm tabular-nums tracking-tight ${
            accentValue
              ? 'bg-accent-gradient bg-clip-text text-transparent'
              : tone === 'warning'
                ? 'text-destructive'
                : 'text-fg'
          }`}
        >
          {displayValue}
        </span>
        <ArrowRight className="h-4 w-4 text-fg-muted transition-transform duration-fast group-hover:translate-x-0.5" />
      </div>

      {subValue ? (
        <p className="text-body-sm text-fg-muted">{subValue}</p>
      ) : null}
    </Link>
  );
}
