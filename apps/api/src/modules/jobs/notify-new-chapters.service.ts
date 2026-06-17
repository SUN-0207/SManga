import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_NOTIFY_NEW_CHAPTERS,
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

const NOTIFY_REPEATABLE_KEY = 'notify-new-chapters-cron';
const NOTIFY_CRON = '*/10 * * * *'; // every 10 minutes
const NOTIFY_BATCH_CAP = 2000; // backstop on candidate stories per tick

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

interface Candidate {
  id: string;
  watermark: string | null;
  max_idx: string;
  new_count: number;
}

@Processor(QUEUE_CRAWLER)
export class NotifyNewChaptersService implements OnModuleInit {
  private readonly logger = new Logger(NotifyNewChaptersService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  /** Install the repeatable once at boot. The kill switch is checked inside
   *  handle(), so toggling off never touches the registry — the tick no-ops. */
  async onModuleInit(): Promise<void> {
    try {
      const repeatables = await this.queue.getRepeatableJobs();
      for (const r of repeatables) {
        if (r.id === NOTIFY_REPEATABLE_KEY) {
          await this.queue.removeRepeatableByKey(r.key);
        }
      }
    } catch (err) {
      this.logger.warn(`notify repeatable cleanup failed: ${(err as Error).message}`);
    }
    // Retry while Redis is still LOADING after a co-restart (see redis-ready.ts) —
    // an unhandled throw here would crash-loop the API at boot.
    await withRedisReadyRetry(
      () =>
        this.queue.add(
          JOB_NOTIFY_NEW_CHAPTERS,
          {},
          {
            repeat: { cron: NOTIFY_CRON, tz: 'Asia/Ho_Chi_Minh' },
            jobId: NOTIFY_REPEATABLE_KEY,
            priority: JOB_PRIORITY.NOTIFY_NEW_CHAPTERS,
            removeOnComplete: true,
            removeOnFail: 50,
          },
        ),
      { logger: this.logger, label: 'notify-new-chapters repeatable install' },
    );
    this.logger.log(`notify-new-chapters repeatable installed cron="${NOTIFY_CRON}"`);
  }

  @Process(JOB_NOTIFY_NEW_CHAPTERS)
  async handle(_job: Job): Promise<{ notified: number; baselined: number; skipped: boolean }> {
    const [config] = await this.db
      .select({ enabled: appSetting.newChapterNotifyEnabled })
      .from(appSetting)
      .where(eq(appSetting.id, 1))
      .limit(1);
    if (!config?.enabled) {
      this.logger.log('notify-new-chapters skipped — disabled');
      return { notified: 0, baselined: 0, skipped: true };
    }

    // Stories whose latest CRAWLED chapter index exceeds the watermark.
    const candidates = rowsOf<Candidate>(
      await this.db.execute(sql`
        SELECT s.id::text AS id,
               s.last_notified_chapter_index::text AS watermark,
               mx.max_idx::text AS max_idx,
               mx.new_count
        FROM story s
        JOIN LATERAL (
          SELECT max(c.index) AS max_idx,
                 count(*) FILTER (
                   WHERE c.index > coalesce(s.last_notified_chapter_index, -1)
                 )::int AS new_count
          FROM chapter c
          WHERE c.story_id = s.id AND c.status = 'crawled'
        ) mx ON true
        WHERE mx.max_idx IS NOT NULL
          AND mx.max_idx > coalesce(s.last_notified_chapter_index, -1)
        LIMIT ${NOTIFY_BATCH_CAP}
      `),
    );

    let notified = 0;
    let baselined = 0;
    for (const c of candidates) {
      if (c.watermark === null) {
        // Baseline: record the high-water mark without notifying.
        await this.db.execute(sql`
          UPDATE story SET last_notified_chapter_index = ${c.max_idx}::numeric
          WHERE id = ${c.id}::uuid
        `);
        baselined += 1;
        continue;
      }
      // Real advance: coalesced fan-out + watermark advance, atomically.
      let insertedCount = 0;
      await this.db.transaction(async (tx) => {
        const inserted = rowsOf<{ user_id: string }>(
          await tx.execute(sql`
            INSERT INTO notification (user_id, type, story_id, chapter_index, new_count)
            SELECT b.user_id, 'new_chapter', ${c.id}::uuid, ${c.max_idx}::numeric, ${c.new_count}
            FROM bookmark b
            WHERE b.story_id = ${c.id}::uuid
            ON CONFLICT (user_id, story_id) WHERE type = 'new_chapter' AND read_at IS NULL
            DO UPDATE SET chapter_index = EXCLUDED.chapter_index,
                          new_count     = notification.new_count + EXCLUDED.new_count,
                          created_at    = now()
            RETURNING user_id
          `),
        );
        await tx.execute(sql`
          UPDATE story SET last_notified_chapter_index = ${c.max_idx}::numeric
          WHERE id = ${c.id}::uuid
        `);
        insertedCount = inserted.length;
      });
      notified += insertedCount;
    }

    if (candidates.length === NOTIFY_BATCH_CAP) {
      this.logger.warn(`notify-new-chapters hit batch cap (${NOTIFY_BATCH_CAP}); more next tick`);
    }
    this.logger.log(
      `notify-new-chapters: ${candidates.length} stories, ${baselined} baselined, ${notified} notifications`,
    );
    return { notified, baselined, skipped: false };
  }
}
