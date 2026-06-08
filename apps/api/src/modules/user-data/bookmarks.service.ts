import { DRIZZLE } from '@/modules/db/db.provider';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { bookmark, rating, story } from '@smanga/db/schema';
import { and, count, desc, eq, sql } from 'drizzle-orm';

@Injectable()
export class BookmarksService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(userId: string) {
    // Subquery: rating aggregate per story, joined as lateral equivalent via CTE-style join.
    // Drizzle sq() lets us define it inline.
    const ratingAgg = this.db
      .select({
        storyId: rating.storyId,
        ratingAvg: sql<number | null>`avg(${rating.value})::numeric(3,2)`.as('rating_avg'),
        ratingCount: count(rating.storyId).as('rating_count'),
      })
      .from(rating)
      .groupBy(rating.storyId)
      .as('rating_agg');

    return this.db
      .select({
        storyId: bookmark.storyId,
        createdAt: bookmark.createdAt,
        slug: story.slug,
        title: story.title,
        author: story.author,
        status: story.status,
        totalChapters: story.totalChapters,
        viewCount: story.viewCount,
        ratingAvg: ratingAgg.ratingAvg,
        ratingCount: sql<number>`coalesce(${ratingAgg.ratingCount}, 0)`,
        hasCover: sql<boolean>`${story.cover} IS NOT NULL`,
      })
      .from(bookmark)
      .innerJoin(story, eq(story.id, bookmark.storyId))
      .leftJoin(ratingAgg, eq(ratingAgg.storyId, bookmark.storyId))
      .where(eq(bookmark.userId, userId))
      .orderBy(desc(bookmark.createdAt));
  }

  async add(userId: string, storyId: string) {
    await this.db.insert(bookmark).values({ userId, storyId }).onConflictDoNothing();
    return { ok: true };
  }

  async remove(userId: string, storyId: string) {
    await this.db
      .delete(bookmark)
      .where(and(eq(bookmark.userId, userId), eq(bookmark.storyId, storyId)));
    return { ok: true };
  }

  async has(userId: string, storyId: string) {
    const [row] = await this.db
      .select({ storyId: bookmark.storyId })
      .from(bookmark)
      .where(and(eq(bookmark.userId, userId), eq(bookmark.storyId, storyId)))
      .limit(1);
    return { bookmarked: !!row };
  }
}
