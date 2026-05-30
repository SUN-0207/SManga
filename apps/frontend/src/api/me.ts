import { api } from '@/lib/api-client';

export interface ContinueReading {
  storyId: string;
  storySlug: string;
  storyTitle: string;
  hasCover: boolean;
  chapterIndex: string; // numeric — keep as string, FE coerces when displaying
  totalChapters: number;
  updatedAt: string;
}

export interface UserStats {
  totalChaptersRead: number;
  libraryCount: number;
  completedCount: number;
  weeklyChapters: number;
  weeklyHours: number;
  streakDays: number;
  dailyChaptersLast7: number[];
}

export const meApi = {
  /** Returns null when BE responds 204 (no progress) — never throws on that case. */
  continueReading: async (): Promise<ContinueReading | null> => {
    const r = await api.get<ContinueReading | ''>('/me/reading-progress/continue-reading', {
      validateStatus: (s) => s === 200 || s === 204,
    });
    if (r.status === 204) return null;
    return r.data as ContinueReading;
  },
  stats: () => api.get<UserStats>('/me/stats').then((r) => r.data),
};
