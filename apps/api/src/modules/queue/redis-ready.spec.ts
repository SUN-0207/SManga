import { describe, expect, it, vi } from 'vitest';
import { isRedisNotReady, withRedisReadyRetry } from './redis-ready';

describe('isRedisNotReady', () => {
  it('matches Redis LOADING + connection-not-ready errors', () => {
    expect(isRedisNotReady(new Error('LOADING Redis is loading the dataset in memory'))).toBe(true);
    expect(isRedisNotReady(new Error('connect ECONNREFUSED 127.0.0.1:6379'))).toBe(true);
    expect(isRedisNotReady(new Error('Connection is closed.'))).toBe(true);
  });
  it('does not match unrelated errors (incl. a stray lowercase "loading")', () => {
    expect(isRedisNotReady(new Error('some other failure'))).toBe(false);
    expect(isRedisNotReady(new Error('WRONGTYPE Operation against a key'))).toBe(false);
    expect(isRedisNotReady(new Error('job payload still loading from cache'))).toBe(false);
  });
});

describe('withRedisReadyRetry', () => {
  it('retries while Redis is LOADING, then succeeds', async () => {
    let calls = 0;
    const op = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error('LOADING Redis is loading the dataset in memory');
      return 'ok';
    });
    const res = await withRedisReadyRetry(op, { attempts: 5, delayMs: 1 });
    expect(res).toBe('ok');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('rethrows a non-transient error immediately (no retry)', async () => {
    const op = vi.fn(async () => {
      throw new Error('real bug, not redis loading');
    });
    await expect(withRedisReadyRetry(op, { attempts: 5, delayMs: 1 })).rejects.toThrow('real bug');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('gives up after attempts exhausted, rethrowing the last error', async () => {
    const op = vi.fn(async () => {
      throw new Error('LOADING dataset');
    });
    await expect(withRedisReadyRetry(op, { attempts: 3, delayMs: 1 })).rejects.toThrow('LOADING');
    expect(op).toHaveBeenCalledTimes(3);
  });
});
