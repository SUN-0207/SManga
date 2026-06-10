import { AdapterNotFoundError, FetchError, ParserError, RateLimitError } from './errors.js';

export type FailureClass = 'transient' | 'permanent';

/**
 * Coarse per-generation backoff ladder for the dead-letter reconciler, on
 * top of Bull's fine 30s in-process exponential. Index 0 = generation 1.
 * Minutes: 10m / 30m / 2h / 6h / 24h. After generation 5 the row is `dead`.
 */
export const RETRY_BACKOFF_MINUTES: readonly number[] = [10, 30, 120, 360, 1440];

export const MAX_RETRY_GENERATIONS = RETRY_BACKOFF_MINUTES.length; // 5

/** Backoff (in minutes) before the given 1-based reconciler generation. */
export function backoffForGeneration(generation: number): number {
  const idx = Math.max(0, Math.min(generation - 1, RETRY_BACKOFF_MINUTES.length - 1));
  // idx is always in [0, length-1] after clamping; fallback 10 is unreachable.
  return RETRY_BACKOFF_MINUTES[idx] ?? 10;
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : '';
}

/**
 * Decide whether a terminal crawler failure is worth retrying.
 * Primary path uses `instanceof` (reliable in-process — the single API
 * process runs producer + workers and `@smanga/shared` is bundled once).
 * A `.name` fallback covers the unlikely case where an error crossed a
 * module boundary and lost its prototype chain.
 */
export function classifyCrawlerError(err: unknown): FailureClass {
  if (err instanceof RateLimitError) return 'transient';
  if (err instanceof FetchError) return classifyFetch(err.statusCode);
  if (err instanceof ParserError) return 'permanent';
  if (err instanceof AdapterNotFoundError) return 'permanent';

  // Name-based fallback (prototype identity lost).
  switch (errorName(err)) {
    case 'RateLimitError':
      return 'transient';
    case 'FetchError':
      // statusCode is unreadable in this path — be conservative-transient,
      // since a FetchError is most often a network blip or 5xx.
      return 'transient';
    case 'ParserError':
    case 'AdapterNotFoundError':
      return 'permanent';
    default:
      // Unknown / generic Error: surface it, never loop on something we
      // don't understand.
      return 'permanent';
  }
}

function classifyFetch(statusCode: number | undefined): FailureClass {
  if (statusCode === undefined) return 'transient'; // network error / timeout
  if (statusCode === 408 || statusCode >= 500) return 'transient'; // upstream hiccup
  if (statusCode >= 400) return 'permanent'; // 4xx — gone / forbidden / bad
  return 'transient'; // unreachable in practice (FetchError thrown only for >=400)
}
