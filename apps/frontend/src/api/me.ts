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

export interface ReadingSpeed {
  wordsPerMinute: number;
  chaptersRead: number;
  totalReadingSeconds: number;
  sampleSize: number;
}

export interface ReadingEta {
  remainingChapters: number;
  currentChapter: number;
  totalChapters: number;
  estimatedMinutes: number;
  wpmUsed: number;
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
  /**
   * GET /me/stats/reading-speed
   * Returns heuristic reading speed based on 1500 words/chapter average.
   * wordsPerMinute === 0 means insufficient data (<60 s or <1 chapter read).
   */
  getReadingSpeed: () => api.get<ReadingSpeed>('/me/stats/reading-speed').then((r) => r.data),
  /**
   * GET /me/stats/reading-eta?storyId=:uuid
   * Returns ETA for the given story, or null (HTTP 200 with null body) when
   * the user has no progress or has already finished the story.
   */
  getReadingEta: (storyId: string) =>
    api
      .get<ReadingEta | null>('/me/stats/reading-eta', { params: { storyId } })
      .then((r) => r.data),
};
