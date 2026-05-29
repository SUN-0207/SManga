import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { readingProgress, story } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';

@Injectable()
export class ReadingProgressService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async upsert(userId: string, storyId: string, chapterIndex: number) {
    await this.db
      .insert(readingProgress)
      .values({
        userId,
        storyId,
        chapterIndex: String(chapterIndex),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [readingProgress.userId, readingProgress.storyId],
        set: { chapterIndex: String(chapterIndex), updatedAt: new Date() },
      });
    return { ok: true };
  }

  async list(userId: string) {
    return this.db
      .select({
        storyId: readingProgress.storyId,
        chapterIndex: readingProgress.chapterIndex,
        updatedAt: readingProgress.updatedAt,
        slug: story.slug,
        title: story.title,
        author: story.author,
        totalChapters: story.totalChapters,
      })
      .from(readingProgress)
      .innerJoin(story, sql`${story.id} = ${readingProgress.storyId}::uuid`)
      .where(eq(readingProgress.userId, userId))
      .orderBy(desc(readingProgress.updatedAt));
  }
}
