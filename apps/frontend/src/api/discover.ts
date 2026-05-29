import { api } from '@/lib/api-client';

export type DiscoveryStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface CatalogFeed {
  id: string;
  label: string;
  kind: 'newest' | 'hot' | 'completed' | 'genre' | 'author';
}

export interface FeedsResponse {
  sourceId: string;
  sourceName: string;
  baseUrl: string;
  feeds: CatalogFeed[];
  supportsSearch: boolean;
}

export interface DiscoverItem {
  externalUrl: string;
  externalId: string;
  title: string;
  author: string | null;
  coverThumbUrl: string | null;
  statusLabel: string | null;
  totalChaptersHint: number | null;
  existingStoryId: string | null;
  existingDiscoveryStatus: DiscoveryStatus | null;
}

export interface DiscoverResponse {
  page: number;
  hasNextPage: boolean;
  feedId: string;
  items: DiscoverItem[];
}

export interface BulkImportResponse {
  queued: { url: string; jobId: string }[];
  skipped: { url: string; reason: string }[];
  cap: number;
}

export const discoverApi = {
  feeds: (sourceId: string) =>
    api.get<FeedsResponse>(`/sources/${sourceId}/feeds`).then((r) => r.data),

  browse: (sourceId: string, params: { feed?: string; page?: number; q?: string }) =>
    api
      .get<DiscoverResponse>(`/sources/${sourceId}/discover`, {
        params: { feed: params.feed, page: params.page, q: params.q },
      })
      .then((r) => r.data),

  importBulk: (urls: string[]) =>
    api.post<BulkImportResponse>('/stories/import-bulk', { urls }).then((r) => r.data),

  triggerDiscover: (storyId: string) =>
    api.post<{ jobId: string }>(`/stories/${storyId}/discover`).then((r) => r.data),
};
