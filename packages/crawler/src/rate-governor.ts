import { TokenBucket } from './rate-limit.ts';

export interface BreakerConfig {
  /** Number of rate-limit (429/503) hits within windowMs that opens the breaker. */
  threshold: number;
  windowMs: number;
  cooldownMs: number;
}

const DEFAULT_BREAKER: BreakerConfig = { threshold: 5, windowMs: 60_000, cooldownMs: 60_000 };

interface SourceState {
  bucket: TokenBucket;
  rps: number;
  hits: number[]; // epoch-ms timestamps of recent rate-limit hits (rolling window)
  openUntil: number; // epoch ms the breaker stays open until; 0 = closed
}

/**
 * Per-source rate control: a token bucket plus a circuit-breaker, with a live
 * global rps override the host (api) pushes from app_setting.crawlRps. The CLI
 * leaves the override unset and each call falls back to the static adapter rps.
 *
 * This is the seam for A2 (a dedicated worker container): swap this in-process
 * singleton for a Redis-coordinated impl behind acquire()/recordRateLimit()
 * without touching the engine or processors.
 */
export class RateGovernor {
  private readonly sources = new Map<string, SourceState>();
  private globalRps: number | null = null;

  constructor(private readonly breaker: BreakerConfig = DEFAULT_BREAKER) {}

  /** Host pushes the live rps (e.g. from app_setting.crawlRps). <=0 clears it. */
  setGlobalRps(rps: number): void {
    this.globalRps = rps > 0 ? rps : null;
  }

  private stateFor(sourceId: string, fallbackRps: number): SourceState {
    const rps = this.globalRps ?? fallbackRps;
    const existing = this.sources.get(sourceId);
    if (existing && existing.rps === rps) return existing;
    // rps changed (override edit) or first use → fresh bucket; carry breaker state.
    const fresh: SourceState = {
      bucket: new TokenBucket({ ratePerSecond: rps, burst: Math.max(1, Math.ceil(rps)) }),
      rps,
      hits: existing?.hits ?? [],
      openUntil: existing?.openUntil ?? 0,
    };
    this.sources.set(sourceId, fresh);
    return fresh;
  }

  /** Block until a token is available; if the breaker is open, sleep the cooldown first. */
  async acquire(sourceId: string, fallbackRps: number): Promise<void> {
    const st = this.stateFor(sourceId, fallbackRps);
    const now = Date.now();
    if (st.openUntil > now) {
      await new Promise<void>((resolve) => setTimeout(resolve, st.openUntil - now));
      st.openUntil = 0; // half-open: let the next request probe the source
      st.hits = []; // fresh window after the cooldown
    }
    await st.bucket.acquire();
  }

  /** Record a 429/503 from the source. Opens the breaker once threshold hits land in the window. */
  recordRateLimit(sourceId: string, fallbackRps = 1): void {
    const st = this.stateFor(sourceId, fallbackRps);
    const now = Date.now();
    st.hits = st.hits.filter((t) => now - t < this.breaker.windowMs);
    st.hits.push(now);
    if (st.hits.length >= this.breaker.threshold) {
      st.openUntil = now + this.breaker.cooldownMs;
      st.hits = [];
    }
  }

  isOpen(sourceId: string): boolean {
    const st = this.sources.get(sourceId);
    return !!st && st.openUntil > Date.now();
  }
}

/**
 * Process-wide singleton used by the engine. A2 swaps this for a Redis-backed
 * RateGovernor behind the same surface.
 */
export const rateGovernor = new RateGovernor();
