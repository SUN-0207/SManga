import { describe, expect, it } from 'vitest';
import { RealIpThrottlerGuard } from './real-ip-throttler.guard';

// getTracker is protected; cast to reach it in the test.
function tracker(req: unknown): Promise<string> {
  const g = Object.create(RealIpThrottlerGuard.prototype) as {
    getTracker: (r: unknown) => Promise<string>;
  };
  return g.getTracker(req);
}

describe('RealIpThrottlerGuard.getTracker', () => {
  it('prefers CF-Connecting-IP (the real client behind the tunnel)', async () => {
    expect(
      await tracker({ headers: { 'cf-connecting-ip': '203.0.113.7' }, ip: '172.18.0.5' }),
    ).toBe('203.0.113.7');
  });

  it('falls back to req.ip when CF header is absent (local dev)', async () => {
    expect(await tracker({ headers: {}, ip: '127.0.0.1' })).toBe('127.0.0.1');
  });

  it('returns a stable string even if both are missing', async () => {
    expect(await tracker({ headers: {} })).toBe('unknown');
  });
});
