import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { genre, story, storyGenre } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import type { SearchQueryDto } from './dto/search-query.dto';

@Injectable()
export class SearchService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async search(q: SearchQueryDto) {
    const term = q.q.trim();
    const conditions = [
      sql`immutable_unaccent(lower(${story.title} || ' ' || coalesce(${story.author}, '')))
          ILIKE '%' || immutable_unaccent(lower(${term})) || '%'`,
    ];
    if (q.status) conditions.push(eq(story.status, q.status));

    let qb = this.db
      .select({
        id: story.id,
        slug: story.slug,
        title: story.title,
        author: story.author,
        status: story.status,
        totalChapters: story.totalChapters,
        updatedAt: story.updatedAt,
        hasCover: sql<boolean>`${story.cover} IS NOT NULL`,
        rank: sql<number>`similarity(immutable_unaccent(lower(${story.title})), immutable_unaccent(lower(${term})))`,
      })
      .from(story);

    if (q.genre) {
      qb = qb
        .innerJoin(storyGenre, eq(storyGenre.storyId, story.id))
        .innerJoin(
          genre,
          and(eq(genre.id, storyGenre.genreId), eq(genre.slug, q.genre)),
        ) as unknown as typeof qb;
    }

    const limit = q.limit ?? 24;
    const page = q.page ?? 1;
    const rows = await qb
      .where(and(...conditions))
      .orderBy(
        desc(sql`similarity(immutable_unaccent(lower(${story.title})), immutable_unaccent(lower(${term})))`),
        desc(story.updatedAt),
      )
      .limit(limit)
      .offset((page - 1) * limit);

    return { items: rows, page, limit };
  }
}
