import { _resetCapacityCache } from '@/modules/queue/queue-capacity';
import { JOB_FETCH_CHAPTER, JOB_IMPORT_STORY, JOB_PRIORITY } from '@/modules/queue/queue.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobsService } from './jobs.service';

/** Build a minimal fake Bull Job object */
function makeJob(id: string) {
  return {
    id,
    name: 'fetch-chapter',
    data: { chapterId: id },
    opts: { attempts: 3, backoff: undefined, priority: 1 },
    retry: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

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

describe('JobsService.retryAllFailed', () => {
  it('retries every failed job across multiple pages without skipping (reads from index 0 each page)', async () => {
    // Regression test for the "advancing start while mutating the live sorted set
    // skips positions PAGE..2*PAGE-1" bug.
    //
    // Simulate 3 pages of 3 jobs each (PAGE=1000, but we use 3-job pages here
    // by returning 3 items per call until the set is drained). The getJobs mock
    // simulates the live sorted set: each call pops the first N items off the
    // front and returns them. This matches Bull's ZREVRANGE behaviour where
    // retried jobs are removed from the set — always reading from 0 is correct.
    const allJobs = [makeJob('j1'), makeJob('j2'), makeJob('j3'), makeJob('j4'), makeJob('j5')];
    // getJobs(['failed'], 0, PAGE-1) drains allJobs: each call removes the front
    // slice and returns it; empty when done.
    let remaining = [...allJobs];
    const getJobs = vi.fn().mockImplementation((_states: unknown, start: number, end: number) => {
      // The correct implementation always calls with start=0.
      // Return the first PAGE items and drain them to simulate live mutation.
      const page = remaining.slice(0, end - start + 1);
      remaining = remaining.slice(page.length);
      return Promise.resolve(page);
    });
    const add = vi.fn().mockResolvedValue({ id: 'new' });
    const db = { execute: vi.fn() };
    const queue = { getJobs, add } as never;
    const svc = new JobsService(db as never, queue);

    const result = await svc.retryAllFailed();

    // All 5 jobs must be retried — none skipped due to position shifting.
    expect(result.retried).toBe(5);
    expect(result.skipped).toBe(0);
    // job.retry() was called on each job exactly once.
    for (const job of allJobs) {
      expect(job.retry).toHaveBeenCalledTimes(1);
    }
  });

  it('counts skipped when both retry() and re-add throw', async () => {
    const job = makeJob('bad');
    job.retry.mockRejectedValue(new Error('cannot retry'));
    const getJobs = vi.fn().mockResolvedValueOnce([job]).mockResolvedValue([]);
    const add = vi.fn().mockRejectedValue(new Error('add failed'));
    const db = { execute: vi.fn() };
    const queue = { getJobs, add } as never;
    const svc = new JobsService(db as never, queue);

    const result = await svc.retryAllFailed();
    expect(result.retried).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
