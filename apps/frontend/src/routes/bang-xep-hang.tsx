// apps/frontend/src/routes/bang-xep-hang.tsx
import { createFileRoute } from '@tanstack/react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookOpen, Eye, Flame, Info, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { rankingsApi, type RankItem, type RankTab } from '@/api/rankings';
import { RankTabs } from '@/components/rankings/RankTabs';
import { RankList } from '@/components/rankings/RankList';
import { EmptyState } from '@/components/ui/EmptyState';
import { EmptySearch } from '@/components/ui/illustrations/EmptySearch';
import { Pagination } from '@/components/ui/Pagination';
import { formatCompact } from '@/components/engagement/ViewCount';

const VALID_TABS: RankTab[] = ['hot', 'views', 'rating', 'completed'];
const PAGE_SIZE = 50;

export const Route = createFileRoute('/bang-xep-hang')({
  component: BangXepHangPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: VALID_TABS.includes(search.tab as RankTab)
      ? (search.tab as RankTab)
      : 'hot',
    page:
      typeof search.page === 'number' && search.page >= 1
        ? Math.floor(search.page)
        : 1,
  }),
});

// ---------------------------------------------------------------------------
// Metric formatters — one per tab
// ---------------------------------------------------------------------------

// Use `{ icon: LucideIcon; text: string }` (matching MetricResult in RankRow) rather than
// `{ icon: typeof Flame; text: string }` — the latter causes TS errors on Eye/Star/BookOpen
// entries because those are different component types from Flame.
const metricFormatters: Record<RankTab, (item: RankItem) => { icon: LucideIcon; text: string }> = {
  hot:       (i) => ({ icon: Flame,    text: `${i.metric.toLocaleString('vi-VN')} người đọc tuần này` }),
  views:     (i) => ({ icon: Eye,      text: `${formatCompact(i.metric)} lượt xem` }),
  rating:    (i) => ({ icon: Star,     text: `${i.metric.toFixed(1)} · ${i.ratingCount} đánh giá` }),
  completed: (i) => ({ icon: BookOpen, text: `${i.metric.toLocaleString('vi-VN')} chương` }),
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function BangXepHangPage() {
  const { tab, page } = Route.useSearch();
  const navigate = Route.useNavigate();

  const isHot = tab === 'hot';
  const effectivePage = isHot ? 1 : page;

  // Query — all 4 tabs share the same cache shape; queryKey discriminates them
  const rankQ = useQuery({
    queryKey: ['rankings', tab, { page: effectivePage, limit: PAGE_SIZE }] as const,
    queryFn: () => {
      if (tab === 'hot')       return rankingsApi.hot(PAGE_SIZE);
      if (tab === 'views')     return rankingsApi.views(effectivePage, PAGE_SIZE);
      if (tab === 'rating')    return rankingsApi.rating(effectivePage, PAGE_SIZE);
      return rankingsApi.completed(effectivePage, PAGE_SIZE);
    },
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  const items = rankQ.data?.items ?? [];
  const total = rankQ.data?.total ?? 0;
  const totalPages = isHot ? 1 : Math.ceil(total / PAGE_SIZE);
  const formatter = metricFormatters[tab];

  // Clamp out-of-range ?page= values: if ?page=999 but totalPages=1, redirect to last valid page.
  // This handles the spec edge case: "FE clamps display to last valid page or shows 'Đã hết kết quả'".
  if (!rankQ.isLoading && items.length === 0 && effectivePage > 1 && total > 0 && totalPages > 0) {
    void navigate({ search: { tab, page: totalPages } });
  }

  // Tab switch → reset page to 1
  function handleTabChange(newTab: RankTab) {
    void navigate({ search: { tab: newTab, page: 1 } });
  }

  function handlePageChange(p: number) {
    void navigate({ search: { tab, page: p } });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Empty state for hot tab with 0 activity
  const hotEmptyState = (
    <EmptyState
      illustration={<EmptySearch />}
      title="Tuần này chưa có hoạt động"
      description="Hãy là người đầu tiên đọc truyện và lên bảng xếp hạng!"
      cta={{ label: 'Khám phá truyện', to: '/kham-pha', search: { q: '', page: 1, genre: undefined } }}
    />
  );

  // Footer hint for rating tab with too few qualifying stories
  const ratingFooterHint =
    tab === 'rating' && !rankQ.isLoading && total < 3 ? (
      <p className="mt-6 text-center text-body-sm text-fg-muted">
        Chỉ hiển thị truyện có ≥ 3 đánh giá
      </p>
    ) : null;

  return (
    <div className="container py-8 lg:py-12">
      {/* Page header */}
      <header className="mb-8">
        <p className="text-label text-fg-muted uppercase mb-2">DUYỆT</p>
        <div className="flex items-center gap-2">
          <h1 className="text-display-sm lg:text-display-md font-prose font-semibold">
            Bảng xếp hạng
          </h1>
          <span
            title="Dữ liệu được cập nhật mỗi 5 phút (staleTime React Query)"
            className="text-fg-subtle cursor-help"
          >
            <Info className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </header>

      {/* Tab nav */}
      <RankTabs activeTab={tab} onTabChange={handleTabChange} />

      {/* List */}
      <div className="mt-4">
        <RankList
          items={items}
          metricFormatter={formatter}
          isLoading={rankQ.isLoading}
          emptyState={tab === 'hot' ? hotEmptyState : undefined}
          skeletonCount={10}
        />
        {ratingFooterHint}
      </div>

      {/* Pagination — hot tab never paginates */}
      {!isHot && (
        <Pagination
          page={effectivePage}
          totalPages={totalPages}
          isLoading={rankQ.isFetching}
          onChange={handlePageChange}
        />
      )}
    </div>
  );
}
