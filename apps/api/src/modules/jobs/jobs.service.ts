import { DRIZZLE } from '@/modules/db/db.provider';
import {
  type FetchChapterJobData,
  JOB_FETCH_CHAPTER,
  QUEUE_CRAWLER,
} from '@/modules/queue/queue.constants';
import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@smanga/db';
import type { JobStatus, Queue } from 'bull';
import { sql } from 'drizzle-orm';

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

@Injectable()
export class JobsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  async stats() {
    const counts = await this.queue.getJobCounts(); // { waiting, active, completed, failed, delayed, paused }
    return counts;
  }

  async list(limit = 100) {
    const states: JobStatus[] = ['waiting', 'active', 'completed', 'failed', 'delayed'];
    const jobs = await this.queue.getJobs(states, 0, limit - 1, false);
    // Use Bull's authoritative state (one Redis call per job) so the list
    // classifications match `getJobCounts()`. Deriving from j.failedReason +
    // j.finishedOn alone misclassifies a failed-but-delayed job as 'failed'
    // even though Bull counts it in the 'delayed' bucket — the page card
    // counter and the row badge then disagree.
    const rows = await Promise.all(
      jobs.map(async (j) => {
        const state = await j.getState();
        return {
          id: String(j.id),
          name: j.name,
          state,
          attemptsMade: j.attemptsMade,
          timestamp: j.timestamp,
          processedOn: j.processedOn,
          finishedOn: j.finishedOn,
          failedReason: state === 'completed' ? null : (j.failedReason ?? null),
          data: j.data,
        };
      }),
    );
    return rows;
  }

  async retry(id: string) {
    const job = await this.queue.getJob(id);
    if (!job) return { ok: false, reason: 'job not found' };
    try {
      await job.retry();
      return { ok: true };
    } catch {
      // Bull refuses retry() on non-failed jobs (e.g., jobs that exhausted attempts
      // are sometimes moved to 'completed' with failedReason populated). Clone
      // with the same name + data so the user-visible "Retry" always re-enqueues.
      const cloned = await this.queue.add(job.name, job.data, {
        attempts: job.opts.attempts ?? 3,
        backoff: job.opts.backoff,
      });
      try {
        await job.remove();
      } catch {
        /* keep going even if cleanup fails */
      }
      return { ok: true, requeued: true, newId: String(cloned.id) };
    }
  }

  /**
   * Bulk-retry every job currently in 'failed' state. Loops Bull's failed set
   * via `getJobs(['failed'])` and calls `.retry()` on each. The token-bucket
   * rate limiter in the crawler engine still enforces 1 rps per source so
   * burst-re-enqueueing does not hammer the upstream site.
   */
  async retryAllFailed(): Promise<{ retried: number; skipped: number }> {
    const failed = await this.queue.getJobs(['failed'], 0, -1);
    let retried = 0;
    let skipped = 0;
    for (const job of failed) {
      try {
        await job.retry();
        retried += 1;
      } catch {
        // Same fall-through as single-job retry: if Bull refuses (e.g. attempts
        // exhausted + state already shifted), re-enqueue a clone so the user's
        // "retry all" intent is honored.
        try {
          await this.queue.add(job.name, job.data, {
            attempts: job.opts.attempts ?? 3,
            backoff: job.opts.backoff,
          });
          await job.remove().catch(() => {});
          retried += 1;
        } catch {
          skipped += 1;
        }
      }
    }
    return { retried, skipped };
  }

  /**
   * Enqueue a fetch-chapter job for every chapter currently in `crawled`
   * status, so the new parser logic regenerates the stored prose. Idempotent
   * via `jobId` — Bull skips duplicate-id enqueues in the waiting state. The
   * engine's per-source token bucket (0.5 rps for truyenfull) keeps the
   * source friendly during the drain.
   */
  async refetchAllChapters(): Promise<{ enqueued: number }> {
    // The chapter table does NOT have an updated_at column — use crawled_at
    // (timestamp when content was last fetched). NULLS FIRST puts never-crawled
    // edge rows ahead so any straggler gets re-attempted promptly.
    const r = await this.db.execute<{ id: string }>(sql`
      SELECT id FROM chapter
      WHERE status = 'crawled'
      ORDER BY crawled_at ASC NULLS FIRST
    `);
    const rows = rowsOf<{ id: string }>(r);
    if (rows.length === 0) return { enqueued: 0 };

    const jobs = rows.map((c) => ({
      name: JOB_FETCH_CHAPTER,
      data: { chapterId: c.id } satisfies FetchChapterJobData,
      opts: {
        jobId: `fetch-chapter-${c.id}`,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 30_000 },
      },
    }));

    await this.queue.addBulk(jobs);
    return { enqueued: jobs.length };
  }
}
