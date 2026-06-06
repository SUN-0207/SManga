import { DRIZZLE } from '@/modules/db/db.provider';
// apps/api/src/modules/rankings/rankings.service.ts
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { sql } from 'drizzle-orm';

/**
 * postgres-js db.execute() returns the row array directly (postgres.RowList).
 * node-postgres wraps it in { rows: T[] }. This helper normalises both.
 */
const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

export interface RankItem {
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
  rank: number;
  metric: number;
}

export interface RankPage {
  items: RankItem[];
  page: number;
  limit: number;
  total: number;
}

// Internal raw row shapes returned by Postgres
// Index signature `[key: string]: unknown` is required by drizzle's db.execute<T> constraint.
type HotRow = {
  [key: string]: unknown;
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: string;
  total_chapters: string;
  view_count: string;
  has_cover: boolean;
  updated_at: string;
  weekly_readers: string;
};

type ViewsRow = {
  [key: string]: unknown;
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: string;
  total_chapters: string;
  view_count: string;
  has_cover: boolean;
  updated_at: string;
  rating_avg: string | null;
  rating_count: string;
};

type RatingRow = {
  [key: string]: unknown;
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: string;
  total_chapters: string;
  view_count: string;
  has_cover: boolean;
  updated_at: string;
  rating_avg: string;
  rating_count: string;
};

type CompletedRow = {
  [key: string]: unknown;
  id: string;
  slug: string;
  title: string;
  author: string | null;
  status: string;
  total_chapters: string;
  view_count: string;
  has_cover: boolean;
  updated_at: string;
  rating_avg: string | null;
  rating_count: string;
};

type CountRow = {
  [key: string]: unknown;
  cnt: string;
};

