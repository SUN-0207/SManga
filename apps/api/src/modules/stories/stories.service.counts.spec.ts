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
