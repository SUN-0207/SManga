export const QUEUE_CRAWLER = 'crawler';

export const JOB_IMPORT_STORY = 'import-story';
export const JOB_DISCOVER_CHAPTERS = 'discover-chapters';
export const JOB_FETCH_CHAPTER = 'fetch-chapter';
export const JOB_REFRESH_ALL_STORIES = 'refresh-all-stories';
export const JOB_DISCOVER_ALL_SOURCE = 'discover-all-source';
export const JOB_RETRY_RECONCILER = 'retry-reconciler';
export const JOB_AUTOCRAWL_FEED = 'autocrawl-feed';
export const JOB_NOTIFY_NEW_CHAPTERS = 'notify-new-chapters';

/**
 * Bull priority — LOWER number = HIGHER priority. Workers pick the lowest
 * priority value first when both are waiting. Without this, the queue is
 * pure FIFO and a flood of import-story jobs starves fetch-chapter for
 * hours (see 2026-06-09 incident: 48k import-story ahead of 357
 * fetch-chapter → zero chapters crawled in 24h).
 *
 * The ordering reflects what we actually want the workers to do:
 *  1) Crawl chapter content (the only job that grows the visible library)
 *  5) Discover chapter lists (prerequisite, single HTTP fetch — cheap)
 *  8) Discover a whole source feed (rare admin action, fans out into N imports)
 * 10) Import story metadata (largely a setup step, no user-visible payoff)
 * 20) Scheduled refresh (cron, deferrable behind anything user-initiated)
 * 30) Background auto-crawl backlog drain — lowest priority so manual
 *     crawl-missing / "Chỉ crawl lỗi" / discover / reconciler always preempt.
 */
export const JOB_PRIORITY = {
  FETCH_CHAPTER: 1,
  RETRY_RECONCILER: 2,
  DISCOVER_CHAPTERS: 5,
  DISCOVER_ALL_SOURCE: 8,
  IMPORT_STORY: 10,
  REFRESH_ALL_STORIES: 20,
  // Notify sweep — light DB work; deferrable behind all crawl jobs but ahead of
  // the background backlog drain so it ticks promptly.
  NOTIFY_NEW_CHAPTERS: 22,
  // 30) Background auto-crawl backlog drain — lowest priority so manual
  //     crawl-missing / "Chỉ crawl lỗi" / discover / reconciler always preempt.
  AUTOCRAWL_FETCH: 30,
} as const;

export interface ImportStoryJobData {
  url: string;
  requestedBy: string | null;
  /**
   * Plan 7 bulk-import path: skip chapter discovery during the import job.
   * Story is persisted with discoveryStatus='pending' and the user kicks off
   * `discover-chapters` later from /admin/stories/$id. Default false keeps
   * the legacy `pnpm crawl` + single-URL admin import working unchanged.
   */
  skipDiscovery?: boolean;
  /**
   * Full-auto chain: after the metadata-only import finishes, the processor
   * enqueues `discover-chapters` (carrying autoCrawl forward), which in turn
   * enqueues `fetch-chapter` for every pending chapter. One click → fully
   * crawled story without operator babysitting.
   */
  autoCrawl?: boolean;
}

export interface DiscoverChaptersJobData {
  storyId: string;
  requestedBy: string | null;
  /** Forwarded from ImportStoryJobData. When true, chain `fetch-chapter` jobs. */
  autoCrawl?: boolean;
}

export interface FetchChapterJobData {
  chapterId: string;
}

export interface DiscoverAllSourceJobData {
  sourceId: string;
  feedId: string;
  autoCrawl: boolean;
  requestedBy: string | null;
}
