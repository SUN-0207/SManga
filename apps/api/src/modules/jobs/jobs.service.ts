import { DRIZZLE } from '@/modules/db/db.provider';
import { assertQueueCapacity } from '@/modules/queue/queue-capacity';
import {
  type FetchChapterJobData,
  JOB_FETCH_CHAPTER,
  JOB_PRIORITY,
  QUEUE_CRAWLER,
} from '@/modules/queue/queue.constants';
import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@smanga/db';
import type { JobStatus, Queue } from 'bull';
import { sql } from 'drizzle-orm';

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

/** Bull v4 job state derivation without any Redis round-trips. Reads the
 * fields Bull already populated on the in-memory Job object during the
 * preceding HGETALL fetch. Reuses the same enum values getState() returns. */
function deriveState(j: {
  finishedOn?: number | null;
  processedOn?: number | null;
  failedReason?: string | null;
  opts?: { delay?: number };
  timestamp?: number;
}): 'completed' | 'failed' | 'active' | 'delayed' | 'waiting' {
  if (j.finishedOn) {
    return j.failedReason ? 'failed' : 'completed';
  }
  if (j.processedOn) {
    return 'active';
  }
  const delay = j.opts?.delay;
  if (delay && (j.timestamp ?? 0) + delay > Date.now()) {
    return 'delayed';
  }
  return 'waiting';
}

type StatsShape = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  // Bull v4's getJobCounts() TS type omits `paused` even though the runtime
  // payload includes it. Keep `paused` optional here so spreading the
  // getJobCounts result into StatsShape doesn't fail typecheck; FE handles
  // undefined as 0.
  paused?: number;
  erroring: number;
  erroringSampled: number;
};

/** Cache TTL for stats() — admin /jobs polls every 15s, this caches between
 * polls so two concurrent admin viewers (or a panel refresh + a load) collapse
 * onto one Redis fetch. 30s is short enough that a queue drained event is
 * surfaced within one cycle but long enough to shield Redis from the 200-job
 * `erroring` sample being recomputed on every keystroke or page focus. */
const STATS_CACHE_TTL_MS = 30_000;

/** Cap the `erroring` sample at 50 (was 200) — when the wait list is huge
 * (>50k), each HGETALL pays for traversal of the per-job hash; 200 in
 * parallel under Redis contention from worker pulls is what spiked the box
 * to 100% CPU on 2026-06-09. 50 jobs is still a representative sample for
 * the "is there a wave of failures right now" signal we want to expose. */
const ERRORING_SAMPLE_SIZE = 50;

/** Skip the erroring sample entirely above this wait-list size — the sample
 * ratio is meaningless against millions, and the extra Redis pressure isn't
 * worth it. The dashboard cell falls back to "—" via FE when the API returns
 * `erroringSampled = 0`. */
const ERRORING_SAMPLE_SKIP_OVER = 100_000;

@Injectable()
export class JobsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  private statsCache: { value: StatsShape; expiresAt: number } | null = null;

  async stats(fresh = false): Promise<StatsShape> {
    const now = Date.now();
    // `fresh=true` bypasses the cache — used by the admin /jobs "Làm mới"
    // button so a manual click always sees current numbers, not a stale
    // cached read. The 15s background poll still uses the cache.
    if (!fresh && this.statsCache && this.statsCache.expiresAt > now) {
      return this.statsCache.value;
    }

    const counts = await this.queue.getJobCounts(); // { waiting, active, completed, failed, delayed, paused }

    // `failed` only counts jobs that exhausted ALL retry attempts. Jobs that
    // errored once and are queued for retry sit in `waiting` with
    // `failedReason` populated — invisible in the bucket counts but visible
    // as red text in the row list. The `erroring` field surfaces this gap.
    //
    // Skip entirely on huge queues: when wait is >100k items, the sample
    // ratio doesn't tell the operator anything actionable, and the extra
    // 50 parallel HGETALL calls compound the Redis pressure already coming
    // from worker pulls against the same giant list (this is the 2026-06-09
    // 100% CPU lesson). FE handles `erroringSampled = 0` by hiding the
    // sample denominator.
    let erroring = 0;
    let erroringSampled = 0;
    if (counts.waiting <= ERRORING_SAMPLE_SKIP_OVER) {
      const sample = await this.queue.getJobs(['waiting'], 0, ERRORING_SAMPLE_SIZE - 1, false);
      erroring = sample.filter((j) => j.failedReason != null).length;
      erroringSampled = sample.length;
    }

    const value: StatsShape = { ...counts, erroring, erroringSampled };
    this.statsCache = { value, expiresAt: now + STATS_CACHE_TTL_MS };
    return value;
  }

  async list(limit = 100) {
    const states: JobStatus[] = ['waiting', 'active', 'completed', 'failed', 'delayed'];
    const jobs = await this.queue.getJobs(states, 0, limit - 1, false);
    // Derive state from j.opts + j.finishedOn + j.processedOn + j.failedReason
    // INSTEAD of `await j.getState()` — getState issues up to 5 SISMEMBER /
    // ZSCORE / LPOS round-trips per job, and 100 jobs × 5 ops × 5-second
    // polling chewed Redis when the wait list grew to 3.7M (2026-06-09 incident).
    //
    // The mapping below covers Bull v4's state machine and matches what
    // `j.getState()` would return for the cases we render in /admin/jobs:
    //   finishedOn + failedReason → 'failed' (terminal) OR 'completed'
    //   processedOn + !finishedOn → 'active'
    //   opts.delay > now            → 'delayed'
    //   otherwise                   → 'waiting'
    //
    // We tolerate a small classification gap: a job sitting in Bull's
    // 'paused' set would show 'waiting' here. The admin UI doesn't surface
    // 'paused' as a per-row badge — only as a top-level count — so this is
    // fine. The bucket counts come from getJobCounts() which is authoritative.
    const rows = jobs.map((j) => {
      const state = deriveState(j);
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
    });
    return rows;
  }

  async retry(id: string) {
    const job = await this.queue.getJob(id);
    if (!job) return { ok: false, reason: 'job not found' };
    // INTENTIONALLY no capacity check here. retry/retryAllFailed are
    // operator-rescue paths — when the queue is wedged the operator NEEDS
    // these to clear stuck work. Blocking them with 503 when waiting > cap
    // would lock the operator out exactly when they're trying to recover.
    // Cache is bucket-count + erroring-sample based, both stale once we
    // re-enqueue a job. Drop it so the next /stats poll re-fetches.
    this.statsCache = null;
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
        // Preserve priority so the cloned job sits in the same priority
        // tier as the original — otherwise a retried fetch-chapter would
        // lose its priority=1 and fall behind no-priority queue traffic.
        priority: job.opts.priority,
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
    // No cap — same rationale as retry(): operator rescue path.
    this.statsCache = null;
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
            priority: job.opts.priority,
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
    // Refetch is the operation that previously enqueued 3.7M jobs in one
    // click (2026-06-09 incident). Cap check FIRST so we don't query the
    // DB at all when the queue is already saturated.
    await assertQueueCapacity(this.queue);
    this.statsCache = null;
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
        // Colon separator matches the rest of the codebase (chapters/stories
        // services, discover-chapters processor). Hyphen was a pre-existing
        // typo that broke idempotency cross-path — two enqueues for the same
        // chapter via different code paths would create two jobs.
        jobId: `fetch-chapter:${c.id}`,
        priority: JOB_PRIORITY.FETCH_CHAPTER,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 30_000 },
      },
    }));

    await this.queue.addBulk(jobs);
    return { enqueued: jobs.length };
  }
}
