import { type Cultivation, cultivationApi } from '@/api/cultivation';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery } from '@tanstack/react-query';
import { Gem, Sparkles, Zap } from 'lucide-react';

const DAY_LABELS = ['1', '2', '3', '4', '5', '6', '7'];

function realmLabel(c: Cultivation): string {
  // Phàm Nhân (realm -1) has no tầng subdivision
  if (c.realm === -1) return c.realmName;
  return `${c.realmName} · Tầng ${c.tang}`;
}

export function CultivationCard() {
  const user = useAuthStore((s) => s.user);
  const q = useQuery({
    queryKey: ['me', 'cultivation'],
    queryFn: () => cultivationApi.get(),
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  });

  // Render nothing when gamification is off (404/403/error) or not logged in
  if (!user || q.isError || !q.data) return null;
  if (q.isLoading) return <CultivationSkeleton />;

  const c = q.data;
  const progressPct = c.isMax
    ? 100
    : Math.round((c.xpIntoTang / Math.max(1, c.xpForNextTang)) * 100);
  // Highlighted day: ((streakDay - 1) % 7) + 1, 1-indexed within the 7-day cycle
  const highlightedDay = ((c.checkinStreak - 1) % 7) + 1;

  return (
    <section
      className="relative overflow-hidden rounded-lg border border-accent/15 p-6 mb-6"
      style={{
        background: 'linear-gradient(135deg, rgba(236,72,153,0.08), rgba(244,114,182,0.02))',
      }}
    >
      {/* Decorative glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-accent/25 blur-3xl"
      />

      <div className="relative">
        {/* Header: realm + ordinal label */}
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <p className="text-label text-fg-muted uppercase mb-1">TU LUYỆN</p>
            <h2 className="text-heading-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" aria-hidden />
              <span className="bg-accent-gradient bg-clip-text text-transparent font-bold">
                {realmLabel(c)}
              </span>
            </h2>
          </div>
          {c.isMax && (
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-accent/10 border border-accent/20 text-body-sm font-semibold text-accent">
              Viên mãn
            </span>
          )}
        </div>

        {/* Tu vi progress bar */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] uppercase tracking-wider text-fg-muted font-medium">
              Tu vi
            </span>
            <span className="text-[11px] text-fg-muted">
              {c.isMax
                ? 'Viên mãn'
                : `${c.xpIntoTang.toLocaleString('vi-VN')} / ${c.xpForNextTang.toLocaleString('vi-VN')} XP`}
            </span>
          </div>
          <div className="h-2 rounded-full bg-bg-subtle overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-gradient transition-all duration-500"
              style={{ width: `${progressPct}%` }}
              role="progressbar"
              tabIndex={-1}
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Tu vi tiến triển"
            />
          </div>
        </div>

        {/* Balances */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <div className="bg-bg-subtle rounded-md p-3 flex items-center gap-2.5">
            <Zap className="h-4 w-4 text-accent flex-shrink-0" aria-hidden />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-fg-muted font-medium">
                Linh thạch
              </p>
              <p className="mt-0.5 text-[18px] font-bold leading-none text-fg">
                {c.linhThach.toLocaleString('vi-VN')}
              </p>
            </div>
          </div>
          <div className="bg-bg-subtle rounded-md p-3 flex items-center gap-2.5">
            <Gem className="h-4 w-4 text-accent flex-shrink-0" aria-hidden />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-fg-muted font-medium">
                Tiên ngọc
              </p>
              <p className="mt-0.5 text-[18px] font-bold leading-none text-fg">
                {c.tienNgoc.toLocaleString('vi-VN')}
              </p>
            </div>
          </div>
        </div>

        {/* 7-day check-in streak */}
        <div>
          <p className="text-[11px] uppercase tracking-wider text-fg-muted font-medium mb-2">
            Điểm danh 7 ngày
          </p>
          <div className="flex gap-1.5">
            {DAY_LABELS.map((label, i) => {
              const dayNum = i + 1;
              const isActive = dayNum <= highlightedDay;
              const isCurrent = dayNum === highlightedDay;
              return (
                <div key={label} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full h-7 rounded-md flex items-center justify-center transition-all duration-fast ${
                      isCurrent
                        ? 'bg-accent-gradient shadow-glow-pink-soft'
                        : isActive
                          ? 'bg-accent/30'
                          : 'bg-bg-subtle'
                    }`}
                  >
                    <span
                      className={`text-[11px] font-semibold ${
                        isCurrent ? 'text-white' : isActive ? 'text-accent' : 'text-fg-subtle'
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] ${isCurrent ? 'text-accent font-semibold' : 'text-fg-muted'}`}
                  >
                    Ngày
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function CultivationSkeleton() {
  return (
    <section className="rounded-lg border border-border bg-bg-elevated p-6 mb-6">
      <div className="h-3 w-16 bg-bg-subtle rounded mb-2 animate-pulse" />
      <div className="h-6 w-48 bg-bg-subtle rounded mb-4 animate-pulse" />
      <div className="h-2 w-full bg-bg-subtle rounded-full mb-5 animate-pulse" />
      <div className="grid grid-cols-2 gap-2.5 mb-5">
        <div className="h-16 bg-bg-subtle rounded-md animate-pulse" />
        <div className="h-16 bg-bg-subtle rounded-md animate-pulse" />
      </div>
      <div className="h-12 bg-bg-subtle rounded-md animate-pulse" />
    </section>
  );
}
