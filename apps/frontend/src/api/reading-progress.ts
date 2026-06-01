import { api } from '@/lib/api-client';

export interface ReadingProgressRow {
  storyId: string;
  chapterIndex: string;
  updatedAt: string;
  slug: string;
  title: string;
  author: string | null;
  totalChapters: number;
}

export const readingProgressApi = {
  list: () =>
    api.get<ReadingProgressRow[]>('/me/reading-progress').then((r) => r.data),
  upsert: (storyId: string, chapterIndex: number) =>
    api.put('/me/reading-progress', { storyId, chapterIndex }).then((r) => r.data),
  postSession: (storyId: string, chapterIndex: string, seconds: number) =>
    api.post(
      '/me/reading-progress/session',
      { storyId, chapterIndex, seconds },
      { validateStatus: (s) => s === 204 },
    ),
};
