export const QUEUE_CRAWLER = 'crawler';

export const JOB_IMPORT_STORY = 'import-story';
export const JOB_FETCH_CHAPTER = 'fetch-chapter';

export interface ImportStoryJobData {
  url: string;
  requestedBy: string | null;
}

export interface FetchChapterJobData {
  chapterId: string;
}
