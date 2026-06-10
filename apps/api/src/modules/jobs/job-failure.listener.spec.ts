import { FetchError, ParserError } from '@smanga/shared';
import { describe, expect, it, vi } from 'vitest';
import { JobFailureListener } from './job-failure.listener';

/** Mock the drizzle select().from().where().limit() chain -> resolves rows. */
function selectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return () => chain;
}

function makeJob(over: Record<string, unknown> = {}) {
  return {
    name: 'fetch-chapter',
    data: { chapterId: 'c1' },
    attemptsMade: 2,
    opts: { attempts: 2 },
    ...over,
  } as never;
}

describe('JobFailureListener.onFailed', () => {
  it('does NOT dead-letter while in-process retries remain', async () => {
    const insert = vi.fn();
    const db = { select: vi.fn(selectChain([])), insert } as never;
    const listener = new JobFailureListener(db);

    // attemptsMade 1 < attempts 2 -> not terminal yet.
    await listener.onFailed(
      makeJob({ attemptsMade: 1 }),
      new FetchError('http 500', { statusCode: 500 }),
    );

    expect(insert).not.toHaveBeenCalled();
  });

  it('upserts a transient terminal failure as pending with a 10m backoff (fresh row)', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const db = { select: vi.fn(selectChain([])), insert } as never; // no existing row -> gen 0
    const listener = new JobFailureListener(db);

    const before = Date.now();
    await listener.onFailed(makeJob(), new FetchError('http 503', { statusCode: 503 }));

    expect(insert).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inserted = (values.mock.calls as any[][])[0]![0] as Record<string, unknown>;
    expect(inserted.dedupKey).toBe('fetch-chapter:c1');
    expect(inserted.classification).toBe('transient');
    expect(inserted.status).toBe('pending');
    expect(inserted.retryGeneration).toBe(0);
    const next = (inserted.nextRetryAt as Date).getTime();
    expect(next - before).toBeGreaterThanOrEqual(10 * 60_000 - 1000);
    expect(next - before).toBeLessThan(11 * 60_000);
  });

  it('routes permanent failures to needs_attention with no nextRetryAt', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const db = { select: vi.fn(selectChain([])), insert } as never;
    const listener = new JobFailureListener(db);

    await listener.onFailed(makeJob(), new ParserError('html changed'));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inserted = (values.mock.calls as any[][])[0]![0] as Record<string, unknown>;
    expect(inserted.classification).toBe('permanent');
    expect(inserted.status).toBe('needs_attention');
    expect(inserted.nextRetryAt).toBeNull();
  });

  it('marks a transient row dead once it has exhausted MAX generations', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    // Existing row already at generation 5 -> next failure gives up.
    const db = { select: vi.fn(selectChain([{ retryGeneration: 5 }])), insert } as never;
    const listener = new JobFailureListener(db);

    await listener.onFailed(makeJob(), new FetchError('http 500', { statusCode: 500 }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inserted = (values.mock.calls as any[][])[0]![0] as Record<string, unknown>;
    expect(inserted.status).toBe('dead');
    expect(inserted.nextRetryAt).toBeNull();
  });

  it('ignores job types that are not dead-letterable', async () => {
    const insert = vi.fn();
    const db = { select: vi.fn(), insert } as never;
    const listener = new JobFailureListener(db);

    await listener.onFailed(
      makeJob({ name: 'refresh-all-stories', data: {} }),
      new FetchError('http 500', { statusCode: 500 }),
    );

    expect(insert).not.toHaveBeenCalled();
  });
});

describe('JobFailureListener.onCompleted', () => {
  it('resolves a matching row by dedupKey', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const db = { update } as never;
    const listener = new JobFailureListener(db);

    await listener.onCompleted(makeJob());

    expect(update).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch = (set.mock.calls as any[][])[0]![0] as Record<string, unknown>;
    expect(patch.status).toBe('resolved');
    expect(patch.resolvedAt).toBeInstanceOf(Date);
    // Resetting generation makes resolution a clean episode boundary so a later
    // failure of the same (reused) dedupKey restarts fresh at gen 0.
    expect(patch.retryGeneration).toBe(0);
  });

  it('does nothing for non-dead-letterable job types', async () => {
    const update = vi.fn();
    const db = { update } as never;
    const listener = new JobFailureListener(db);
    await listener.onCompleted(makeJob({ name: 'retry-reconciler', data: {} }));
    expect(update).not.toHaveBeenCalled();
  });
});
