import { describe, expect, it, vi } from 'vitest';
import { NotifyNewChaptersService } from './notify-new-chapters.service';

/** Mock db.select().from().where().limit() → the kill-switch read. */
function selectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return () => chain;
}

/** Mock db.execute() returning a canned result array per call, in order. */
function makeExecute(results: unknown[][]) {
  let call = 0;
  return vi.fn(() => Promise.resolve(results[call++] ?? []));
}

describe('NotifyNewChaptersService.handle', () => {
  it('no-ops when new_chapter_notify is disabled', async () => {
    const execute = vi.fn();
    const db = {
      select: vi.fn(selectChain([{ enabled: false }])),
      execute,
      transaction: (fn: (tx: { execute: typeof execute }) => unknown) => fn({ execute }),
    } as never;
    const svc = new NotifyNewChaptersService(db, {} as never);
    const res = await svc.handle({} as never);
    expect(res).toEqual({ notified: 0, baselined: 0, skipped: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it('baselines a story with a NULL watermark WITHOUT notifying', async () => {
    const execute = makeExecute([
      [{ id: 's1', watermark: null, max_idx: '10', new_count: 5 }], // candidates
      [], // watermark UPDATE
    ]);
    const db = {
      select: vi.fn(selectChain([{ enabled: true }])),
      execute,
      transaction: (fn: (tx: { execute: typeof execute }) => unknown) => fn({ execute }),
    } as never;
    const svc = new NotifyNewChaptersService(db, {} as never);
    const res = await svc.handle({} as never);
    expect(res).toEqual({ notified: 0, baselined: 1, skipped: false });
    expect(execute).toHaveBeenCalledTimes(2); // candidates + baseline UPDATE, NO insert
  });

  it('fans out one notification per bookmarker on a real advance', async () => {
    const execute = makeExecute([
      [{ id: 's1', watermark: '5', max_idx: '10', new_count: 5 }], // candidates
      [{ user_id: 'u1' }, { user_id: 'u2' }], // upsert RETURNING
      [], // watermark UPDATE
    ]);
    const db = {
      select: vi.fn(selectChain([{ enabled: true }])),
      execute,
      transaction: (fn: (tx: { execute: typeof execute }) => unknown) => fn({ execute }),
    } as never;
    const svc = new NotifyNewChaptersService(db, {} as never);
    const res = await svc.handle({} as never);
    expect(res).toEqual({ notified: 2, baselined: 0, skipped: false });
    expect(execute).toHaveBeenCalledTimes(3); // candidates + upsert + watermark UPDATE
  });
});
