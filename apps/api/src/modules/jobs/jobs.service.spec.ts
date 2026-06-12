import { _resetCapacityCache } from '@/modules/queue/queue-capacity';
import { JOB_FETCH_CHAPTER, JOB_IMPORT_STORY, JOB_PRIORITY } from '@/modules/queue/queue.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobsService } from './jobs.service';

describe('JobsService.refetchAllChapters', () => {
  // The capacity helper caches getWaitingCount() for 2s across calls. Tests
  // need a clean slate so the mock's getWaitingCount value drives each case.
  beforeEach(() => {
    _resetCapacityCache();
  });

  it('enqueues one fetch-chapter job per crawled chapter with idempotent jobId', async () => {
    const rows = [{ id: 'c1' }, { id: 'c2' }];
    const db = { execute: vi.fn().mockResolvedValue({ rows }) };
    const addBulk = vi.fn().mockResolvedValue([]);
    // Under capacity → cap check passes, enqueue proceeds.
    const getWaitingCount = vi.fn().mockResolvedValue(100);
    const queue = { addBulk, getWaitingCount } as never;
    const svc = new JobsService(db as never, queue);

    const result = await svc.refetchAllChapters();

    expect(result).toEqual({ enqueued: 2, remaining: 0 });
    expect(addBulk).toHaveBeenCalledTimes(1);
    const jobs = addBulk.mock.calls[0]?.[0];
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      name: JOB_FETCH_CHAPTER,
      data: { chapterId: 'c1' },
      opts: expect.objectContaining({
        jobId: 'fetch-chapter:c1',
        priority: JOB_PRIORITY.FETCH_CHAPTER,
        attempts: 3,
      }),
    });
    expect(jobs[1].opts.jobId).toBe('fetch-chapter:c2');
  });

  it('returns { enqueued: 0 } and does not call addBulk when DB has no crawled chapters', async () => {
    const db = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    const addBulk = vi.fn();
    const getWaitingCount = vi.fn().mockResolvedValue(0);
    const queue = { addBulk, getWaitingCount } as never;
    const svc = new JobsService(db as never, queue);

    const result = await svc.refetchAllChapters();
    expect(result).toEqual({ enqueued: 0, remaining: 0 });
    expect(addBulk).not.toHaveBeenCalled();
  });

  it('throws 503 when wait queue is at capacity, never queries DB', async () => {
    const dbExecute = vi.fn();
    const db = { execute: dbExecute };
    const addBulk = vi.fn();
    // At cap (10k) → assertQueueCapacity throws before DB is touched.
    const getWaitingCount = vi.fn().mockResolvedValue(10_000);
    const queue = { addBulk, getWaitingCount } as never;
    const svc = new JobsService(db as never, queue);

    await expect(svc.refetchAllChapters()).rejects.toThrow(/quá tải/);
    expect(dbExecute).not.toHaveBeenCalled();
    expect(addBulk).not.toHaveBeenCalled();
  });
});

describe('JobsService.backfillCovers', () => {
  beforeEach(() => {
    _resetCapacityCache();
  });

  it('enqueues one import-story job per null-cover story with skipDiscovery=true', async () => {
    const rows = [
      { external_url: 'https://truyenfull.today/foo/' },
      { external_url: 'https://truyenfull.today/bar/' },
    ];
    const db = { execute: vi.fn().mockResolvedValue({ rows }) };
    const addBulk = vi.fn().mockResolvedValue([]);
    const getWaitingCount = vi.fn().mockResolvedValue(50);
    const queue = { addBulk, getWaitingCount } as never;
    const svc = new JobsService(db as never, queue);

    const result = await svc.backfillCovers();

    expect(result).toEqual({ enqueued: 2, remaining: 0, totalNullCover: 2 });
    expect(addBulk).toHaveBeenCalledTimes(1);
    const jobs = addBulk.mock.calls[0]?.[0];
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      name: JOB_IMPORT_STORY,
      data: {
        url: 'https://truyenfull.today/foo/',
        requestedBy: null,
        skipDiscovery: true,
        autoCrawl: false,
      },
      opts: expect.objectContaining({
        priority: JOB_PRIORITY.IMPORT_STORY,
        attempts: 3,
      }),
    });
    expect(jobs[1].data.url).toBe('https://truyenfull.today/bar/');
  });

  it('returns zero counts and does not call addBulk when no stories need backfill', async () => {
    const db = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    const addBulk = vi.fn();
    const getWaitingCount = vi.fn().mockResolvedValue(0);
    const queue = { addBulk, getWaitingCount } as never;
    const svc = new JobsService(db as never, queue);

    const result = await svc.backfillCovers();
    expect(result).toEqual({ enqueued: 0, remaining: 0, totalNullCover: 0 });
    expect(addBulk).not.toHaveBeenCalled();
  });

  it('throws 503 when wait queue is at capacity, never queries DB', async () => {
    const dbExecute = vi.fn();
    const db = { execute: dbExecute };
    const addBulk = vi.fn();
    const getWaitingCount = vi.fn().mockResolvedValue(10_000);
    const queue = { addBulk, getWaitingCount } as never;
    const svc = new JobsService(db as never, queue);

    await expect(svc.backfillCovers()).rejects.toThrow(/quá tải/);
    expect(dbExecute).not.toHaveBeenCalled();
    expect(addBulk).not.toHaveBeenCalled();
  });
});
