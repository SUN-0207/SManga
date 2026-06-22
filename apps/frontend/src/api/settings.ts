import { api } from '@/lib/api-client';

export interface AutoRefreshSetting {
  id: number;
  autoRefreshEnabled: boolean;
  autoRefreshCron: string;
  autoRefreshScope: 'ongoing' | 'all';
  autoRefreshConcurrency: number;
  lastRunAt: string | null;
  lastRunCount: number | null;
  updatedAt: string;
}

export interface UpdateAutoRefreshPatch {
  enabled?: boolean;
  cron?: string;
  scope?: 'ongoing' | 'all';
  concurrency?: number;
}

export async function getAutoRefresh(): Promise<AutoRefreshSetting> {
  const res = await api.get<AutoRefreshSetting>('/admin/settings/auto-refresh');
  return res.data;
}

export async function updateAutoRefresh(
  patch: UpdateAutoRefreshPatch,
): Promise<AutoRefreshSetting> {
  const res = await api.patch<AutoRefreshSetting>('/admin/settings/auto-refresh', patch);
  return res.data;
}

export async function runAutoRefreshNow(): Promise<{ jobId: string }> {
  const res = await api.post<{ jobId: string }>('/admin/settings/auto-refresh/run-now');
  return res.data;
}

export interface AutoCrawlSetting {
  autoCrawlEnabled: boolean;
  autoCrawlWatermark: number;
  crawlRps: number;
}

export interface UpdateAutoCrawlPatch {
  enabled?: boolean;
  watermark?: number;
  crawlRps?: number;
}

export async function getAutoCrawl(): Promise<AutoCrawlSetting> {
  const res = await api.get<AutoCrawlSetting>('/admin/settings/auto-crawl');
  return res.data;
}

export async function updateAutoCrawl(patch: UpdateAutoCrawlPatch): Promise<AutoCrawlSetting> {
  const res = await api.patch<AutoCrawlSetting>('/admin/settings/auto-crawl', patch);
  return res.data;
}

export interface NewChapterNotifySetting {
  newChapterNotifyEnabled: boolean;
}

export async function getNewChapterNotify(): Promise<NewChapterNotifySetting> {
  const res = await api.get<NewChapterNotifySetting>('/admin/settings/new-chapter-notify');
  return res.data;
}

export async function updateNewChapterNotify(enabled: boolean): Promise<NewChapterNotifySetting> {
  const res = await api.patch<NewChapterNotifySetting>('/admin/settings/new-chapter-notify', {
    enabled,
  });
  return res.data;
}

export interface GamificationSetting {
  gamificationEnabled: boolean;
}

export async function getGamification(): Promise<GamificationSetting> {
  const res = await api.get<GamificationSetting>('/admin/settings/gamification');
  return res.data;
}

export async function updateGamification(enabled: boolean): Promise<GamificationSetting> {
  const res = await api.patch<GamificationSetting>('/admin/settings/gamification', { enabled });
  return res.data;
}
