import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Flame } from 'lucide-react';
import { meApi } from '@/api/me';
import { useAuthStore } from '@/stores/auth-store';

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function ReadingStatsCard() {
  const user = useAuthStore((s) => s.user);
  const q = useQuery({
    queryKey: ['me', 'stats'],
    queryFn: () => meApi.stats(),
    enabled: !!user,
    staleTime: 60_000,
  });

  if (!user) return null;
  if (q.isLoading) return <StatsSkeleton />;
  if (!q.data) return null;

  const s = q.data;
  const hasProgress = s.totalChaptersRead > 0;

  if (!hasProgress) {
    return (
      <StatsContainer>
        <p className="text-label text-fg-muted uppercase mb-2">HOẠT ĐỘNG ĐỌC</p>
        <h2 className="text-heading-lg mb-3">Bắt đầu đọc để theo dõi hoạt động của bạn</h2>
        <p className="text-body-sm text-fg-muted mb-5 max-w-md">
          Streak, chương đọc, sparkline 7 ngày — tất cả sẽ xuất hiện ở đây sau chương đầu tiên.
        </p>
        <Link
          to="/"
          className="inline-flex items-center h-10 px-4 rounded-md bg-accent-gradient text-white text-body-sm font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200"
        >
          Đến trang chủ →
        </Link>
      </StatsContainer>
    );
  }

  return (
    <StatsContainer>
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <p className="text-label text-fg-muted uppercase mb-1">HOẠT ĐỘNG ĐỌC</p>
          <h2 className="text-heading-lg">
            Tuần này bạn đã đọc{' '}
            <span className="bg-accent-gradient bg-clip-text text-transparent font-bold">
              {s.weeklyChapters} chương
            </span>
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-accent/10 border border-accent/20 text-body-sm font-semibold text-fg">
          <Flame className="h-4 w-4 text-accent" aria-hidden />
          Streak {s.streakDays} ngày
        </span>
      </div>

      <div
        className={`grid grid-cols-2 ${
          s.weeklyHours > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
        } gap-2.5 mb-5`}
      >
        <MiniStat label="Tổng" value={s.totalChaptersRead} unit="chương" />
        <MiniStat label="Thư viện" value={s.libraryCount} unit="truyện" />
        <MiniStat label="Hoàn thành" value={s.completedCount} unit="truyện" />
        {s.weeklyHours > 0 && (
          <MiniStat label="Giờ đọc" value={s.weeklyHours} unit="giờ / tuần" />
        )}
      </div>

      <Sparkline data={s.dailyChaptersLast7} />
    </StatsContainer>
  );
}

function StatsContainer({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="relative overflow-hidden rounded-lg border border-accent/15 p-6"
      style={{
        background:
          'linear-gradient(135deg, rgba(236,72,153,0.08), rgba(244,114,182,0.02))',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-accent/25 blur-3xl"
      />
      <div className="relative">{children}</div>
    </section>
  );
}

function MiniStat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="bg-bg-subtle rounded-md p-3">
      <p className="text-[10px] uppercase tracking-wider text-fg-muted font-medium">{label}</p>
      <p className="mt-1 text-[22px] font-bold leading-none text-fg">{value}</p>
      <p className="mt-1 text-[11px] text-fg-muted">{unit}</p>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const ariaValues = data.join(', ');
  return (
    <div
      role="img"
      aria-label={`Số chương đọc theo ngày trong tuần: ${ariaValues}`}
      className="flex items-end justify-between gap-1.5 h-16"
    >
      {data.map((v, i) => {
        const isToday = i === data.length - 1;
        const heightPct = Math.max(8, Math.round((v / max) * 100));
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-1"
          >
            <div
              className={`w-full rounded-sm transition-all duration-fast ${
                isToday ? 'bg-accent-gradient shadow-glow-pink-soft' : 'bg-accent/30'
              }`}
              style={{ height: `${heightPct}%`, minHeight: '4px' }}
            />
            <span
              className={`text-[10px] ${
                isToday ? 'text-accent font-semibold' : 'text-fg-muted'
              }`}
            >
              {DAY_LABELS[i] ?? ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <section className="rounded-lg border border-border bg-bg-elevated p-6">
      <div className="h-3 w-20 bg-bg-subtle rounded mb-2 animate-pulse" />
      <div className="h-6 w-64 bg-bg-subtle rounded mb-5 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-bg-subtle rounded-md animate-pulse" />
        ))}
      </div>
      <div className="h-16 bg-bg-subtle rounded animate-pulse" />
    </section>
  );
}
