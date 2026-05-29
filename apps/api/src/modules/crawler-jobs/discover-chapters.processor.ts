import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { discoverChapters } from '@smanga/crawler';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_DISCOVER_CHAPTERS,
  QUEUE_CRAWLER,
  type DiscoverChaptersJobData,
} from '@/modules/queue/queue.constants';

@Processor(QUEUE_CRAWLER)
export class DiscoverChaptersProcessor {
  private readonly logger = new Logger(DiscoverChaptersProcessor.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Process(JOB_DISCOVER_CHAPTERS)
  async handle(job: Job<DiscoverChaptersJobData>): Promise<void> {
    const { storyId } = job.data;
    this.logger.log(`discover-chapters start ${job.id} storyId=${storyId}`);
    try {
      const result = await discoverChapters(this.db, storyId);
      this.logger.log(`discover-chapters done ${job.id} storyId=${storyId} total=${result.totalChapters}`);
    } catch (err) {
      // engine.discoverChapters already wrote discovery_status='failed' to DB;
      // re-throw so Bull marks the job failed too (visible in /admin/jobs).
      this.logger.error(`discover-chapters failed ${job.id}: ${(err as Error).message}`);
      throw err;
    }
  }
}
