// apps/frontend/src/components/rankings/HomeRankingsSection.tsx
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookOpen, Eye, Flame, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { rankingsApi, type RankItem, type RankTab } from '@/api/rankings';
import { RankTabs } from './RankTabs';
import { RankList } from './RankList';
import { formatCompact } from '@/components/engagement/ViewCount';

const TOP_N = 10;

// Use `{ icon: LucideIcon; text: string }` (matching MetricResult in RankRow) rather than
// `{ icon: typeof Flame; text: string }` — the latter causes TS errors on Eye/Star/BookOpen
// entries because those are different component types from Flame.
const metricFormatters: Record<RankTab, (item: RankItem) => { icon: LucideIcon; text: string }> = {
  hot:       (i) => ({ icon: Flame,    text: `${i.metric.toLocaleString('vi-VN')} người đọc tuần này` }),
  views:     (i) => ({ icon: Eye,      text: `${formatCompact(i.metric)} lượt xem` }),
  rating:    (i) => ({ icon: Star,     text: `${i.metric.toFixed(1)} · ${i.ratingCount} đánh giá` }),
  completed: (i) => ({ icon: BookOpen, text: `${i.metric.toLocaleString('vi-VN')} chương` }),
};

export function HomeRankingsSection() {
  const [activeTab, setActiveTab] = useState<RankTab>('hot');

  const rankQ = useQuery({
    queryKey: ['rankings', activeTab, { page: 1, limit: TOP_N }] as const,
    queryFn: () => {
      if (activeTab === 'hot')       return rankingsApi.hot(TOP_N);
      if (activeTab === 'views')     return rankingsApi.views(1, TOP_N);
      if (activeTab === 'rating')    return rankingsApi.rating(1, TOP_N);
      return rankingsApi.completed(1, TOP_N);
    },
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  const items = rankQ.data?.items ?? [];
  const formatter = metricFormatters[activeTab];

  return (
    <section>
      {/* Section header */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-label text-fg-muted uppercase mb-2">NỔI BẬT</p>
          <h2 className="text-heading-lg">Bảng xếp hạng</h2>
        </div>
        <Link
          to="/bang-xep-hang"
          search={{ tab: activeTab, page: 1 }}
          className="text-body-sm text-fg-muted hover:text-fg transition-colors duration-fast"
        >
          Xem tất cả →
        </Link>
      </div>

      {/* Tab nav — local state, not URL */}
      <RankTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Compact top-10 grid — 5 rows × 2 cols on desktop (spec line 199).
          DO NOT wrap both halves in a single lg:col-span-2 div — that collapses the
          two-column layout. Each RankList half is a direct grid child. */}
      <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3">
        {/* Left column: ranks 1-5 */}
        <RankList
          items={items.slice(0, 5)}
          metricFormatter={formatter}
          isLoading={rankQ.isLoading}
          compact
          skeletonCount={5}
        />
        {/* Right column: ranks 6-10 (hidden on mobile — both halves stack as single list) */}
        <RankList
          items={items.slice(5, 10)}
          metricFormatter={formatter}
          isLoading={rankQ.isLoading}
          compact
          skeletonCount={5}
        />
      </div>
    </section>
  );
}
