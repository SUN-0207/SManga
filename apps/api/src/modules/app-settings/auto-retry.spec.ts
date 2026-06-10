import { describe, expect, it, vi } from 'vitest';
import { AppSettingsService } from './app-settings.service';

function selectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return () => chain;
}

function updateReturning(returned: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returned);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  return { update: vi.fn(() => ({ set })), set };
}

describe('AppSettingsService auto-retry toggle', () => {
  it('getAutoRetry reads the persisted flag', async () => {
    const db = { select: vi.fn(selectChain([{ autoRetryEnabled: true }])) } as never;
    const svc = new AppSettingsService(db, {} as never);
    expect(await svc.getAutoRetry()).toEqual({ autoRetryEnabled: true });
  });

  it('setAutoRetry persists the flag and echoes it back', async () => {
    const { update, set } = updateReturning([{ autoRetryEnabled: false }]);
    const db = { update } as never;
    const svc = new AppSettingsService(db, {} as never);
    const res = await svc.setAutoRetry(false);
    expect(res).toEqual({ autoRetryEnabled: false });
    expect((set.mock.calls as unknown[][])[0]?.[0]).toMatchObject({ autoRetryEnabled: false });
  });
});
