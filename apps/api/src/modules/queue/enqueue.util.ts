import type { Job, JobOptions, Queue } from 'bull';
import { QUEUE_WAITING_CAP } from './queue-capacity';

interface BulkJob {
  name: string;
  data: unknown;
  opts?: JobOptions;
}

/**
 * addBulk in chunks, re-reading the live `waiting` count before each chunk and
 * stopping when the cap (QUEUE_WAITING_CAP) leaves no headroom. Prevents a
 * single producer from blowing past the cap in one shot (the 2026-06-09
 * 3.7M-job Redis-meltdown class). Returns how many were enqueued vs left
 * behind so the caller can report partial progress / be re-run later.
 */
export async function enqueueChunked(
  queue: Queue,
  jobs: BulkJob[],
  chunkSize = 500,
): Promise<{ enqueued: number; remaining: number }> {
  let enqueued = 0;
  for (let i = 0; i < jobs.length; i += chunkSize) {
    // Fresh count (NOT the 2s capacity cache) so headroom is accurate as we drain.
    const waiting = await queue.getWaitingCount();
    const headroom = QUEUE_WAITING_CAP - waiting;
    if (headroom <= 0) break;
    const take = Math.min(chunkSize, headroom, jobs.length - i);
    await queue.addBulk(jobs.slice(i, i + take) as never);
    enqueued += take;
    if (take < chunkSize) break; // headroom-limited this chunk → next loop would also be 0
  }
  return { enqueued, remaining: jobs.length - enqueued };
}

const TERMINAL_STATES = new Set(['completed', 'failed']);

/**
 * Idempotent enqueue for fixed-jobId producers. Bull's addJob silently returns
 * the existing job when its jobId hash is present in ANY state — so a re-add
 * against a RETAINED completed (7d/20k) or failed (24h/5k) job no-ops, which
 * silently breaks auto-refresh re-ticks, crawl-missing rescue clicks, and
 * discover-all re-runs. This removes a terminal-state leftover before adding,
 * but leaves a still-queued (waiting/active/delayed) job untouched so we don't
 * duplicate in-flight work.
 */
export async function enqueueIdempotent(
  queue: Queue,
  name: string,
  data: unknown,
  opts: JobOptions & { jobId: string },
): Promise<Job> {
  const existing = await queue.getJob(opts.jobId);
  if (existing) {
    const state = await existing.getState().catch(() => null);
    // Only clear a CONFIRMED terminal (completed/failed) leftover. Everything
    // else is left untouched — still-queued states (waiting/active/delayed/
    // paused/stuck) AND an unknown state from a getState() error. Removing on
    // "unknown" would risk deleting a live job and duplicating in-flight work;
    // a missed re-enqueue of a genuine terminal leftover is self-healing (the
    // next auto-refresh tick / rescue click / discover-all re-run retries it).
    if (!state || !TERMINAL_STATES.has(state)) return existing;
    await existing.remove().catch(() => {}); // terminal leftover — clear so the re-add takes
  }
  return queue.add(name, data as never, opts);
}
