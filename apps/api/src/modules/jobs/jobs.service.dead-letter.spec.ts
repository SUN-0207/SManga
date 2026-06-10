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
  it('listDeadLetter returns rows from the query', async () => {
    const rows = [{ id: 'r1' }];
    const db = { select: vi.fn(selectChain(rows)) } as never;
    const svc = new JobsService(db, {} as never);
    expect(await svc.listDeadLetter()).toBe(rows);
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
