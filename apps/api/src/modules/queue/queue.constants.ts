export const QUEUE_CRAWLER = 'crawler';

export const JOB_IMPORT_STORY = 'import-story';
export const JOB_DISCOVER_CHAPTERS = 'discover-chapters';
export const JOB_FETCH_CHAPTER = 'fetch-chapter';

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
}

export interface DiscoverChaptersJobData {
  storyId: string;
  requestedBy: string | null;
}

export interface FetchChapterJobData {
  chapterId: string;
}
