import type { Logger } from '@nestjs/common';

/**
 * True for transient "Redis isn't ready yet" errors — chiefly the
 * `LOADING Redis is loading the dataset in memory` reply Redis sends while it
 * reloads its AOF/RDB after a restart, plus connection-not-ready errors during
 * the same window. All of these clear on their own once Redis finishes loading.
 */
export function isRedisNotReady(err: unknown): boolean {
  const msg = String((err as { message?: unknown })?.message ?? err);
  // Case-sensitive on the uppercase Redis/ioredis reply+error codes so an
  // unrelated message that merely contains the word "loading" can't false-match.
  return (
    /\bLOADING\b/.test(msg) ||
    /is loading the dataset/.test(msg) ||
    /\b(ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EPIPE)\b/.test(msg) ||
    /Connection is closed/.test(msg) ||
    /Stream isn't writeable/.test(msg)
  );
}

/**
 * Run a boot-time Redis operation, retrying with backoff WHILE Redis is not
 * ready (e.g. still LOADING its dataset after a co-restart with the API).
 *
 * Why this exists: Bull's repeatable-job install (`queue.add({ repeat })`) runs
 * from `onModuleInit`. If Redis is LOADING at that moment the `zadd` throws, the
 * rejection propagates out of Nest bootstrap, and the whole API process exits →
 * Docker restart-loops it until Redis happens to be ready. That took prod down
 * on 2026-06-12 when a `docker compose up -d` recreated Redis + API together.
 * Retrying the op until Redis is ready turns that crash into a brief wait.
 *
 * Non-transient errors are rethrown immediately (no point retrying a real bug),
 * and after `attempts` exhausted the last error is rethrown (genuine outage).
 */
export async function withRedisReadyRetry<T>(
  op: () => Promise<T>,
  opts: { attempts?: number; delayMs?: number; logger?: Logger; label?: string } = {},
): Promise<T> {
  const { attempts = 30, delayMs = 2_000, logger, label = 'redis op' } = opts;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (!isRedisNotReady(err) || attempt === attempts) throw err;
      logger?.warn(
        `${label}: Redis not ready (${(err as Error).message}); retry ${attempt}/${attempts} in ${delayMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}
