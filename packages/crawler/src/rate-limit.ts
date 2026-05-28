export interface RateLimitConfig {
  ratePerSecond: number;
  burst?: number;
}

export class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private lastRefillMs: number;

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
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const deficit = 1 - this.tokens;
    const waitMs = Math.ceil(deficit / this.refillPerMs);
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }
}
