import { DRIZZLE } from '@/modules/db/db.provider';
import { enqueueChunked } from '@/modules/queue/enqueue.util';
import {
  type FetchChapterJobData,
  JOB_AUTOCRAWL_FEED,
  JOB_FETCH_CHAPTER,
  JOB_PRIORITY,
  QUEUE_CRAWLER,
} from '@/modules/queue/queue.constants';
import { withRedisReadyRetry } from '@/modules/queue/redis-ready';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Inject, Logger, type OnModuleInit } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { appSetting } from '@smanga/db/schema';
import type { Job, Queue } from 'bull';
import { eq, sql } from 'drizzle-orm';

const FEEDER_REPEATABLE_KEY = 'autocrawl-feeder-cron';
const FEEDER_CRON = '*/1 * * * *'; // every minute

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

/**
 * Background backlog drainer. Each tick keeps the queue topped (up to the
 * watermark) with the next newest-first `pending` chapters at the LOWEST
 * priority, so the existing 1-rps worker drains them without ever flooding the
 * queue or preempting manual/discover work. Idles when the backlog is empty.
 */
@Processor(QUEUE_CRAWLER)
export class AutoCrawlFeederProcessor implements OnModuleInit {
  private readonly logger = new Logger(AutoCrawlFeederProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const repeatables = await this.queue.getRepeatableJobs();
      for (const r of repeatables) {
        if (r.id === FEEDER_REPEATABLE_KEY) await this.queue.removeRepeatableByKey(r.key);
      }
    } catch (err) {
      this.logger.warn(`auto-crawl feeder cleanup failed: ${(err as Error).message}`);
    }
    // Retry through Redis LOADING on a co-restart (see redis-ready.ts) so a
    // boot-time install can't crash the API. The kill switch is checked inside
    // handle(), so the repeatable stays installed and just no-ops when disabled.
    await withRedisReadyRetry(
      () =>
        this.queue.add(
          JOB_AUTOCRAWL_FEED,
          {},
          {
            repeat: { cron: FEEDER_CRON, tz: 'Asia/Ho_Chi_Minh' },
            jobId: FEEDER_REPEATABLE_KEY,
            // The tick itself is a cheap DB+enqueue — run it promptly (high
            // priority) so the queue is refilled before it drains below the
            // watermark. The fetch-chapter jobs it ENQUEUES are low priority.
            priority: JOB_PRIORITY.RETRY_RECONCILER,
            removeOnComplete: true,
            removeOnFail: 50,
          },
        ),
      { logger: this.logger, label: 'auto-crawl feeder install' },
    );
    this.logger.log(`auto-crawl feeder installed cron="${FEEDER_CRON}"`);
  }

  @Process(JOB_AUTOCRAWL_FEED)
  async handle(_job?: Job): Promise<{ enqueued: number; reason: string | null }> {
    const [config] = await this.db
      .select({
        autoCrawlEnabled: appSetting.autoCrawlEnabled,
        autoCrawlWatermark: appSetting.autoCrawlWatermark,
      })
      .from(appSetting)
      .where(eq(appSetting.id, 1))
      .limit(1);
    if (!config?.autoCrawlEnabled) return { enqueued: 0, reason: 'disabled' };

    const waiting = await this.queue.getWaitingCount();
    if (waiting >= config.autoCrawlWatermark) return { enqueued: 0, reason: 'watermark' };
    const headroom = config.autoCrawlWatermark - waiting;

    // Newest-story-first pending chapters. Index-ordered (story_updated_at_idx
    // DESC + partial chapter_needs_crawl_idx) with LIMIT so it stops early — no
    // Seq Scan over the ~1.7M pending rows. EXPLAIN-verified (Task 7).
    const r = await this.db.execute<{ id: string }>(sql`
      SELECT ch.id
      FROM chapter ch
      JOIN story s ON s.id = ch.story_id
      WHERE s.discovery_status = 'complete' AND ch.status = 'pending'
      ORDER BY s.updated_at DESC, ch.index ASC
      LIMIT ${headroom}
    `);
    const rows = rowsOf<{ id: string }>(r);
    if (rows.length === 0) return { enqueued: 0, reason: 'idle' };

    const jobs = rows.map((c) => ({
      name: JOB_FETCH_CHAPTER,
      data: { chapterId: c.id } satisfies FetchChapterJobData,
      opts: {
        jobId: `fetch-chapter:${c.id}`,
        priority: JOB_PRIORITY.AUTOCRAWL_FETCH,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 30_000 },
      },
    }));
    const { enqueued } = await enqueueChunked(this.queue, jobs);
    this.logger.log(
      `auto-crawl feed: enqueued=${enqueued} waiting=${waiting} headroom=${headroom}`,
    );
    return { enqueued, reason: null };
  }
}
