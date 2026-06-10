import { _resetCapacityCache } from '@/modules/queue/queue-capacity';
import { JOB_PRIORITY } from '@/modules/queue/queue.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryReconcilerService } from './retry-reconciler.service';

/**
 * Mock the two drizzle select chains the reconciler runs in order:
 *   1) select().from(appSetting).where().limit(1)
 *   2) select().from(jobFailure).where().orderBy().limit(cap)
 * `results[0]` feeds the first `.limit()`, `results[1]` the second.
 */
function makeSelect(results: unknown[][]) {
  let call = 0;
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(results[call++] ?? []),
  };
  return vi.fn(() => chain);
}

function updateMock() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { update, set, where };
}

describe('RetryReconcilerService.handle', () => {
  beforeEach(() => _resetCapacityCache());

  it('no-ops when auto_retry_enabled is false', async () => {
    const add = vi.fn();
    const getWaitingCount = vi.fn().mockResolvedValue(0);
    const queue = { add, getWaitingCount } as never;
    const db = { select: makeSelect([[{ autoRetryEnabled: false }]]) } as never;
    const svc = new RetryReconcilerService(db, queue);

    const res = await svc.handle({} as never);
    expect(res).toEqual({ reEnqueued: 0, skipped: true });
    expect(add).not.toHaveBeenCalled();
  });

  it('skips the entire run when the queue is at/over capacity', async () => {
    const add = vi.fn();
    const getWaitingCount = vi.fn().mockResolvedValue(10_000); // QUEUE_WAITING_CAP
    const queue = { add, getWaitingCount } as never;
    const db = { select: makeSelect([[{ autoRetryEnabled: true }]]) } as never;
    const svc = new RetryReconcilerService(db, queue);

    const res = await svc.handle({} as never);
    expect(res).toEqual({ reEnqueued: 0, skipped: true });
    expect(add).not.toHaveBeenCalled();
  });

  it('re-enqueues each due row and flips it to retrying with gen+1', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'x' });
    const getJob = vi.fn().mockResolvedValue(null);
    const getWaitingCount = vi.fn().mockResolvedValue(100);
    const queue = { add, getJob, getWaitingCount } as never;
    const due = [
      {
        id: 'r1',
        dedupKey: 'fetch-chapter:c1',
        jobName: 'fetch-chapter',
        jobData: { chapterId: 'c1' },
        retryGeneration: 0,
      },
      {
        id: 'r2',
        dedupKey: 'import-story:u',
        jobName: 'import-story',
        jobData: { url: 'u' },
        retryGeneration: 1,
      },
    ];
    const { update, set } = updateMock();
    const db = { select: makeSelect([[{ autoRetryEnabled: true }], due]), update } as never;
    const svc = new RetryReconcilerService(db, queue);

    const res = await svc.handle({} as never);

    expect(res.reEnqueued).toBe(2);
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledWith(
      'fetch-chapter',
      { chapterId: 'c1' },
      { jobId: 'fetch-chapter:c1', priority: JOB_PRIORITY.FETCH_CHAPTER },
    );
    // First row: gen 0 -> 1, status retrying.
    expect((set.mock.calls as unknown[][])[0]![0]).toMatchObject({
      status: 'retrying',
      retryGeneration: 1,
    });
    expect((set.mock.calls as unknown[][])[1]![0]).toMatchObject({
      status: 'retrying',
      retryGeneration: 2,
    });
  });

  it('removes a lingering Bull job with the same id before re-enqueue', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const add = vi.fn().mockResolvedValue({ id: 'x' });
    const getJob = vi.fn().mockResolvedValue({ remove });
    const getWaitingCount = vi.fn().mockResolvedValue(0);
    const queue = { add, getJob, getWaitingCount } as never;
    const due = [
      {
        id: 'r1',
        dedupKey: 'fetch-chapter:c1',
        jobName: 'fetch-chapter',
        jobData: { chapterId: 'c1' },
        retryGeneration: 0,
      },
    ];
    const { update } = updateMock();
    const db = { select: makeSelect([[{ autoRetryEnabled: true }], due]), update } as never;
    const svc = new RetryReconcilerService(db, queue);

    await svc.handle({} as never);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
  });
});
