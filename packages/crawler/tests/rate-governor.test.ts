import { describe, expect, it, vi } from 'vitest';
import { RateGovernor } from '../src/rate-governor.js';

describe('RateGovernor', () => {
  it('applies a global rps override (rebuilds the bucket at the new rate)', async () => {
    const g = new RateGovernor();
    // Fallback rps=1, burst=1 → the 2nd acquire would wait ~1s. Override to
    // 100 rps → both acquires resolve immediately from the burst.
    g.setGlobalRps(100);
    const start = Date.now();
    await g.acquire('truyenfull', 1);
    await g.acquire('truyenfull', 1);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('falls back to the per-call rps when no global override is set', async () => {
    vi.useFakeTimers();
    try {
      const g = new RateGovernor(); // no override → fallback 2 rps, burst 2
      await g.acquire('truyenfull', 2); // burst token #1
      await g.acquire('truyenfull', 2); // burst token #2
      const pending = g.acquire('truyenfull', 2); // must wait ~500ms
      let resolved = false;
      pending.then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(400);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      await pending;
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays closed below the breaker threshold', () => {
    const g = new RateGovernor({ threshold: 5, windowMs: 60_000, cooldownMs: 60_000 });
    g.recordRateLimit('truyenfull', 1);
    g.recordRateLimit('truyenfull', 1);
    expect(g.isOpen('truyenfull')).toBe(false);
  });

  it('opens after the threshold and pauses acquire for the cooldown, then half-opens', async () => {
    vi.useFakeTimers();
    try {
      const g = new RateGovernor({ threshold: 3, windowMs: 60_000, cooldownMs: 60_000 });
      g.setGlobalRps(100); // take bucket delay out of the picture
      for (let i = 0; i < 3; i += 1) g.recordRateLimit('truyenfull', 1);
      expect(g.isOpen('truyenfull')).toBe(true);

      const pending = g.acquire('truyenfull', 1);
      let resolved = false;
      pending.then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(59_000);
      expect(resolved).toBe(false); // still paused inside the cooldown
      await vi.advanceTimersByTimeAsync(2_000); // past the 60s cooldown
      await pending;
      expect(resolved).toBe(true);
      expect(g.isOpen('truyenfull')).toBe(false); // half-open cleared the window
    } finally {
      vi.useRealTimers();
    }
  });
});
