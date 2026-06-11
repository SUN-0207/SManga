import { describe, expect, it } from 'vitest';
import { crawlBadge } from './crawl-badge';

const base = {
  discoveryStatus: 'complete' as const,
  crawledChapters: 0,
  pendingChapters: 0,
  failedChapters: 0,
};

describe('crawlBadge', () => {
  it('returns kind=stub for not-yet-discovered stories (counts ignored)', () => {
    expect(crawlBadge({ ...base, discoveryStatus: 'pending', pendingChapters: 5 })).toMatchObject({
      kind: 'stub',
    });
  });

  it('failed wins over pending (most urgent)', () => {
    const b = crawlBadge({ ...base, crawledChapters: 9, pendingChapters: 3, failedChapters: 2 });
    expect(b).toMatchObject({ kind: 'failed', count: 2, crawled: 9, total: 14 });
  });

  it('untouched when discovered but nothing crawled yet', () => {
    expect(crawlBadge({ ...base, pendingChapters: 5 })).toMatchObject({
      kind: 'untouched',
      total: 5,
      crawled: 0,
    });
  });

  it('partial (Thiếu) when some crawled, some pending, none failed', () => {
    expect(crawlBadge({ ...base, crawledChapters: 9, pendingChapters: 5 })).toMatchObject({
      kind: 'partial',
      count: 5,
      crawled: 9,
      total: 14,
    });
  });

  it('full (Đủ) when everything crawled', () => {
    expect(crawlBadge({ ...base, crawledChapters: 6 })).toMatchObject({
      kind: 'full',
      crawled: 6,
      total: 6,
    });
  });
});
