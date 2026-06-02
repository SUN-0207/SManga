import { api } from '@/lib/api-client';

export interface RecommendationItem {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: 'ongoing' | 'completed' | 'dropped' | 'unknown';
  totalChapters: number;
  hasCover: boolean;
  updatedAt: string;
  viewCount: number;
  ratingAvg: number | null;
  ratingCount: number;
  reason: string;
}

export const recommendationsApi = {
  similar: (storyId: string, limit = 8) =>
    api
      .get<{ items: RecommendationItem[] }>('/recommendations/similar', {
        params: { storyId, limit },
      })
      .then((r) => r.data),

  forYou: (limit = 8) =>
    api
      .get<{ items: RecommendationItem[] }>('/me/recommendations', {
        params: { limit },
      })
      .then((r) => r.data),
};
