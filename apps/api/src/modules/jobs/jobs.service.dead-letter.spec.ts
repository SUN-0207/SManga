import { describe, expect, it, vi } from 'vitest';
import { JobsService } from './jobs.service';

function selectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return () => chain;
}

function updateReturning(returned: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returned);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { update, set, where, returning };
}

describe('JobsService dead-letter actions', () => {
  it('listDeadLetter returns a paginated page + true total', async () => {
    const items = [{ id: 'r1' }, { id: 'r2' }];
    const itemsChain = {
      from: () => itemsChain,
      where: () => itemsChain,
      orderBy: () => itemsChain,
      limit: () => itemsChain,
      offset: () => Promise.resolve(items),
    };
    const countChain = { from: () => countChain, where: () => Promise.resolve([{ count: 7 }]) };
    // Promise.all builds the array left-to-right: items query first, then count.
    const select = vi.fn().mockReturnValueOnce(itemsChain).mockReturnValueOnce(countChain);
    const db = { select } as never;
    const svc = new JobsService(db, {} as never);
    expect(await svc.listDeadLetter(2, 5)).toEqual({
      items,
      total: 7,
      page: 2,
      pageSize: 5,
      totalPages: 2,
    });
  });

  it('deadLetterRetryNow re-arms a row to pending with nextRetryAt=now', async () => {
    const { update, set } = updateReturning([{ id: 'r1' }]);
    const db = { update } as never;
    const svc = new JobsService(db, {} as never);
    const res = await svc.deadLetterRetryNow('r1');
    expect(res).toEqual({ ok: true });
    const firstCall = (set.mock.calls as unknown[][])[0] as unknown[];
    expect(firstCall[0]).toMatchObject({ status: 'pending' });
    expect((firstCall[0] as Record<string, unknown>).nextRetryAt).toBeInstanceOf(Date);
  });

  it('deadLetterRetryNow returns ok:false when no row matched', async () => {
    const { update } = updateReturning([]);
    const db = { update } as never;
    const svc = new JobsService(db, {} as never);
    expect(await svc.deadLetterRetryNow('missing')).toEqual({ ok: false });
  });

  it('deadLetterDismiss resolves a row', async () => {
    const { update, set } = updateReturning([{ id: 'r1' }]);
    const db = { update } as never;
    const svc = new JobsService(db, {} as never);
    const res = await svc.deadLetterDismiss('r1');
    expect(res).toEqual({ ok: true });
    const firstCall = (set.mock.calls as unknown[][])[0] as unknown[];
    expect(firstCall[0]).toMatchObject({ status: 'resolved' });
  });

  it('deadLetterRetryAll re-arms all stuck rows and returns the count', async () => {
    const { update } = updateReturning([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const db = { update } as never;
    const svc = new JobsService(db, {} as never);
    expect(await svc.deadLetterRetryAll()).toEqual({ rearmed: 3 });
  });
});
