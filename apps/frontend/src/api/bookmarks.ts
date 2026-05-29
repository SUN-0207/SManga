import { api } from '@/lib/api-client';

export interface BookmarkRow {
  storyId: string;
  slug: string;
  title: string;
  author: string | null;
  status: string;
  totalChapters: number;
  createdAt: string;
}

export const bookmarksApi = {
  list: () => api.get<BookmarkRow[]>('/me/bookmarks').then((r) => r.data),
  has: (storyId: string) =>
    api.get<{ bookmarked: boolean }>(`/me/bookmarks/${storyId}`).then((r) => r.data),
  add: (storyId: string) => api.post('/me/bookmarks', { storyId }).then((r) => r.data),
  remove: (storyId: string) => api.delete(`/me/bookmarks/${storyId}`).then((r) => r.data),
};
