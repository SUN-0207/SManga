import { DRIZZLE } from '@/modules/db/db.provider';
import { enqueueIdempotent } from '@/modules/queue/enqueue.util';
import { isQueueAtCapacity } from '@/modules/queue/queue-capacity';
import {
  type DiscoverChaptersJobData,
  type FetchChapterJobData,
  JOB_DISCOVER_CHAPTERS,
  JOB_FETCH_CHAPTER,
  JOB_PRIORITY,
  QUEUE_CRAWLER,
} from '@/modules/queue/queue.constants';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { discoverChapters } from '@smanga/crawler';
import type { Database } from '@smanga/db';
import { chapter } from '@smanga/db/schema';
import type { Job, Queue } from 'bull';
import { and, asc, eq, inArray } from 'drizzle-orm';

@Processor(QUEUE_CRAWLER)
export class DiscoverChaptersProcessor {
  private readonly logger = new Logger(DiscoverChaptersProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  @Process(JOB_DISCOVER_CHAPTERS)
  async handle(job: Job<DiscoverChaptersJobData>): Promise<void> {
    const { storyId, autoCrawl } = job.data;
    this.logger.log(
      `discover-chapters start ${job.id} storyId=${storyId} autoCrawl=${autoCrawl ?? false}`,
    );
    try {
      const result = await discoverChapters(this.db, storyId);
      this.logger.log(
        `discover-chapters done ${job.id} storyId=${storyId} total=${result.totalChapters}`,
      );

      if (autoCrawl) {
        // Check capacity ONCE up-front. If the wait queue is saturated, skip
        // the chain — chapters stay 'pending' in DB and an operator can
        // re-trigger via crawl-missing later (after wait drains). This is
        // the degradation mode that prevents one large discover from
        // ballooning the queue into the 100% CPU territory we hit on
        // 2026-06-09 with 3.7M jobs.
        if (await isQueueAtCapacity(this.queue)) {
          this.logger.warn(
            `discover-chapters SKIPPED chaining fetch-chapter for ${storyId}: queue at capacity. Chapter rows stay 'pending'; operator can re-trigger via /admin/stories crawl-missing once wait drains.`,
          );
        } else {
          const rows = await this.db
            .select({ id: chapter.id })
            .from(chapter)
            .where(
              and(eq(chapter.storyId, storyId), inArray(chapter.status, ['pending', 'failed'])),
            )
            .orderBy(asc(chapter.index));
          for (const r of rows) {
            const payload: FetchChapterJobData = { chapterId: r.id };
            await enqueueIdempotent(this.queue, JOB_FETCH_CHAPTER, payload, {
              jobId: `fetch-chapter:${r.id}`,
              priority: JOB_PRIORITY.FETCH_CHAPTER,
            });
          }
          this.logger.log(
            `discover-chapters chained ${rows.length} fetch-chapter jobs for ${storyId} (autoCrawl)`,
          );
        }
      }
    } catch (err) {
      // engine.discoverChapters already wrote discovery_status='failed' to DB;
      // re-throw so Bull marks the job failed too (visible in /admin/jobs).
      this.logger.error(`discover-chapters failed ${job.id}: ${(err as Error).message}`);
      throw err;
    }
  }
}
