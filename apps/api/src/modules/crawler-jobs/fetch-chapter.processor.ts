import { DRIZZLE } from '@/modules/db/db.provider';
import {
  type FetchChapterJobData,
  JOB_FETCH_CHAPTER,
  QUEUE_CRAWLER,
} from '@/modules/queue/queue.constants';
import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { fetchChapterById } from '@smanga/crawler';
import type { Database } from '@smanga/db';
import type { Job } from 'bull';

/**
 * Number of fetch-chapter jobs processed in parallel. Read from the env at
 * import time because Bull fixes a processor's concurrency at registration
 * (the @Process decorator runs before NestJS config is available). Restart to
 * change it — the live throughput knob is app_setting.crawlRps, not this.
 */
export function resolveFetchConcurrency(raw: string | undefined): number {
  if (!raw || raw.trim() === '') return 6;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 6;
  return Math.min(32, Math.max(1, Math.floor(n)));
}

const FETCH_CONCURRENCY = resolveFetchConcurrency(process.env.CRAWLER_FETCH_CONCURRENCY);

@Processor(QUEUE_CRAWLER)
export class FetchChapterProcessor {
  private readonly logger = new Logger(FetchChapterProcessor.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Process({ name: JOB_FETCH_CHAPTER, concurrency: FETCH_CONCURRENCY })
  async handle(job: Job<FetchChapterJobData>): Promise<void> {
    this.logger.log(`fetch-chapter start ${job.id} chapterId=${job.data.chapterId}`);
    await fetchChapterById(this.db, job.data.chapterId);
    this.logger.log(`fetch-chapter done ${job.id}`);
  }
}
