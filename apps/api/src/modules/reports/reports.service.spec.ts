import { describe, expect, it, vi } from 'vitest';
import { ReportsService } from './reports.service';

function insertReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const values = vi.fn(() => ({ returning }));
  return { insert: vi.fn(() => ({ values })), values };
}

function updateReturning(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  return { update: vi.fn(() => ({ set })), set };
}

function selectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: vi.fn(() => Promise.resolve(rows)),
  };
  return vi.fn(() => chain);
}

describe('ReportsService', () => {
  it('create inserts and returns the id', async () => {
    const { insert, values } = insertReturning([{ id: 'r1' }]);
    const svc = new ReportsService({ insert } as never);
    const res = await svc.create('u1', { category: 'content', message: 'hello there' } as never);
    expect(res).toEqual({ id: 'r1' });
    expect(
      (values.mock.calls as unknown as Array<Array<Record<string, unknown>>>)[0]?.[0]!,
    ).toMatchObject({
      userId: 'u1',
      category: 'content',
      message: 'hello there',
      storyId: null,
      chapterId: null,
    });
  });

  it('getOpenCount returns the count from db', async () => {
    const svc = new ReportsService({ select: selectChain([{ c: 3 }]) } as never);
    const res = await svc.getOpenCount();
    expect(res).toEqual({ openCount: 3 });
  });

  it('updateStatus to resolved stamps resolvedBy + resolvedAt', async () => {
    const { update, set } = updateReturning([{ id: 'r1', status: 'resolved' }]);
    const svc = new ReportsService({ update } as never);
    await svc.updateStatus('r1', { status: 'resolved' } as never, 'admin1');
    const patch = (set.mock.calls as unknown as Array<Array<Record<string, unknown>>>)[0]?.[0]!;
    expect(patch.status).toBe('resolved');
    expect(patch.resolvedByUserId).toBe('admin1');
    expect(patch.resolvedAt).toBeInstanceOf(Date);
  });

  it('updateStatus to in_progress clears resolvedBy + resolvedAt', async () => {
    const { update, set } = updateReturning([{ id: 'r1', status: 'in_progress' }]);
    const svc = new ReportsService({ update } as never);
    await svc.updateStatus('r1', { status: 'in_progress' } as never, 'admin1');
    const patch = (set.mock.calls as unknown as Array<Array<Record<string, unknown>>>)[0]?.[0]!;
    expect(patch.resolvedByUserId).toBeNull();
    expect(patch.resolvedAt).toBeNull();
  });
});
