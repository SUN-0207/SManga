import { CultivationService } from '@/modules/cultivation/cultivation.service';
import { DRIZZLE } from '@/modules/db/db.provider';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { readingProgress, story } from '@smanga/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { SessionSecondsDto } from './dto/session-seconds.dto';

@Injectable()
export class ReadingProgressService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly cultivation: CultivationService,
  ) {}

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

  async addSession(userId: string, dto: SessionSecondsDto) {
    await this.db
      .insert(readingProgress)
      .values({
        userId,
        storyId: dto.storyId,
        chapterIndex: String(dto.chapterIndex),
        sessionSeconds: dto.seconds,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [readingProgress.userId, readingProgress.storyId],
        set: {
          sessionSeconds: sql`${readingProgress.sessionSeconds} + ${dto.seconds}`,
          chapterIndex: sql`GREATEST(${readingProgress.chapterIndex}, ${String(dto.chapterIndex)}::numeric)`,
          updatedAt: new Date(),
        },
      });
    try {
      await this.cultivation.creditReadingDwell(
        userId,
        dto.storyId,
        Math.floor(dto.chapterIndex),
        dto.seconds,
      );
    } catch {
      // reward must never break progress tracking; the kill-switch + ledger are the source of truth
    }
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
        hasCover: sql<boolean>`${story.cover} IS NOT NULL`,
      })
      .from(readingProgress)
      .innerJoin(story, eq(story.id, readingProgress.storyId))
      .where(eq(readingProgress.userId, userId))
      .orderBy(desc(readingProgress.updatedAt));
  }

  async getContinueReading(userId: string) {
    const rows = await this.db
      .select({
        storyId: readingProgress.storyId,
        storySlug: story.slug,
        storyTitle: story.title,
        hasCover: sql<boolean>`${story.cover} IS NOT NULL`,
        chapterIndex: readingProgress.chapterIndex,
        totalChapters: story.totalChapters,
        updatedAt: readingProgress.updatedAt,
      })
      .from(readingProgress)
      .innerJoin(story, eq(story.id, readingProgress.storyId))
      .where(eq(readingProgress.userId, userId))
      .orderBy(desc(readingProgress.updatedAt))
      .limit(1);
    return rows[0] ?? null;
  }
}
