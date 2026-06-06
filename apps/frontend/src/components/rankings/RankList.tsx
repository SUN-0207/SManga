import type { RankItem } from '@/api/rankings';
// apps/frontend/src/components/rankings/RankList.tsx
import type { ReactNode } from 'react';
import { type MetricResult, RankRow } from './RankRow';

interface RankListProps {
  items: RankItem[];
  metricFormatter: (item: RankItem) => MetricResult;
  isLoading: boolean;
  /** Node rendered when items is empty and not loading. */
  emptyState?: ReactNode;
  compact?: boolean;
  /** Number of skeleton rows to show during load. Default 10. */
  skeletonCount?: number;
}

function RankSkeleton({ compact = false }: { compact?: boolean }) {
  const coverH = compact ? 'h-16' : 'h-20';
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/60 animate-pulse">
      {/* rank col */}
      <div className="w-9 sm:w-12 flex-shrink-0 h-6 rounded bg-bg-subtle" />
      {/* cover */}
      <div className={`w-12 sm:w-14 ${coverH} flex-shrink-0 rounded-md bg-bg-subtle`} />
      {/* text */}
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 rounded bg-bg-subtle" />
        <div className="h-3 w-1/2 rounded bg-bg-subtle" />
        <div className="h-3 w-1/3 rounded bg-bg-subtle" />
      </div>
    </div>
  );
}

export function RankList({
  items,
  metricFormatter,
  isLoading,
  emptyState,
  compact = false,
  skeletonCount = 10,
}: RankListProps) {
  if (isLoading) {
    return (
      <ol aria-label="Đang tải bảng xếp hạng" aria-busy="true">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <li key={i}>
            <RankSkeleton compact={compact} />
          </li>
        ))}
      </ol>
    );
  }

  if (items.length === 0) {
    return <>{emptyState ?? null}</>;
  }

  return (
    <ol aria-label="Bảng xếp hạng">
      {items.map((item) => (
        <li key={item.id}>
          <RankRow item={item} metricFormatter={metricFormatter} compact={compact} />
        </li>
      ))}
    </ol>
  );
}
