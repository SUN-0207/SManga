import { describe, expect, it, vi } from 'vitest';
import { CultivationService } from './cultivation.service';

function svcWith(opts: {
  enabled?: boolean;
  award?: { dwell_seconds: number; rewarded_at: string | null };
  xpRow?: { xp: number; linh_thach: number; tien_ngoc: number };
}) {
  const tx = {
    execute: vi.fn().mockResolvedValue([]),
    // .select().from().where().limit() chains used inside the tx
  };
  const db = {
    transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    execute: vi.fn().mockResolvedValue([]),
  };
  const settings = { getGamificationEnabled: vi.fn().mockResolvedValue(opts.enabled ?? true) };
  return { svc: new CultivationService(db as never, settings as never), db, settings, tx };
}

describe('CultivationService.creditReadingDwell', () => {
  it('no-op when gamification disabled', async () => {
    const { svc, settings, db } = svcWith({ enabled: false });
    await svc.creditReadingDwell('u1', 's1', 3, 40);
    expect(settings.getGamificationEnabled).toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe('CultivationService.getState', () => {
  it('returns null and does not touch db when gamification disabled', async () => {
    const { svc, settings, db } = svcWith({ enabled: false });
    const result = await svc.getState('u1');
    expect(result).toBeNull();
    expect(settings.getGamificationEnabled).toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
