// apps/frontend/src/components/rankings/RankRow.tsx
import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import type { RankItem } from '@/api/rankings';

export interface MetricResult {
  icon: LucideIcon;
  text: string;
}

interface RankRowProps {
  item: RankItem;
  metricFormatter: (item: RankItem) => MetricResult;
  /** compact=true: smaller cover + single-line title. Used in HomeRankingsSection grid. */
  compact?: boolean;
}

/** Status label map — Vietnamese display strings */
const STATUS_LABEL: Record<RankItem['status'], string> = {
  ongoing: 'Đang ra',
  completed: 'Hoàn thành',
  dropped: 'Dừng',
  unknown: '—',
};

export function RankRow({ item, metricFormatter, compact = false }: RankRowProps) {
  const isTop3 = item.rank <= 3;
  const { icon: Icon, text: metricText } = metricFormatter(item);

  // Cover dimensions: desktop 56×80, mobile 48×64; compact reduces further
  const coverDesktop = compact ? 'sm:w-12 sm:h-16' : 'sm:w-14 sm:h-20';
  const coverBase = 'w-12 h-16';

  // Rank column width: 48px desktop, 36px mobile
  const rankColClass = compact
    ? 'w-9 sm:w-10 flex-shrink-0 flex items-center justify-center'
    : 'w-9 sm:w-12 flex-shrink-0 flex items-center justify-center';

  return (
    <Link
      to="/truyen/$slug"
      params={{ slug: item.slug }}
      search={{ page: 1, commentsPage: 1 }}
      className="flex items-center gap-3 py-3 border-b border-border/60 hover:bg-bg-subtle/60 transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
    >
      {/* Rank number */}
      <div className={rankColClass} aria-label={`Hạng ${item.rank}`}>
        {isTop3 ? (
          <span
            className="text-display-sm tabular-nums font-prose font-bold bg-accent-gradient bg-clip-text text-transparent dark:bg-none dark:text-accent"
            aria-hidden
          >
            {item.rank}
          </span>
        ) : (
          <span className="text-display-sm tabular-nums font-prose text-fg-subtle">
            {item.rank}
          </span>
        )}
      </div>

      {/* Cover thumbnail */}
      <div
        className={`${coverBase} ${coverDesktop} flex-shrink-0 rounded-md border border-border bg-bg-subtle overflow-hidden`}
      >
        {item.hasCover && (
          <img
            src={`/api/v1/cover/${item.id}`}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <h3
          className={`font-prose font-semibold text-fg ${compact ? 'line-clamp-1' : 'line-clamp-2'} text-body`}
        >
          {item.title}
        </h3>
        <p className="mt-0.5 text-body-sm text-fg-muted truncate">
          {item.author ?? 'Khuyết danh'} · {STATUS_LABEL[item.status]}
        </p>
        {/* Metric badge */}
        <p className="mt-1 inline-flex items-center gap-1 text-body-sm font-semibold text-fg">
          <Icon className="h-3.5 w-3.5 text-accent flex-shrink-0" aria-hidden />
          <span className="sm:hidden">{metricText}</span>
          <span className="hidden sm:inline">{metricText}</span>
        </p>
      </div>
    </Link>
  );
}
