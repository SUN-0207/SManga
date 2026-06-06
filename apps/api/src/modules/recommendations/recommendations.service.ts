import { DRIZZLE } from '@/modules/db/db.provider';
// apps/api/src/modules/recommendations/recommendations.service.ts
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { sql } from 'drizzle-orm';

/**
 * postgres-js db.execute() returns the row array directly (postgres.RowList).
 * node-postgres wraps it in { rows: T[] }. This helper normalises both.
 */
const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

export interface RecommendationItem {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: 'ongoing' | 'completed' | 'dropped' | 'unknown';
  totalChapters: number;
  hasCover: boolean;
  updatedAt: string;
  viewCount: number;
  ratingAvg: number | null;
  ratingCount: number;
  reason: string;
}

// Internal raw row shapes
type SimilarRow = {
  [key: string]: unknown;
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: string;
  total_chapters: string;
  has_cover: boolean;
  updated_at: string;
  view_count: string;
  shared_count: string;
  top_shared_genre: string | null;
  rating_avg: string | null;
  rating_count: string;
};

type PopularRow = {
  [key: string]: unknown;
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: string;
  total_chapters: string;
  has_cover: boolean;
  updated_at: string;
  view_count: string;
  rating_avg: string | null;
  rating_count: string;
};

type ForYouRow = {
  [key: string]: unknown;
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: string;
  total_chapters: string;
  has_cover: boolean;
  updated_at: string;
  view_count: string;
  score: string;
  reason_anchor: string | null;
  rating_avg: string | null;
  rating_count: string;
};

