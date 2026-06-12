import { describe, expect, it, vi } from 'vitest';
import { AutoCrawlFeederProcessor } from './auto-crawl-feeder.processor';

/** db.select().from().where().limit() → [configRow] */
function selectConfig(configRow: unknown) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(configRow ? [configRow] : []),
  };
  return () => chain;
}

describe('AutoCrawlFeederProcessor.handle', () => {
  it('no-op when disabled', async () => {
    const db = {
      select: vi.fn(selectConfig({ autoCrawlEnabled: false, autoCrawlWatermark: 500 })),
    };
    const queue = { getWaitingCount: vi.fn(), addBulk: vi.fn() };
    const svc = new AutoCrawlFeederProcessor(db as never, queue as never);
    const res = await svc.handle();
    expect(res).toEqual({ enqueued: 0, reason: 'disabled' });
    expect(queue.getWaitingCount).not.toHaveBeenCalled();
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('no-op when waiting >= watermark', async () => {
    const db = {
      select: vi.fn(selectConfig({ autoCrawlEnabled: true, autoCrawlWatermark: 500 })),
      execute: vi.fn(),
    };
    const queue = { getWaitingCount: vi.fn().mockResolvedValue(500), addBulk: vi.fn() };
    const svc = new AutoCrawlFeederProcessor(db as never, queue as never);
    const res = await svc.handle();
    expect(res).toEqual({ enqueued: 0, reason: 'watermark' });
    expect(db.execute).not.toHaveBeenCalled();
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('idle when no pending chapters', async () => {
    const db = {
      select: vi.fn(selectConfig({ autoCrawlEnabled: true, autoCrawlWatermark: 500 })),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const queue = { getWaitingCount: vi.fn().mockResolvedValue(0), addBulk: vi.fn() };
    const svc = new AutoCrawlFeederProcessor(db as never, queue as never);
    const res = await svc.handle();
    expect(res).toEqual({ enqueued: 0, reason: 'idle' });
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('enqueues pending chapter ids as low-priority fetch-chapter jobs', async () => {
    const db = {
      select: vi.fn(selectConfig({ autoCrawlEnabled: true, autoCrawlWatermark: 500 })),
      execute: vi.fn().mockResolvedValue({ rows: [{ id: 'c1' }, { id: 'c2' }] }),
    };
    const addBulk = vi.fn().mockResolvedValue([]);
    const queue = { getWaitingCount: vi.fn().mockResolvedValue(0), addBulk };
    const svc = new AutoCrawlFeederProcessor(db as never, queue as never);
    const res = await svc.handle();
    expect(res).toEqual({ enqueued: 2, reason: null });
    const chunk = addBulk.mock.calls[0]![0] as Array<{
      name: string;
      data: unknown;
      opts: { jobId: string; priority: number };
    }>;
    expect(chunk).toHaveLength(2);
    expect(chunk[0]).toMatchObject({
      name: 'fetch-chapter',
      data: { chapterId: 'c1' },
      opts: { jobId: 'fetch-chapter:c1', priority: 30 },
    });
  });

  it('returns reason="error" (no crash, no enqueue) when the picker query throws', async () => {
    const db = {
      select: vi.fn(selectConfig({ autoCrawlEnabled: true, autoCrawlWatermark: 500 })),
      execute: vi.fn().mockRejectedValue(new Error('db blip')),
    };
    const addBulk = vi.fn();
    const queue = { getWaitingCount: vi.fn().mockResolvedValue(0), addBulk };
    const svc = new AutoCrawlFeederProcessor(db as never, queue as never);
    const res = await svc.handle();
    expect(res).toEqual({ enqueued: 0, reason: 'error' });
    expect(addBulk).not.toHaveBeenCalled();
  });
});
