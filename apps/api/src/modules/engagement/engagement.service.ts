import { DRIZZLE } from '@/modules/db/db.provider';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@smanga/db';
// NOTE: import from the barrel '@smanga/db/schema', NOT from a per-file subpath
// (e.g. NOT '@smanga/db/schema/engagement.js'). The webpack alias in apps/api/webpack.config.js
// maps '@smanga/db/schema' to the barrel index only — subpath imports have no alias and
// will fail at bundle time with module-not-found.
import { rating } from '@smanga/db/schema';
import { sql } from 'drizzle-orm';

/**
 * postgres-js db.execute() returns the row array directly (postgres.RowList).
 * node-postgres wraps it in { rows: T[] }. This helper normalises both.
 */
const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

export interface RatingAggregate {
  avg: number | null;
  count: number;
  mine: number | null;
}

@Injectable()
export class EngagementService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ---------------------------------------------------------------------------
  // View counter increments — fire-and-forget, no return value
  // ---------------------------------------------------------------------------

  async incrementStoryView(storyId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE story SET view_count = view_count + 1 WHERE id = ${storyId}
    `);
  }

  async incrementChapterView(chapterId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE chapter SET view_count = view_count + 1 WHERE id = ${chapterId}
    `);
  }

  // ---------------------------------------------------------------------------
  // Rating aggregate
  // ---------------------------------------------------------------------------

  async getRatingAggregate(storyId: string, userId: string | null): Promise<RatingAggregate> {
    const aggRaw = await this.db.execute<{ avg: string | null; cnt: string }>(sql`
      SELECT avg(value)::numeric(3,2) AS avg, count(*)::int AS cnt
      FROM rating
      WHERE story_id = ${storyId}
    `);
    const agg = rowsOf<{ avg: string | null; cnt: string }>(aggRaw)[0];
    const avg = agg?.avg != null ? Number(agg.avg) : null;
    const count = Number(agg?.cnt ?? 0);

    let mine: number | null = null;
    if (userId) {
      const mineRaw = await this.db.execute<{ value: number }>(sql`
        SELECT value FROM rating
        WHERE user_id = ${userId} AND story_id = ${storyId}
      `);
      const mineRow = rowsOf<{ value: number }>(mineRaw)[0];
      mine = mineRow != null ? Number(mineRow.value) : null;
    }

    return { avg, count, mine };
  }

  // ---------------------------------------------------------------------------
  // Upsert (create or update) a rating — returns fresh aggregate
  // ---------------------------------------------------------------------------

  async upsertRating(storyId: string, userId: string, value: number): Promise<RatingAggregate> {
    await this.db
      .insert(rating)
      .values({ userId, storyId, value })
      .onConflictDoUpdate({
        // Array of column refs is the correct Drizzle syntax for composite conflict targets.
        // Note: Drizzle's and() applies only to .where() boolean conditions, not to conflict targets.
        target: [rating.userId, rating.storyId],
        set: { value, updatedAt: new Date() },
      });
    return this.getRatingAggregate(storyId, userId);
  }

  // ---------------------------------------------------------------------------
  // Delete a rating — idempotent (no 404 if row absent)
  // ---------------------------------------------------------------------------

  async deleteRating(storyId: string, userId: string): Promise<RatingAggregate> {
    await this.db.execute(sql`
      DELETE FROM rating WHERE user_id = ${userId} AND story_id = ${storyId}
    `);
    // mine is always null after delete
    return this.getRatingAggregate(storyId, userId);
  }
}