@Injectable()
export class RecommendationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ---------------------------------------------------------------------------
  // Similar — content-based by shared genre, public endpoint
  // ---------------------------------------------------------------------------

  async getSimilar(storyId: string, limit: number): Promise<{ items: RecommendationItem[] }> {
    const raw = await this.db.execute<SimilarRow>(sql`
      WITH anchor_genres AS (
        SELECT genre_id FROM story_genre WHERE story_id = ${storyId}
      ),
      ranked AS (
        SELECT
          s.id, s.slug, s.title, s.author, s.status, s.total_chapters,
          (s.cover IS NOT NULL) AS has_cover, s.updated_at,
          s.view_count,
          COUNT(sg.genre_id)::int AS shared_count,
          -- one shared genre name for the reason
          (
            SELECT g.name
            FROM genre g
            JOIN story_genre sg2 ON sg2.genre_id = g.id
            WHERE sg2.story_id = s.id
              AND g.id IN (SELECT genre_id FROM anchor_genres)
            LIMIT 1
          ) AS top_shared_genre,
          r.avg AS rating_avg,
          COALESCE(r.cnt, 0)::int AS rating_count
        FROM story s
        JOIN story_genre sg ON sg.story_id = s.id
        LEFT JOIN (
          SELECT story_id,
                 avg(value)::numeric(3,2) AS avg,
                 count(*)::int            AS cnt
          FROM rating GROUP BY story_id
        ) r ON r.story_id = s.id
        WHERE sg.genre_id IN (SELECT genre_id FROM anchor_genres)
          AND s.id != ${storyId}
        GROUP BY s.id, r.avg, r.cnt
      )
      SELECT * FROM ranked
      ORDER BY shared_count DESC,
               COALESCE(rating_avg, 0) DESC,
               view_count DESC,
               updated_at DESC,
               id ASC
      LIMIT ${limit}
    `);

    const rows = rowsOf<SimilarRow>(raw);

    // Fallback to popular when anchor has no genres or query returns 0 results
    if (rows.length === 0) {
      return this.getSimilarFallback(storyId, limit);
    }

    const items: RecommendationItem[] = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      author: r.author,
      status: r.status as RecommendationItem['status'],
      totalChapters: Number(r.total_chapters ?? 0),
      hasCover: Boolean(r.has_cover),
      updatedAt: String(r.updated_at),
      viewCount: Number(r.view_count ?? 0),
      ratingAvg: r.rating_avg != null ? Number(r.rating_avg) : null,
      ratingCount: Number(r.rating_count ?? 0),
      reason:
        r.top_shared_genre != null ? `Cùng thể loại ${r.top_shared_genre}` : 'Cùng phong cách',
    }));

    return { items };
  }

  private async getSimilarFallback(
    storyId: string,
    limit: number,
  ): Promise<{ items: RecommendationItem[] }> {
    const raw = await this.db.execute<PopularRow>(sql`
      SELECT
        s.id, s.slug, s.title, s.author, s.status, s.total_chapters,
        (s.cover IS NOT NULL) AS has_cover, s.updated_at, s.view_count,
        r.avg AS rating_avg,
        COALESCE(r.cnt, 0)::int AS rating_count
      FROM story s
      LEFT JOIN (
        SELECT story_id,
               avg(value)::numeric(3,2) AS avg,
               count(*)::int            AS cnt
        FROM rating GROUP BY story_id
      ) r ON r.story_id = s.id
      WHERE s.id != ${storyId}
      ORDER BY COALESCE(r.avg, 0) DESC,
               s.view_count DESC,
               s.updated_at DESC,
               s.id ASC
      LIMIT ${limit}
    `);

    const rows = rowsOf<PopularRow>(raw);
    const items: RecommendationItem[] = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      author: r.author,
      status: r.status as RecommendationItem['status'],
      totalChapters: Number(r.total_chapters ?? 0),
      hasCover: Boolean(r.has_cover),
      updatedAt: String(r.updated_at),
      viewCount: Number(r.view_count ?? 0),
      ratingAvg: r.rating_avg != null ? Number(r.rating_avg) : null,
      ratingCount: Number(r.rating_count ?? 0),
      reason: 'Đang được yêu thích',
    }));

    return { items };
  }

  // ---------------------------------------------------------------------------
  // For You — content-based on user history, auth-required endpoint
  // ---------------------------------------------------------------------------

  async getForYou(userId: string, limit: number): Promise<{ items: RecommendationItem[] }> {
    const raw = await this.db.execute<ForYouRow>(sql`
      WITH my_history AS (
        SELECT story_id FROM bookmark         WHERE user_id = ${userId}
        UNION
        SELECT story_id FROM reading_progress WHERE user_id = ${userId}
      ),
      my_genres AS (
        SELECT sg.genre_id,
               COUNT(*)::int AS weight,
               MAX(s.title)  AS sample_title
        FROM story_genre sg
        JOIN story s ON s.id = sg.story_id
        WHERE sg.story_id IN (SELECT story_id FROM my_history)
        GROUP BY sg.genre_id
      ),
      ranked AS (
        SELECT
          s.id, s.slug, s.title, s.author, s.status, s.total_chapters,
          (s.cover IS NOT NULL) AS has_cover, s.updated_at, s.view_count,
          SUM(mg.weight)::int AS score,
          (
            SELECT mg2.sample_title
            FROM story_genre sg2
            JOIN my_genres mg2 ON mg2.genre_id = sg2.genre_id
            WHERE sg2.story_id = s.id
            ORDER BY mg2.weight DESC
            LIMIT 1
          ) AS reason_anchor,
          r.avg AS rating_avg,
          COALESCE(r.cnt, 0)::int AS rating_count
        FROM story s
        JOIN story_genre sg ON sg.story_id = s.id
        JOIN my_genres mg ON mg.genre_id = sg.genre_id
        LEFT JOIN (
          SELECT story_id,
                 avg(value)::numeric(3,2) AS avg,
                 count(*)::int            AS cnt
          FROM rating GROUP BY story_id
        ) r ON r.story_id = s.id
        WHERE NOT EXISTS (
          SELECT 1 FROM my_history mh WHERE mh.story_id = s.id
        )
        GROUP BY s.id, r.avg, r.cnt
      )
      SELECT * FROM ranked
      ORDER BY score DESC,
               COALESCE(rating_avg, 0) DESC,
               view_count DESC,
               updated_at DESC,
               id ASC
      LIMIT ${limit}
    `);

    const rows = rowsOf<ForYouRow>(raw);

    // Per spec: empty history → empty items; NO popular fallback for forYou
    if (rows.length === 0) {
      return { items: [] };
    }

    const items: RecommendationItem[] = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      author: r.author,
      status: r.status as RecommendationItem['status'],
      totalChapters: Number(r.total_chapters ?? 0),
      hasCover: Boolean(r.has_cover),
      updatedAt: String(r.updated_at),
      viewCount: Number(r.view_count ?? 0),
      ratingAvg: r.rating_avg != null ? Number(r.rating_avg) : null,
      ratingCount: Number(r.rating_count ?? 0),
      reason: r.reason_anchor != null ? `Vì anh đã đọc ${r.reason_anchor}` : 'Cùng phong cách',
    }));

    return { items };
  }
}
