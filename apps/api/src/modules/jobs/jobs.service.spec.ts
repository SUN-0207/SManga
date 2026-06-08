import { JOB_FETCH_CHAPTER } from '@/modules/queue/queue.constants';
import { describe, expect, it, vi } from 'vitest';
import { JobsService } from './jobs.service';

describe('JobsService.refetchAllChapters', () => {
  it('enqueues one fetch-chapter job per crawled chapter with idempotent jobId', async () => {
    const rows = [{ id: 'c1' }, { id: 'c2' }];
    const db = { execute: vi.fn().mockResolvedValue({ rows }) };
    const addBulk = vi.fn().mockResolvedValue([]);
    const queue = { addBulk } as never;
    const svc = new JobsService(db as never, queue);

    const result = await svc.refetchAllChapters();

    expect(result).toEqual({ enqueued: 2 });
    expect(addBulk).toHaveBeenCalledTimes(1);
    const jobs = addBulk.mock.calls[0]?.[0];
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      name: JOB_FETCH_CHAPTER,
      data: { chapterId: 'c1' },
      opts: expect.objectContaining({
        jobId: 'fetch-chapter-c1',
        attempts: 3,
      }),
    });
    expect(jobs[1].opts.jobId).toBe('fetch-chapter-c2');
  });

  it('returns { enqueued: 0 } and does not call addBulk when DB has no crawled chapters', async () => {
    const db = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    const addBulk = vi.fn();
    const queue = { addBulk } as never;
    const svc = new JobsService(db as never, queue);

    const result = await svc.refetchAllChapters();
    expect(result).toEqual({ enqueued: 0 });
    expect(addBulk).not.toHaveBeenCalled();
  });
});
