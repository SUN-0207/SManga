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

@Processor(QUEUE_CRAWLER)
export class FetchChapterProcessor {
  private readonly logger = new Logger(FetchChapterProcessor.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Process(JOB_FETCH_CHAPTER)
  async handle(job: Job<FetchChapterJobData>): Promise<void> {
    this.logger.log(`fetch-chapter start ${job.id} chapterId=${job.data.chapterId}`);
    await fetchChapterById(this.db, job.data.chapterId);
    this.logger.log(`fetch-chapter done ${job.id}`);
  }
}
