import { DRIZZLE } from '@/modules/db/db.provider';
import { isQueueAtCapacity } from '@/modules/queue/queue-capacity';
import { JOB_PRIORITY, JOB_RETRY_RECONCILER, QUEUE_CRAWLER } from '@/modules/queue/queue.constants';
import { withRedisReadyRetry } from '@/modules/queue/redis-ready';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Inject, Logger, type OnModuleInit } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { appSetting, jobFailure } from '@smanga/db/schema';
import type { Job, Queue } from 'bull';
import { and, asc, eq, lte } from 'drizzle-orm';
import { priorityForJob } from './dead-letter.util';

const RECONCILER_REPEATABLE_KEY = 'retry-reconciler-cron';
const RECONCILER_CRON = '*/5 * * * *'; // every 5 minutes
const RECONCILER_BATCH_CAP = 200; // hard re-enqueue cap per run

@Processor(QUEUE_CRAWLER)
export class RetryReconcilerService implements OnModuleInit {
  private readonly logger = new Logger(RetryReconcilerService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  /**
   * Install the repeatable once at boot. The kill switch is checked inside
   * handle(), so toggling auto-retry off never touches the registry — the
   * tick simply no-ops.
   */
  async onModuleInit(): Promise<void> {
    try {
      const repeatables = await this.queue.getRepeatableJobs();
      for (const r of repeatables) {
        if (r.id === RECONCILER_REPEATABLE_KEY) {
          await this.queue.removeRepeatableByKey(r.key);
        }
      }
    } catch (err) {
      this.logger.warn(`reconciler repeatable cleanup failed: ${(err as Error).message}`);
    }
    // Retry while Redis is still LOADING after a co-restart — an unhandled
    // throw here propagates out of Nest bootstrap and crash-loops the whole API
    // (the 2026-06-12 incident). See redis-ready.ts.
    await withRedisReadyRetry(
      () =>
        this.queue.add(
          JOB_RETRY_RECONCILER,
          {},
          {
            repeat: { cron: RECONCILER_CRON, tz: 'Asia/Ho_Chi_Minh' },
            jobId: RECONCILER_REPEATABLE_KEY,
            priority: JOB_PRIORITY.RETRY_RECONCILER,
            removeOnComplete: true,
            removeOnFail: 50,
          },
        ),
      { logger: this.logger, label: 'retry-reconciler repeatable install' },
    );
    this.logger.log(`retry-reconciler repeatable installed cron="${RECONCILER_CRON}"`);
  }

  @Process(JOB_RETRY_RECONCILER)
  async handle(_job: Job): Promise<{ reEnqueued: number; skipped: boolean }> {
    const [config] = await this.db
      .select({ autoRetryEnabled: appSetting.autoRetryEnabled })
      .from(appSetting)
      .where(eq(appSetting.id, 1))
      .limit(1);
    if (!config?.autoRetryEnabled) {
      this.logger.log('retry-reconciler skipped — auto retry disabled');
      return { reEnqueued: 0, skipped: true };
    }

    // Never pile onto a backed-up queue (RECONCILER_SKIP_OVER_WAITING ===
    // QUEUE_WAITING_CAP === 10_000).
    if (await isQueueAtCapacity(this.queue)) {
      this.logger.warn('retry-reconciler skipped — queue at/over capacity');
      return { reEnqueued: 0, skipped: true };
    }

    const now = new Date();
    const due = await this.db
      .select()
      .from(jobFailure)
      .where(and(eq(jobFailure.status, 'pending'), lte(jobFailure.nextRetryAt, now)))
      .orderBy(asc(jobFailure.nextRetryAt))
      .limit(RECONCILER_BATCH_CAP);

    let reEnqueued = 0;
    for (const row of due) {
      try {
        const jobId = row.dedupKey;
        const priority = priorityForJob(row.jobName);
        // Drop any lingering Bull job under the same id (e.g. in completed/
        // failed) so the re-add isn't deduped into a no-op — mirrors the
        // clone-fallback in jobs.service.ts.
        const existing = await this.queue.getJob(jobId);
        if (existing) await existing.remove().catch(() => {});
        await this.queue.add(row.jobName, row.jobData as object, { jobId, priority });
        // Optimistic-lock the transition on the row's updatedAt snapshot. In
        // the single API process, a worker can finish (or re-fail) the just-
        // enqueued job and the listener can update this row BEFORE this write
        // lands. Guarding on the picked updatedAt means a concurrently-changed
        // row matches 0 rows — we leave the listener's outcome intact instead
        // of stamping a phantom 'retrying' that the picker would never revisit.
        const flipped = await this.db
          .update(jobFailure)
          .set({
            status: 'retrying',
            retryGeneration: row.retryGeneration + 1,
            nextRetryAt: null,
            updatedAt: new Date(),
          })
          .where(and(eq(jobFailure.id, row.id), eq(jobFailure.updatedAt, row.updatedAt)))
          .returning({ id: jobFailure.id });
        if (flipped.length > 0) {
          reEnqueued += 1;
        } else {
          this.logger.log(
            `reconciler: row ${row.dedupKey} changed since pick (resolved/re-failed concurrently); skipping status flip`,
          );
        }
      } catch (err) {
        this.logger.error(
          `reconciler re-enqueue failed key=${row.dedupKey}: ${(err as Error).message}`,
        );
      }
    }

    if (due.length === RECONCILER_BATCH_CAP) {
      this.logger.warn(
        `retry-reconciler hit batch cap (${RECONCILER_BATCH_CAP}); more rows remain for next tick`,
      );
    }
    this.logger.log(`retry-reconciler re-enqueued ${reEnqueued}/${due.length}`);
    return { reEnqueued, skipped: false };
  }
}
