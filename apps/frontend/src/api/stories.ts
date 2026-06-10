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
  /** Plan D: engagement counters. 0 on new stories with no activity yet. */
  viewCount: number;
  ratingAvg: number | null;
  ratingCount: number;
  /** Feature #2: admin-curated featured flag. */
  featured: boolean;
  /** Floor of MAX(chapter.index) WHERE status='crawled'. null when no chapter
   * is crawled yet — UI hides the "Ch.N" pill in that case. */
  latestChapterIndex: number | null;
}

export async function listStories(
  page = 1,
  limit = 48,
  genre?: string,
  featured?: boolean,
  discoveryStatus?: 'complete' | 'stub',
  author?: string,
  q?: string,
): Promise<StorySummary[]> {
  const res = await api.get<StorySummary[]>('/stories', {
    params: {
      page,
      limit,
      ...(genre ? { genre } : {}),
      ...(featured === undefined ? {} : { featured: String(featured) }),
      ...(discoveryStatus ? { discoveryStatus } : {}),
      ...(author ? { author } : {}),
      ...(q ? { q } : {}),
    },
  });
  return res.data;
}

export async function setFeatured(storyId: string, featured: boolean): Promise<void> {
  await api.patch(`/stories/${storyId}/featured`, { featured });
}

export async function getStoriesCount(
  genre?: string,
  discoveryStatus?: 'complete' | 'stub',
  q?: string,
): Promise<number> {
  const res = await api.get<{ total: number }>('/stories/count', {
    params: {
      ...(genre ? { genre } : {}),
      ...(discoveryStatus ? { discoveryStatus } : {}),
      ...(q ? { q } : {}),
    },
  });
  return res.data.total;
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

export async function listChapters(
  slug: string,
  page = 1,
  pageSize = 50,
): Promise<ChapterListResponse> {
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
  /** Sum of story.total_chapters — the discovery TARGET, not the crawled count. */
  chapterTargetTotal: number;
}

export async function getStorageStats(): Promise<StorageStats> {
  const res = await api.get<StorageStats>('/stories/storage-stats');
  return res.data;
}
