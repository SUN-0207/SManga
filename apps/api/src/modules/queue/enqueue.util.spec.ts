import { describe, expect, it, vi } from 'vitest';
import { enqueueChunked, enqueueIdempotent } from './enqueue.util';
import { QUEUE_WAITING_CAP } from './queue-capacity';

const mkJobs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: 'fetch-chapter',
    data: { chapterId: `c${i}` },
    opts: { jobId: `j${i}` },
  }));

describe('enqueueChunked', () => {
  it('addBulks in chunks and stops when the cap leaves no headroom', async () => {
    let waiting = QUEUE_WAITING_CAP - 1200; // headroom 1200
    const addBulk = vi.fn(async (chunk: unknown[]) => {
      waiting += chunk.length;
      return [];
    });
    const getWaitingCount = vi.fn(async () => waiting);
    const queue = { addBulk, getWaitingCount } as never;

    const res = await enqueueChunked(queue, mkJobs(5000), 500);

    // Enqueued only up to the 1200 headroom (in 500-chunks: 500+500+200), then stopped.
    expect(res.enqueued).toBe(1200);
    expect(res.remaining).toBe(3800);
    expect(addBulk).toHaveBeenCalledTimes(3);
  });

  it('enqueues everything when there is ample headroom', async () => {
    const addBulk = vi.fn(async () => []);
    const getWaitingCount = vi.fn(async () => 0);
    const queue = { addBulk, getWaitingCount } as never;
    const res = await enqueueChunked(queue, mkJobs(900), 500);
    expect(res).toEqual({ enqueued: 900, remaining: 0 });
    expect(addBulk).toHaveBeenCalledTimes(2); // 500 + 400
  });

  it('does nothing for an empty job list', async () => {
    const addBulk = vi.fn();
    const getWaitingCount = vi.fn(async () => 0);
    const queue = { addBulk, getWaitingCount } as never;
    expect(await enqueueChunked(queue, [], 500)).toEqual({ enqueued: 0, remaining: 0 });
    expect(addBulk).not.toHaveBeenCalled();
  });
});

describe('enqueueIdempotent', () => {
  it('removes a completed/failed job under the same id, then re-adds', async () => {
    const remove = vi.fn(async () => {});
    const existing = { getState: vi.fn(async () => 'completed'), remove };
    const getJob = vi.fn(async () => existing);
    const add = vi.fn(async () => ({ id: 'new' }));
    const queue = { getJob, add } as never;

    await enqueueIdempotent(
      queue,
      'discover-chapters',
      { storyId: 's1' },
      { jobId: 'discover-chapters:s1' },
    );

    expect(remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'discover-chapters',
      { storyId: 's1' },
      { jobId: 'discover-chapters:s1' },
    );
  });

  it('leaves an active/waiting job alone and does NOT re-add', async () => {
    const remove = vi.fn();
    const existing = { getState: vi.fn(async () => 'active'), remove };
    const getJob = vi.fn(async () => existing);
    const add = vi.fn();
    const queue = { getJob, add } as never;

    const res = await enqueueIdempotent(
      queue,
      'discover-chapters',
      { storyId: 's1' },
      { jobId: 'discover-chapters:s1' },
    );

    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(res).toBe(existing);
  });

  it('adds normally when no job exists for the id', async () => {
    const getJob = vi.fn(async () => null);
    const add = vi.fn(async () => ({ id: 'new' }));
    const queue = { getJob, add } as never;
    await enqueueIdempotent(
      queue,
      'fetch-chapter',
      { chapterId: 'c1' },
      { jobId: 'fetch-chapter:c1' },
    );
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('leaves the job untouched when getState() throws (unknown != terminal)', async () => {
    // A transient getState error must NOT cause a remove — that could delete a
    // live job and duplicate in-flight work. Treat unknown as still-queued.
    const remove = vi.fn();
    const existing = {
      getState: vi.fn(async () => {
        throw new Error('redis blip');
      }),
      remove,
    };
    const getJob = vi.fn(async () => existing);
    const add = vi.fn();
    const queue = { getJob, add } as never;

    const res = await enqueueIdempotent(
      queue,
      'discover-chapters',
      { storyId: 's1' },
      { jobId: 'discover-chapters:s1' },
    );

    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(res).toBe(existing);
  });
});
