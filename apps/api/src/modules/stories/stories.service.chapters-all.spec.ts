import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { StoriesService } from './stories.service';

describe('StoriesService.allChaptersBySlug', () => {
  // A select chain whose terminal `.limit()` resolves to `rows`.
  function chainResolving(rows: unknown[]) {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => Promise.resolve(rows),
    };
    return chain;
  }

  it('returns all chapters sorted ascending for a known slug', async () => {
    const items = [
      { index: '1.00', title: 'Ch 1', status: 'crawled' },
      { index: '2.00', title: 'Ch 2', status: 'crawled' },
    ];
    const select = vi
      .fn()
      .mockReturnValueOnce(chainResolving([{ id: 's1' }])) // id lookup
      .mockReturnValueOnce(chainResolving(items)); // chapter rows
    const svc = new StoriesService({ select } as never, {} as never);

    const res = await svc.allChaptersBySlug('dau-pha-thuong-khung');

    expect(res).toBe(items);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('throws NotFoundException when the slug is unknown', async () => {
    const select = vi.fn().mockReturnValueOnce(chainResolving([])); // empty id lookup
    const svc = new StoriesService({ select } as never, {} as never);

    await expect(svc.allChaptersBySlug('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
