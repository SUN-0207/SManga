import { Agent } from 'undici';
import { describe, expect, it } from 'vitest';
import { getCrawlerDispatcher } from '../src/fetcher.js';

describe('crawler dispatcher', () => {
  it('returns a single reused undici Agent (keep-alive pool)', () => {
    const a = getCrawlerDispatcher();
    const b = getCrawlerDispatcher();
    expect(a).toBe(b); // same instance → connections are pooled, not per-request
    expect(a).toBeInstanceOf(Agent);
  });
});
