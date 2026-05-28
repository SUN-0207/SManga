import PgBoss from 'pg-boss';
import {
  JOB_NAMES,
  type FetchChapterPayload,
  type ImportStoryPayload,
} from '@smanga/shared';
import { env } from '@/lib/env';

let cached: PgBoss | null = null;
let startPromise: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (cached) return cached;
  if (!startPromise) {
    const boss = new PgBoss(env.DATABASE_URL);
    startPromise = boss.start().then(() => {
      cached = boss;
      return boss;
    });
  }
  return startPromise;
}

export async function enqueueImportStory(payload: ImportStoryPayload): Promise<string> {
  const boss = await getBoss();
  const jobId = await boss.send(JOB_NAMES.importStory, payload, {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  });
  if (!jobId) throw new Error('failed to enqueue import-story');
  return jobId;
}

export async function enqueueFetchChapter(payload: FetchChapterPayload): Promise<string> {
  const boss = await getBoss();
  const jobId = await boss.send(JOB_NAMES.fetchChapter, payload, {
    singletonKey: `fetch-chapter:${payload.chapterId}`,
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  });
  if (!jobId) {
    // singletonKey collision — a job is already queued/running for this chapter
    return 'duplicate';
  }
  return jobId;
}
