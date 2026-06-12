export interface RateLimitConfig {
  ratePerSecond: number;
  burst?: number;
}

export class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private lastRefillMs: number;
  // FIFO gate: each acquire() awaits the previous one before competing for a
  // token, so refills are handed out one caller at a time.
  private chain: Promise<void> = Promise.resolve();

  constructor(cfg: RateLimitConfig) {
    if (cfg.ratePerSecond <= 0) throw new Error('ratePerSecond must be > 0');
    this.capacity = cfg.burst ?? cfg.ratePerSecond;
    this.tokens = this.capacity;
    this.refillPerMs = cfg.ratePerSecond / 1000;
    this.lastRefillMs = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillMs;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefillMs = now;
  }

  async acquire(): Promise<void> {
    // Serialize waiters FIFO so concurrent callers can't all wake on the same
    // computed deadline and stampede (the old single-sleep bug that forced
    // truyenfull rps down to 0.5). Each caller waits its turn, then loops:
    // refill, take a real token if one is available, else sleep the exact
    // deficit and re-check.
    const prev = this.chain;
    let release!: () => void;
    this.chain = new Promise<void>((r) => {
      release = r;
    });
    await prev;
    try {
      while (true) {
        this.refill();
        if (this.tokens >= 1) {
          this.tokens -= 1;
          return;
        }
        const deficit = 1 - this.tokens;
        const waitMs = Math.max(1, Math.ceil(deficit / this.refillPerMs));
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      }
    } finally {
      release();
    }
  }
}
