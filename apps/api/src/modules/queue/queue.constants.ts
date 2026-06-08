export const QUEUE_CRAWLER = 'crawler';

export const JOB_IMPORT_STORY = 'import-story';
export const JOB_DISCOVER_CHAPTERS = 'discover-chapters';
export const JOB_FETCH_CHAPTER = 'fetch-chapter';
export const JOB_REFRESH_ALL_STORIES = 'refresh-all-stories';
export const JOB_DISCOVER_ALL_SOURCE = 'discover-all-source';

/**
 * Bull priority — LOWER number = HIGHER priority. Workers pick the lowest
 * priority value first when both are waiting. Without this, the queue is
 * pure FIFO and a flood of import-story jobs starves fetch-chapter for
 * hours (see 2026-06-09 incident: 48k import-story ahead of 357
 * fetch-chapter → zero chapters crawled in 24h).
 *
 * The ordering reflects what we actually want the workers to do:
 *  1) Crawl chapter content (the only job that grows the visible library)
 *  5) Discover chapter lists (a prerequisite, but a single HTTP fetch — cheap)
 * 10) Import story metadata (largely a setup step, no user-visible payoff)
 * 20) Scheduled refresh (cron, deferrable behind anything user-initiated)
 */
export const JOB_PRIORITY = {
  FETCH_CHAPTER: 1,
  DISCOVER_CHAPTERS: 5,
  IMPORT_STORY: 10,
  REFRESH_ALL_STORIES: 20,
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
