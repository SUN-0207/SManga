import { api } from '@/lib/api-client';

export interface RatingAggregate {
  avg: number | null;
  count: number;
  mine: 1 | 2 | 3 | 4 | 5 | null;
}

export const engagementApi = {
  /** GET /ratings/story/:storyId — mine is null for anonymous callers */
  getRating: (storyId: string): Promise<RatingAggregate> =>
    api.get<RatingAggregate>(`/ratings/story/${storyId}`).then((r) => r.data),

  /** PUT /ratings/story/:storyId { value } — requires auth; upserts */
  upsertRating: (storyId: string, value: 1 | 2 | 3 | 4 | 5): Promise<RatingAggregate> =>
    api.put<RatingAggregate>(`/ratings/story/${storyId}`, { value }).then((r) => r.data),

  /** DELETE /ratings/story/:storyId — requires auth; idempotent */
  deleteRating: (storyId: string): Promise<RatingAggregate> =>
    api.delete<RatingAggregate>(`/ratings/story/${storyId}`).then((r) => r.data),
};
