import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gt, sql, sum } from 'drizzle-orm';
import { bookmark, readingProgress, story } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';

/** Average words per Vietnamese web-novel chapter (heuristic). */
const WORDS_PER_CHAPTER = 1500;
/** Global fallback WPM when user has insufficient reading data. */
const FALLBACK_WPM = 250;

/**
 * postgres-js's `db.execute()` returns the row array directly (a postgres.RowList),
 * NOT `{ rows: T[] }` like the node-postgres adapter does. See
 * `apps/api/src/modules/stories/stories.service.ts:40-43` for the defensive pattern.
 * This helper normalizes both shapes so callers can rely on a plain array.
 */
const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

export interface ReadingSpeed {
  wordsPerMinute: number;
  chaptersRead: number;
  totalReadingSeconds: number;
  sampleSize: number;
}

export interface ReadingEta {
  remainingChapters: number;
  currentChapter: number;
  totalChapters: number;
  estimatedMinutes: number;
  wpmUsed: number;
}

export interface UserStats {
  totalChaptersRead: number;
  libraryCount: number;
  completedCount: number;
  weeklyChapters: number;
  weeklyHours: number;
  streakDays: number;
  dailyChaptersLast7: number[];
}

@Injectable()
export class StatsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getStats(userId: string): Promise<UserStats> {
    const [
      totalChaptersReadRows,
      libraryCountRows,
      completedCountRows,
      weeklyChaptersRows,
      weeklySecondsRows,
      dailyRows,
      streakDays,
    ] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(readingProgress)
        .where(eq(readingProgress.userId, userId)),
      this.db
        .select({ value: count() })
        .from(bookmark)
        .where(eq(bookmark.userId, userId)),
      this.db
        .select({ value: count() })
        .from(readingProgress)
        .innerJoin(story, eq(story.id, readingProgress.storyId))
        .where(
          and(
            eq(readingProgress.userId, userId),
            gt(story.totalChapters, 0),
            sql`${readingProgress.chapterIndex}::numeric >= ${story.totalChapters}`,
          ),
        ),
      this.db
        .select({ value: count() })
        .from(readingProgress)
        .where(
          and(
            eq(readingProgress.userId, userId),
            sql`${readingProgress.updatedAt} > now() - interval '7 days'`,
          ),
        ),
      this.db
        .select({ total: sum(readingProgress.sessionSeconds) })
        .from(readingProgress)
        .where(
          and(
            eq(readingProgress.userId, userId),
            sql`${readingProgress.updatedAt} > now() - interval '7 days'`,
          ),
        ),
      this.db.execute<{ day: string; chapters: number }>(sql`
        WITH days AS (
          SELECT generate_series(
            (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - interval '6 days',
            (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
            interval '1 day'
          )::date AS day
        )
        SELECT
          to_char(d.day, 'YYYY-MM-DD') AS day,
          COALESCE(COUNT(rp.story_id), 0)::int AS chapters
        FROM days d
        LEFT JOIN reading_progress rp
          ON rp.user_id = ${userId}
          AND (rp.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.day
        GROUP BY d.day
        ORDER BY d.day ASC
      `),
      this.computeStreak(userId),
    ]);

    const dailyChaptersLast7 = rowsOf<{ day: string; chapters: number }>(dailyRows)
      .map((r) => Number(r.chapters));

    const totalSeconds = Number(weeklySecondsRows[0]?.total ?? 0);
    const weeklyHours = Math.round((totalSeconds / 3600) * 10) / 10;

    return {
      totalChaptersRead: Number(totalChaptersReadRows[0]?.value ?? 0),
      libraryCount: Number(libraryCountRows[0]?.value ?? 0),
      completedCount: Number(completedCountRows[0]?.value ?? 0),
      weeklyChapters: Number(weeklyChaptersRows[0]?.value ?? 0),
      weeklyHours,
      streakDays,
      dailyChaptersLast7,
    };
  }

  /**
   * Compute user reading speed using a heuristic of 1500 words per chapter.
   * Requires at least 60 cumulative seconds and 1 chapter read to return a
   * meaningful estimate; otherwise wordsPerMinute = 0 (insufficient data).
   */
  async getReadingSpeed(userId: string): Promise<ReadingSpeed> {
    const [chaptersRow, secondsRow] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(readingProgress)
        .where(eq(readingProgress.userId, userId)),
      this.db
        .select({ total: sum(readingProgress.sessionSeconds) })
        .from(readingProgress)
        .where(eq(readingProgress.userId, userId)),
    ]);

    const chaptersRead = Number(chaptersRow[0]?.value ?? 0);
    const totalReadingSeconds = Number(secondsRow[0]?.total ?? 0);

    if (totalReadingSeconds < 60 || chaptersRead < 1) {
      return { wordsPerMinute: 0, chaptersRead, totalReadingSeconds, sampleSize: chaptersRead };
    }

    const totalMinutes = totalReadingSeconds / 60;
    const totalWords = chaptersRead * WORDS_PER_CHAPTER;
    const wordsPerMinute = Math.round(totalWords / totalMinutes);

    return { wordsPerMinute, chaptersRead, totalReadingSeconds, sampleSize: chaptersRead };
  }

  /**
   * Estimate reading time remaining for a user to finish a story.
   * Returns null when the user has no progress on the story or has already
   * reached the last chapter.
   */
  async getReadingEta(userId: string, storyId: string): Promise<ReadingEta | null> {
    const [storyRow, progressRow] = await Promise.all([
      this.db
        .select({ totalChapters: story.totalChapters })
        .from(story)
        .where(eq(story.id, storyId))
        .limit(1),
      this.db
        .select({ chapterIndex: readingProgress.chapterIndex })
        .from(readingProgress)
        .where(and(eq(readingProgress.userId, userId), eq(readingProgress.storyId, storyId)))
        .limit(1),
    ]);

    const storyData = storyRow[0];
    if (!storyData) return null;

    const totalChapters = storyData.totalChapters;
    const progress = progressRow[0];

    // No progress on this story → hide ETA
    if (!progress) return null;

    const currentChapter = Math.floor(Number(progress.chapterIndex));
    const remainingChapters = totalChapters - currentChapter;

    // Already at or past the last chapter
    if (remainingChapters <= 0) return null;

    const speed = await this.getReadingSpeed(userId);
    const wpmUsed = speed.wordsPerMinute > 0 ? speed.wordsPerMinute : FALLBACK_WPM;

    const estimatedMinutes = Math.ceil((remainingChapters * WORDS_PER_CHAPTER) / wpmUsed);

    return { remainingChapters, currentChapter, totalChapters, estimatedMinutes, wpmUsed };
  }

  private async computeStreak(userId: string): Promise<number> {
    const result = await this.db.execute<{ streak: number }>(sql`
      WITH active_days AS (
        SELECT DISTINCT
          (updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day
        FROM reading_progress
        WHERE user_id = ${userId}
      ),
      ordered AS (
        SELECT
          day,
          ROW_NUMBER() OVER (ORDER BY day DESC) AS rn,
          (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today
        FROM active_days
      )
      SELECT COUNT(*)::int AS streak
      FROM ordered
      WHERE day = today - (rn - 1) * interval '1 day'
    `);
    const rows = rowsOf<{ streak: number }>(result);
    return rows.length > 0 ? Number(rows[0]?.streak ?? 0) : 0;
  }
}
