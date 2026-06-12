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
    // The mock simulates Bull's live 'failed' sorted set: getJobs respects the
    // `start` offset against the CURRENT remaining array, and each job.retry()
    // removes its entry from that array (simulating ZREM). Page size is capped
    // at 2 items regardless of the requested range.
    //
    // With the CORRECT implementation (always start=0):
    //   call 1 → [j1,j2], retry removes both → remaining=[j3,j4,j5]
    //   call 2 → [j3,j4], retry removes both → remaining=[j5]
    //   call 3 → [j5],    retry removes it   → remaining=[]
    //   call 4 → []  → loop exits.  All 5 retried.
    //
    // With the BUGGY implementation (start += PAGE, PAGE=1000):
    //   call 1 (start=0)    → [j1,j2], retry removes both → remaining=[j3,j4,j5]
    //   call 2 (start=1000) → remaining.slice(1000..1001) = [] → loop exits.
    //   j3, j4, j5 are SKIPPED — the bug is caught.
    const PAGE_CAP = 2; // cap mock page size to force multiple real iterations
    const allJobs = [makeJob('j1'), makeJob('j2'), makeJob('j3'), makeJob('j4'), makeJob('j5')];

    // `liveSet` represents Bull's sorted set; items are removed when retry()
    // is called, simulating ZREM.  getJobs slices from `start` with PAGE_CAP.
    const liveSet = [...allJobs];
    const getJobs = vi.fn().mockImplementation((_states: unknown, start: number) => {
      const page = liveSet.slice(start, start + PAGE_CAP);
      return Promise.resolve(page);
    });

    // Wire each job's retry() to remove itself from liveSet, mirroring ZREM.
    for (const job of allJobs) {
      job.retry.mockImplementation(() => {
        const idx = liveSet.indexOf(job);
        if (idx !== -1) liveSet.splice(idx, 1);
        return Promise.resolve(undefined);
      });
    }

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
