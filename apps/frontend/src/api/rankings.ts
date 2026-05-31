// apps/frontend/src/api/rankings.ts
import { api } from '@/lib/api-client';

export type RankTab = 'hot' | 'views' | 'rating' | 'completed';

export interface RankItem {
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
  rank: number;
  metric: number;
}

export interface RankPage {
  items: RankItem[];
  page: number;
  limit: number;
  total: number;
}

export const rankingsApi = {
  /** Hot tuần này — top-N (max 50) by unique weekly readers. No pagination. */
  hot(limit = 50): Promise<RankPage> {
    return api.get<RankPage>('/rankings/hot', { params: { limit } }).then((r) => r.data);
  },

  /** Lượt xem — all-time view count, paginated. */
  views(page = 1, limit = 50): Promise<RankPage> {
    return api.get<RankPage>('/rankings/views', { params: { page, limit } }).then((r) => r.data);
  },

  /** Điểm đánh giá cao — avg rating (HAVING count >= 3), paginated. */
  rating(page = 1, limit = 50): Promise<RankPage> {
    return api.get<RankPage>('/rankings/rating', { params: { page, limit } }).then((r) => r.data);
  },

  /** Mới hoàn thành — status='completed', ordered by updated_at DESC, paginated. */
  completed(page = 1, limit = 50): Promise<RankPage> {
    return api.get<RankPage>('/rankings/completed', { params: { page, limit } }).then((r) => r.data);
  },
};
