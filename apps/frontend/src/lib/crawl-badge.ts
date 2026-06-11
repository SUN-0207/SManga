import type { DiscoveryStatus } from '@/api/discover';

export type CrawlBadgeKind = 'stub' | 'failed' | 'untouched' | 'partial' | 'full';

export interface CrawlBadge {
  kind: CrawlBadgeKind;
  /** Count relevant to the kind: failed→failed count, partial→pending count, else 0. */
  count: number;
  crawled: number;
  /** crawled + pending + failed (actual chapter rows). */
  total: number;
}

/**
 * Decide a story's crawl badge from its on-the-fly chapter-status counts.
 * Priority (first match wins): stub → failed → untouched → partial → full.
 * See docs/superpowers/specs/2026-06-11-stories-crawl-state-visibility-design.md §5.2.
 */
export function crawlBadge(row: {
  discoveryStatus: DiscoveryStatus;
  crawledChapters: number;
  pendingChapters: number;
  failedChapters: number;
}): CrawlBadge {
  const crawled = row.crawledChapters;
  const pending = row.pendingChapters;
  const failed = row.failedChapters;
  const total = crawled + pending + failed;
  if (row.discoveryStatus !== 'complete') return { kind: 'stub', count: 0, crawled, total };
  if (failed > 0) return { kind: 'failed', count: failed, crawled, total };
  if (crawled === 0) return { kind: 'untouched', count: 0, crawled, total };
  if (pending > 0) return { kind: 'partial', count: pending, crawled, total };
  return { kind: 'full', count: 0, crawled, total };
}
