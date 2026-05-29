import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { bookmark, story } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';

@Injectable()
export class BookmarksService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(userId: string) {
    return this.db
      .select({
        storyId: bookmark.storyId,
        createdAt: bookmark.createdAt,
        slug: story.slug,
        title: story.title,
        author: story.author,
        status: story.status,
        totalChapters: story.totalChapters,
      })
      .from(bookmark)
      .innerJoin(story, eq(story.id, bookmark.storyId))
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
