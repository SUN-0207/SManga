import { describe, expect, it, vi } from 'vitest';
import { StoriesService } from './stories.service';

describe('StoriesService.counts', () => {
  it('returns all four totals from one db round-trip', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [{ all_count: 38018, full_count: 38016, stub_count: 2, needs_crawl_count: 37 }],
    });
    const svc = new StoriesService({ execute } as never, {} as never);

    const res = await svc.counts();

    expect(res).toEqual({ all: 38018, full: 38016, stub: 2, needsCrawl: 37 });
    expect(execute).toHaveBeenCalledTimes(1); // the whole point: ONE query, not four
  });

  it('passes the q filter through and still makes one round-trip', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [{ all_count: 3, full_count: 3, stub_count: 0, needs_crawl_count: 1 }],
    });
    const svc = new StoriesService({ execute } as never, {} as never);

    const res = await svc.counts('kiếm');

    expect(res.needsCrawl).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns zeros when the table is empty', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const svc = new StoriesService({ execute } as never, {} as never);
    expect(await svc.counts()).toEqual({ all: 0, full: 0, stub: 0, needsCrawl: 0 });
  });
});

describe('StoriesService.storageStats cache', () => {
  it('serves the second call from cache (no extra db round-trips)', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          content_bytes: 1,
          chapters_with_content: 1,
          cover_bytes: 1,
          stories_with_cover: 1,
          chapter_target_total: 1,
        },
      ],
    });
    const svc = new StoriesService({ execute } as never, {} as never);

    await svc.storageStats();
    const callsAfterFirst = execute.mock.calls.length; // 2 queries (chapter + story)
    await svc.storageStats();

    expect(execute.mock.calls.length).toBe(callsAfterFirst); // cached — no new queries
  });
});

describe('StoriesService.listChaptersByStoryId (paginated)', () => {
  function chainTo(rows: unknown[]) {
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => Promise.resolve(rows),
    };
    return chain;
  }

  it('returns one page plus single-query status counts', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ rows: [{ total: 1991, crawled: 1985, pending: 5, failed: 1 }] });
    const items = [
      {
        id: 'c1',
        index: '1.00',
        title: 'Ch 1',
        status: 'crawled',
        lastError: null,
        crawledAt: null,
        size: 1000,
      },
    ];
    const select = vi.fn(() => chainTo(items));
    const svc = new StoriesService({ execute, select } as never, {} as never);

    const res = await svc.listChaptersByStoryId('s1', 2, 50);

    expect(res.page).toBe(2);
    expect(res.total).toBe(1991);
    expect(res.totalPages).toBe(Math.ceil(1991 / 50));
    expect(res.counts).toEqual({ crawled: 1985, pending: 5, failed: 1 });
    expect(res.items).toBe(items);
    expect(execute).toHaveBeenCalledTimes(1); // counts in ONE pass, not 3 client-side filters
  });

  it('clamps pageSize to 200', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ rows: [{ total: 10, crawled: 10, pending: 0, failed: 0 }] });
    const select = vi.fn(() => chainTo([]));
    const svc = new StoriesService({ execute, select } as never, {} as never);
    const res = await svc.listChaptersByStoryId('s1', 1, 99999);
    expect(res.totalPages).toBe(1); // 10 rows / clamped 200
  });
});
