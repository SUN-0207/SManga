import { ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bull';

/**
 * Cap on the size of the `crawler:wait` Bull list. Above this, new enqueue
 * requests are refused (user-initiated: 503; chain/cron: silent skip).
 *
 * 10,000 is chosen as a safety margin: at the observed 0.5 rps × 5 workers
 * drain rate, 10k jobs takes ~33 minutes to clear — long enough that a
 * "queue saturated" signal is meaningful, short enough that the operator
 * isn't waiting forever. Without this cap, a single admin click on
 * "Re-crawl tất cả chapter" could enqueue ~3.8M jobs (the 2026-06-09
 * incident), at which point Bull v4's priority addJob becomes O(N) on
 * LINSERT and Redis CPU saturates.
 */
export const QUEUE_WAITING_CAP = 10_000;

/**
 * Tiny in-memory cache so concurrent enqueue requests in the same 2s
 * window don't each pay for a Redis round-trip. The cap check itself
 * shouldn't add measurable pressure to the system it's protecting.
 */
let cachedWaiting: { value: number; expiresAt: number } | null = null;
const WAITING_CACHE_MS = 2_000;

async function getWaitingCount(queue: Queue): Promise<number> {
  const now = Date.now();
  if (cachedWaiting && cachedWaiting.expiresAt > now) {
    return cachedWaiting.value;
  }
  const value = await queue.getWaitingCount();
  cachedWaiting = { value, expiresAt: now + WAITING_CACHE_MS };
  return value;
}

/**
 * For user-initiated producers (controllers in response to admin clicks).
 * Throws a 503 with a Vietnamese message that the admin UI surfaces
 * directly to the operator. Caller never enqueues if this throws.
 */
export async function assertQueueCapacity(queue: Queue): Promise<void> {
  const waiting = await getWaitingCount(queue);
  if (waiting >= QUEUE_WAITING_CAP) {
    throw new ServiceUnavailableException({
      statusCode: 503,
      message: `Hàng đợi đang quá tải (${waiting.toLocaleString('vi-VN')} job chờ, ngưỡng ${QUEUE_WAITING_CAP.toLocaleString('vi-VN')}). Đợi worker drain bớt rồi thử lại.`,
      error: 'QueueAtCapacity',
      waiting,
      cap: QUEUE_WAITING_CAP,
    });
  }
}

/**
 * For chain producers (one processor enqueuing follow-up jobs) and cron.
 * Returns true if the caller should SKIP enqueueing (queue is full). The
 * caller logs the skip — this helper doesn't, so callers can include their
 * own context (storyId, source, etc.) in the log line.
 *
 * Deliberate degradation: if a chain skips (e.g., discover-chapters
 * cannot enqueue fetch-chapter), the affected chapters stay in 'pending'
 * status in the DB. Operator can re-fire crawl-missing later from
 * /admin/stories once the wait list drains.
 */
export async function isQueueAtCapacity(queue: Queue): Promise<boolean> {
  return (await getWaitingCount(queue)) >= QUEUE_WAITING_CAP;
}

/** For tests. Resets the in-memory cache. */
export function _resetCapacityCache(): void {
  cachedWaiting = null;
}
