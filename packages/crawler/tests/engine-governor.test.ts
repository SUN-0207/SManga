import { RateLimitError } from '@smanga/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the network layer so no real HTTP happens; force a rate-limit error.
vi.mock('../src/fetcher.ts', () => ({
  fetchHtml: vi.fn().mockRejectedValue(new RateLimitError('rate limited (503) fetching x')),
  fetchBytes: vi.fn(),
}));

import { fetchChapterById, rateGovernor } from '../src/index.js';

function fakeDb() {
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    limit: () =>
      Promise.resolve([
        { id: 'c1', sourceId: 'truyenfull', externalUrl: 'https://truyenfull.today/s/chuong-1/' },
      ]),
  };
  const updateChain = { set: () => updateChain, where: () => Promise.resolve() };
  return { select: () => selectChain, update: () => updateChain } as never;
}

afterEach(() => vi.restoreAllMocks());

describe('fetchChapterById rate-limit recording', () => {
  it('feeds the governor and rethrows when the source returns 429/503', async () => {
    const spy = vi.spyOn(rateGovernor, 'recordRateLimit');
    await expect(fetchChapterById(fakeDb(), 'c1')).rejects.toBeInstanceOf(RateLimitError);
    expect(spy).toHaveBeenCalledWith('truyenfull', 1); // fallback rps = adapter default
  });
});
