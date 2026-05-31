import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

export interface GenreRow {
  slug: string;
  name: string;
  storyCount: number;
}

@Injectable()
export class GenresService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Returns all genres with their story counts, ordered by story_count DESC
   * then alphabetically. Empty genres are included so admins can spot them.
   */
  async list(): Promise<GenreRow[]> {
    const raw = await this.db.execute<{ slug: string; name: string; story_count: string }>(sql`
      SELECT g.slug, g.name, COUNT(sg.story_id)::int AS story_count
      FROM genre g
      LEFT JOIN story_genre sg ON sg.genre_id = g.id
      GROUP BY g.id, g.slug, g.name
      ORDER BY story_count DESC, g.name ASC
    `);
    return rowsOf<{ slug: string; name: string; story_count: string }>(raw).map((r) => ({
      slug: r.slug,
      name: r.name,
      storyCount: Number(r.story_count ?? 0),
    }));
  }
}
