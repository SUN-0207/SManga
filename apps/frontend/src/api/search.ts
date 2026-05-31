import { api } from '@/lib/api-client';
import type { StorySummary } from './stories';

export interface SearchResponse {
  items: (StorySummary & { rank?: number })[];
  page: number;
  limit: number;
  /** Total matching rows (window-function count from BE, single round-trip). */
  total: number;
}

export async function searchStories(
  q: string,
  page = 1,
  genre?: string,
  status?: string,
): Promise<SearchResponse> {
  const res = await api.get<SearchResponse>('/search', { params: { q, page, genre, status } });
  return res.data;
}
