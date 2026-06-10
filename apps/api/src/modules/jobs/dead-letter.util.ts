import {
  JOB_DISCOVER_CHAPTERS,
  JOB_FETCH_CHAPTER,
  JOB_IMPORT_STORY,
  JOB_PRIORITY,
} from '@/modules/queue/queue.constants';

/**
 * Natural dedup key for a crawler job, or null if the job type must NOT be
 * dead-lettered. Only the three retryable work units qualify; orchestrators
 * (discover-all-source, refresh-all-stories) and the reconciler itself are
 * excluded by design — see the plan's Design Refinement #3. The key doubles
 * as the re-enqueue jobId (idempotent), matching the existing colon-joined
 * jobId conventions in jobs.service.ts / the crawler processors.
 */
export function dedupKeyForJob(name: string, data: unknown): string | null {
  const d = (data ?? {}) as Record<string, unknown>;
  switch (name) {
    case JOB_FETCH_CHAPTER:
      return d.chapterId ? `${JOB_FETCH_CHAPTER}:${String(d.chapterId)}` : null;
    case JOB_DISCOVER_CHAPTERS:
      return d.storyId ? `${JOB_DISCOVER_CHAPTERS}:${String(d.storyId)}` : null;
    case JOB_IMPORT_STORY:
      return d.url ? `${JOB_IMPORT_STORY}:${String(d.url)}` : null;
    default:
      return null;
  }
}

/** Bull priority to re-enqueue a dead-lettered job with, or undefined. */
export function priorityForJob(name: string): number | undefined {
  switch (name) {
    case JOB_FETCH_CHAPTER:
      return JOB_PRIORITY.FETCH_CHAPTER;
    case JOB_DISCOVER_CHAPTERS:
      return JOB_PRIORITY.DISCOVER_CHAPTERS;
    case JOB_IMPORT_STORY:
      return JOB_PRIORITY.IMPORT_STORY;
    default:
      return undefined;
  }
}