@Injectable()
export class RankingsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // -------------------------------------------------------------------------
  // Hot tuần này — top 50 fixed, no pagination, metric = COUNT(DISTINCT user_id)
  // -------------------------------------------------------------------------

  async getHot(limit: number): Promise<RankPage> {
    const raw = await this.db.execute<HotRow>(sql`
      SELECT
        s.id,
        s.slug,
        s.title,
        s.author,
        s.status,
        s.total_chapters,
        s.view_count,
        (s.cover IS NOT NULL) AS has_cover,
        s.updated_at,
        COUNT(DISTINCT rp.user_id) AS weekly_readers
      FROM story s
      INNER JOIN reading_progress rp ON rp.story_id = s.id
      WHERE rp.updated_at > now() - INTERVAL '7 days'
      GROUP BY s.id
      ORDER BY weekly_readers DESC, s.updated_at DESC, s.id ASC
      LIMIT ${limit}
    `);

    const rows = rowsOf<HotRow>(raw);
    const items: RankItem[] = rows.map((r, i) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      author: r.author,
      status: r.status as RankItem['status'],
      totalChapters: Number(r.total_chapters ?? 0),
      hasCover: Boolean(r.has_cover),
      updatedAt: String(r.updated_at),
      viewCount: Number(r.view_count ?? 0),
      ratingAvg: null,
      ratingCount: 0,
      rank: 1 + i, // offset is always 0 for hot
      metric: Number(r.weekly_readers ?? 0),
    }));

    // NOTE: For hot, total = items returned (max limit); it is NOT the count of all
    // stories active in the last 7 days. Do NOT use hot's total to build pagination —
    // the isHot guard in BangXepHangPage (Task 8) hard-codes totalPages = 1.
    return { items, page: 1, limit, total: items.length };
  }

  // -------------------------------------------------------------------------
  // Lượt xem all-time — paginated, metric = view_count
  // -------------------------------------------------------------------------

  async getViews(page: number, limit: number): Promise<RankPage> {
    const offset = (page - 1) * limit;

    const [raw, countRaw] = await Promise.all([
      this.db.execute<ViewsRow>(sql`
        SELECT
          s.id,
          s.slug,
          s.title,
          s.author,
          s.status,
          s.total_chapters,
          s.view_count,
          (s.cover IS NOT NULL) AS has_cover,
          s.updated_at,
          r.avg AS rating_avg,
          COALESCE(r.cnt, 0)::int AS rating_count
        FROM story s
        LEFT JOIN (
          SELECT story_id, avg(value)::numeric(3,2) AS avg, count(*)::int AS cnt
          FROM rating
          GROUP BY story_id
        ) r ON r.story_id = s.id
        ORDER BY s.view_count DESC, s.updated_at DESC, s.id ASC
        LIMIT ${limit} OFFSET ${offset}
      `),
      this.db.execute<CountRow>(sql`SELECT COUNT(*)::int AS cnt FROM story`),
    ]);

    const rows = rowsOf<ViewsRow>(raw);
    const total = Number(rowsOf<CountRow>(countRaw)[0]?.cnt ?? 0);

    const items: RankItem[] = rows.map((r, i) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      author: r.author,
      status: r.status as RankItem['status'],
      totalChapters: Number(r.total_chapters ?? 0),
      hasCover: Boolean(r.has_cover),
      updatedAt: String(r.updated_at),
      viewCount: Number(r.view_count ?? 0),
      ratingAvg: r.rating_avg != null ? Number(r.rating_avg) : null,
      ratingCount: Number(r.rating_count ?? 0),
      rank: 1 + offset + i,
      metric: Number(r.view_count ?? 0),
    }));

    return { items, page, limit, total };
  }

  // -------------------------------------------------------------------------
  // Điểm đánh giá cao — paginated, HAVING count >= 3, metric = avg rating
  // -------------------------------------------------------------------------

  async getRating(page: number, limit: number): Promise<RankPage> {
    const offset = (page - 1) * limit;

    const [raw, countRaw] = await Promise.all([
      this.db.execute<RatingRow>(sql`
        SELECT
          s.id,
          s.slug,
          s.title,
          s.author,
          s.status,
          s.total_chapters,
          s.view_count,
          (s.cover IS NOT NULL) AS has_cover,
          s.updated_at,
          r.avg AS rating_avg,
          r.cnt AS rating_count
        FROM story s
        INNER JOIN (
          SELECT story_id, avg(value)::numeric(3,2) AS avg, count(*)::int AS cnt
          FROM rating
          GROUP BY story_id
          HAVING count(*) >= 3
        ) r ON r.story_id = s.id
        ORDER BY r.avg DESC, r.cnt DESC, s.id ASC
        LIMIT ${limit} OFFSET ${offset}
      `),
      this.db.execute<CountRow>(sql`
        SELECT COUNT(*)::int AS cnt
        FROM (
          SELECT story_id
          FROM rating
          GROUP BY story_id
          HAVING count(*) >= 3
        ) qualified
      `),
    ]);

    const rows = rowsOf<RatingRow>(raw);
    const total = Number(rowsOf<CountRow>(countRaw)[0]?.cnt ?? 0);

    const items: RankItem[] = rows.map((r, i) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      author: r.author,
      status: r.status as RankItem['status'],
      totalChapters: Number(r.total_chapters ?? 0),
      hasCover: Boolean(r.has_cover),
      updatedAt: String(r.updated_at),
      viewCount: Number(r.view_count ?? 0),
      ratingAvg: Number(r.rating_avg),
      ratingCount: Number(r.rating_count ?? 0),
      rank: 1 + offset + i,
      metric: Number(r.rating_avg),
    }));

    return { items, page, limit, total };
  }

  // -------------------------------------------------------------------------
  // Mới hoàn thành — paginated, WHERE status='completed', metric = total_chapters
  // -------------------------------------------------------------------------

  async getCompleted(page: number, limit: number): Promise<RankPage> {
    const offset = (page - 1) * limit;

    const [raw, countRaw] = await Promise.all([
      this.db.execute<CompletedRow>(sql`
        SELECT
          s.id,
          s.slug,
          s.title,
          s.author,
          s.status,
          s.total_chapters,
          s.view_count,
          (s.cover IS NOT NULL) AS has_cover,
          s.updated_at,
          r.avg AS rating_avg,
          COALESCE(r.cnt, 0)::int AS rating_count
        FROM story s
        LEFT JOIN (
          SELECT story_id, avg(value)::numeric(3,2) AS avg, count(*)::int AS cnt
          FROM rating
          GROUP BY story_id
        ) r ON r.story_id = s.id
        WHERE s.status = 'completed'
        ORDER BY s.updated_at DESC, s.id ASC
        LIMIT ${limit} OFFSET ${offset}
      `),
      this.db.execute<CountRow>(sql`
        SELECT COUNT(*)::int AS cnt FROM story WHERE status = 'completed'
      `),
    ]);

    const rows = rowsOf<CompletedRow>(raw);
    const total = Number(rowsOf<CountRow>(countRaw)[0]?.cnt ?? 0);

    const items: RankItem[] = rows.map((r, i) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      author: r.author,
      status: r.status as RankItem['status'],
      totalChapters: Number(r.total_chapters ?? 0),
      hasCover: Boolean(r.has_cover),
      updatedAt: String(r.updated_at),
      viewCount: Number(r.view_count ?? 0),
      ratingAvg: r.rating_avg != null ? Number(r.rating_avg) : null,
      ratingCount: Number(r.rating_count ?? 0),
      rank: 1 + offset + i,
      metric: Number(r.total_chapters ?? 0),
    }));

    return { items, page, limit, total };
  }
}
