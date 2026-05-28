import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { importStory } from '@smanga/crawler';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_IMPORT_STORY,
  QUEUE_CRAWLER,
  type ImportStoryJobData,
} from '@/modules/queue/queue.constants';

@Processor(QUEUE_CRAWLER)
export class ImportStoryProcessor {
  private readonly logger = new Logger(ImportStoryProcessor.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Process(JOB_IMPORT_STORY)
  async handle(job: Job<ImportStoryJobData>): Promise<void> {
    this.logger.log(`import-story start ${job.id} url=${job.data.url}`);
    const result = await importStory(this.db, job.data.url);
    this.logger.log(`import-story done ${job.id} storyId=${result.storyId} chapters=${result.totalChapters}`);
  }
}
