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
});
