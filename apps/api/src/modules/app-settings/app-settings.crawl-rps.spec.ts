import { rateGovernor } from '@smanga/crawler';
import { describe, expect, it, vi } from 'vitest';
import { AppSettingsService } from './app-settings.service';

function dbReturning(row: unknown) {
  const chain = {
    set: () => chain,
    where: () => chain,
    returning: () => Promise.resolve([row]),
  };
  return { update: () => chain } as never;
}

describe('AppSettingsService.setAutoCrawl crawlRps', () => {
  it('clamps crawlRps to [0.1, 20] and pushes the persisted value to the governor', async () => {
    const persisted = { autoCrawlEnabled: true, autoCrawlWatermark: 500, crawlRps: 20 };
    const svc = new AppSettingsService(dbReturning(persisted), {} as never);
    const spy = vi.spyOn(rateGovernor, 'setGlobalRps');

    const res = await svc.setAutoCrawl(true, 500, 999); // 999 → clamps to 20
    expect(res.crawlRps).toBe(20);
    expect(spy).toHaveBeenCalledWith(20);
    spy.mockRestore();
  });
});
