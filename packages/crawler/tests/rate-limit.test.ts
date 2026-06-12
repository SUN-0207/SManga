import { describe, expect, it, vi } from 'vitest';
import { TokenBucket } from '../src/rate-limit.js';

describe('TokenBucket', () => {
  it('allows immediate acquire when tokens available', async () => {
    const bucket = new TokenBucket({ ratePerSecond: 5, burst: 5 });
    const start = Date.now();
    await bucket.acquire();
    expect(Date.now() - start).toBeLessThan(20);
  });

  it('delays acquisition when bucket is empty', async () => {
    vi.useFakeTimers();
    try {
      const bucket = new TokenBucket({ ratePerSecond: 2, burst: 1 });
      await bucket.acquire(); // consumes the one token
      const pending = bucket.acquire();
      let resolved = false;
      pending.then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(400);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(200); // total 600ms
      await pending;
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('serializes concurrent waiters one-per-interval (no thundering herd)', async () => {
    vi.useFakeTimers();
    try {
      // rps=2 → one token every 500ms; burst=1 → only the first is immediate.
      const bucket = new TokenBucket({ ratePerSecond: 2, burst: 1 });
      const resolvedAt: number[] = [];
      const t0 = Date.now();
      const ps = [bucket.acquire(), bucket.acquire(), bucket.acquire()].map((p, i) =>
        p.then(() => {
          resolvedAt[i] = Date.now() - t0;
        }),
      );
      // Drain virtual time well past 3 intervals, flushing microtasks each step.
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.all(ps);
      // #0 immediate; #1 ~500ms; #2 ~1000ms — spaced, NOT all at ~500ms.
      expect(resolvedAt[0]).toBeLessThan(50);
      expect(resolvedAt[1]).toBeGreaterThanOrEqual(450);
      expect(resolvedAt[2]).toBeGreaterThanOrEqual(950);
    } finally {
      vi.useRealTimers();
    }
  });
});
