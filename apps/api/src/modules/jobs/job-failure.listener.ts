import { DRIZZLE } from '@/modules/db/db.provider';
import { QUEUE_CRAWLER } from '@/modules/queue/queue.constants';
import { OnQueueCompleted, OnQueueFailed, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { jobFailure } from '@smanga/db/schema';
import { MAX_RETRY_GENERATIONS, backoffForGeneration, classifyCrawlerError } from '@smanga/shared';
import type { Job } from 'bull';
import { and, eq, inArray } from 'drizzle-orm';
import { dedupKeyForJob } from './dead-letter.util';

/**
 * Listener-only processor for the crawler queue. Runs in the single API
 * process (producer + workers), so `@OnQueueFailed` receives the real Error
 * instance and `classifyCrawlerError`'s `instanceof` checks are reliable.
 */
@Processor(QUEUE_CRAWLER)
export class JobFailureListener {
  private readonly logger = new Logger(JobFailureListener.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @OnQueueFailed()
  async onFailed(job: Job, err: Error): Promise<void> {
    // Bull emits 'failed' on EVERY attempt. Only dead-letter once Bull's
    // in-process retries are exhausted (terminal failure).
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;

    const dedupKey = dedupKeyForJob(job.name, job.data);
    if (!dedupKey) return;

    const classification = classifyCrawlerError(err);
    const reason = err?.message ?? String(err);
    const errorClass = err?.name ?? 'Error';
    const now = new Date();

    // Read the current generation to decide the next state. retryGeneration
    // is only ever advanced by the reconciler, never here.
    const [existing] = await this.db
      .select({ retryGeneration: jobFailure.retryGeneration })
      .from(jobFailure)
      .where(eq(jobFailure.dedupKey, dedupKey))
      .limit(1);
    const gen = existing?.retryGeneration ?? 0;

    let status: 'pending' | 'needs_attention' | 'dead';
    let nextRetryAt: Date | null;
    if (classification === 'permanent') {
      status = 'needs_attention';
      nextRetryAt = null;
    } else if (gen >= MAX_RETRY_GENERATIONS) {
      status = 'dead';
      nextRetryAt = null;
    } else {
      status = 'pending';
      nextRetryAt = new Date(now.getTime() + backoffForGeneration(gen + 1) * 60_000);
    }

    await this.db
      .insert(jobFailure)
      .values({
        dedupKey,
        jobName: job.name,
        jobData: job.data,
        errorClass,
        classification,
        failedReason: reason,
        attemptsMade: job.attemptsMade,
        retryGeneration: 0,
        status,
        firstFailedAt: now,
        lastFailedAt: now,
        nextRetryAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: jobFailure.dedupKey,
        set: {
          jobName: job.name,
          jobData: job.data,
          errorClass,
          classification,
          failedReason: reason,
          attemptsMade: job.attemptsMade,
          status,
          lastFailedAt: now,
          nextRetryAt,
          updatedAt: now,
        },
      });

    this.logger.warn(
      `dead-letter ${status} key=${dedupKey} class=${classification} gen=${gen} reason="${reason}"`,
    );
  }

  @OnQueueCompleted()
  async onCompleted(job: Job): Promise<void> {
    const dedupKey = dedupKeyForJob(job.name, job.data);
    if (!dedupKey) return;
    const now = new Date();
    await this.db
      .update(jobFailure)
      .set({ status: 'resolved', resolvedAt: now, nextRetryAt: null, updatedAt: now })
      .where(
        and(
          eq(jobFailure.dedupKey, dedupKey),
          inArray(jobFailure.status, ['pending', 'retrying', 'needs_attention', 'dead']),
        ),
      );
  }
}
