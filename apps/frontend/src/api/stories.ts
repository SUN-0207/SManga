import { api } from '@/lib/api-client';
import type { DiscoveryStatus } from './discover';

export interface StorySummary {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: 'ongoing' | 'completed' | 'dropped' | 'unknown';
  totalChapters: number;
  hasCover: boolean;
  updatedAt: string;
  /** Plan 7: 'pending' (stub) → 'running' → 'complete' → 'failed'. */
  discoveryStatus: DiscoveryStatus;
  discoveryError: string | null;
  discoveredAt: string | null;
}

export async function listStories(page = 1, limit = 48): Promise<StorySummary[]> {
  const res = await api.get<StorySummary[]>('/stories', { params: { page, limit } });
  return res.data;
}

export interface StoryDetail extends StorySummary {
  description: string;
  genres: { slug: string; name: string }[];
  sources: { sourceId: string; externalUrl: string; isPrimary: boolean }[];
}

export async function getStoryBySlug(slug: string): Promise<StoryDetail> {
  const res = await api.get<StoryDetail>(`/stories/by-slug/${slug}`);
  return res.data;
}

export interface ChapterListResponse {
  items: { index: string; title: string; status: string }[];
  page: number;
  totalPages: number;
  total: number;
}

export async function listChapters(slug: string, page = 1, pageSize = 50): Promise<ChapterListResponse> {
  const res = await api.get<ChapterListResponse>(`/stories/by-slug/${slug}/chapters`, {
    params: { page, pageSize },
  });
  return res.data;
}

export interface StorageStats {
  contentBytes: number;
  coverBytes: number;
  totalBytes: number;
  chaptersWithContent: number;
  storiesWithCover: number;
}

export async function getStorageStats(): Promise<StorageStats> {
  const res = await api.get<StorageStats>('/stories/storage-stats');
  return res.data;
}
