import { DRIZZLE } from '@/modules/db/db.provider';
import { assertQueueCapacity } from '@/modules/queue/queue-capacity';
import {
  type DiscoverChaptersJobData,
  type ImportStoryJobData,
  JOB_DISCOVER_CHAPTERS,
  JOB_FETCH_CHAPTER,
  JOB_IMPORT_STORY,
  JOB_PRIORITY,
  QUEUE_CRAWLER,
} from '@/modules/queue/queue.constants';
import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resolveAdapterForUrl } from '@smanga/crawler';
import type { Database } from '@smanga/db';
import { chapter, genre, story, storyGenre, storySource } from '@smanga/db/schema';
import type { Queue } from 'bull';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';

const BULK_IMPORT_CAP = 50;

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

@Injectable()
export class StoriesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  async storageStats() {
    // content_text is gzipped bytea (see CLAUDE.md note 11), so octet_length on
    // it returns the COMPRESSED size — useless for a "library size" display.
    // content_byte_size stores the UNCOMPRESSED length explicitly for stats.
    const result = await this.db.execute(sql`
      SELECT
        COALESCE(SUM(content_byte_size), 0)::bigint AS content_bytes,
        COUNT(*) FILTER (WHERE content_text IS NOT NULL)::bigint AS chapters_with_content
      FROM chapter
    `);
    const coverResult = await this.db.execute(sql`
      SELECT
        COALESCE(SUM(octet_length(cover)), 0)::bigint AS cover_bytes,
        COUNT(*) FILTER (WHERE cover IS NOT NULL)::bigint AS stories_with_cover,
        COALESCE(SUM(total_chapters), 0)::bigint AS chapter_target_total
      FROM story
    `);
    const chapterRow =
      (result as unknown as { rows: Array<Record<string, string | number>> }).rows?.[0] ??
      (result as unknown as Array<Record<string, string | number>>)[0];
    const coverRow =
      (coverResult as unknown as { rows: Array<Record<string, string | number>> }).rows?.[0] ??
      (coverResult as unknown as Array<Record<string, string | number>>)[0];
    const contentBytes = Number(chapterRow?.content_bytes ?? 0);
    const coverBytes = Number(coverRow?.cover_bytes ?? 0);
    return {
      contentBytes,
      coverBytes,
      totalBytes: contentBytes + coverBytes,
      chaptersWithContent: Number(chapterRow?.chapters_with_content ?? 0),
      storiesWithCover: Number(coverRow?.stories_with_cover ?? 0),
      chapterTargetTotal: Number(coverRow?.chapter_target_total ?? 0),
    };
  }

  async count(
    genreSlug?: string,
    discoveryStatus?: 'complete' | 'stub',
    q?: string,
  ): Promise<{ total: number }> {
    // `discovery_status` enum: 'pending' | 'running' | 'complete' | 'failed'.
    // 'stub' = anything not yet complete (everything except 'complete').
    const discoveryFilter =
      discoveryStatus === 'complete'
        ? sql`AND s.discovery_status = 'complete'`
        : discoveryStatus === 'stub'
          ? sql`AND s.discovery_status <> 'complete'`
          : sql``;
    // Vietnamese-friendly free-text search via the GIN trigram index on
    // immutable_unaccent(lower(title || ' ' || author)) — see CLAUDE.md
    // hard-won workaround #13.
    const qFilter = q
      ? sql`AND immutable_unaccent(lower(s.title || ' ' || COALESCE(s.author,'')))
            ILIKE '%' || immutable_unaccent(lower(${q})) || '%'`
      : sql``;

    if (genreSlug) {
      const r = await this.db.execute<{ c: string }>(sql`
        SELECT COUNT(DISTINCT s.id)::int AS c
        FROM story s
        INNER JOIN story_genre sg ON sg.story_id = s.id
        INNER JOIN genre g        ON g.id = sg.genre_id AND g.slug = ${genreSlug}
        WHERE 1=1 ${discoveryFilter} ${qFilter}
      `);
      const arr = rowsOf<{ c: string | number }>(r);
      return { total: Number(arr[0]?.c ?? 0) };
    }
    const r = await this.db.execute<{ c: string | number }>(sql`
      SELECT COUNT(*)::int AS c FROM story s WHERE 1=1 ${discoveryFilter} ${qFilter}
    `);
    const arr = rowsOf<{ c: string | number }>(r);
    return { total: Number(arr[0]?.c ?? 0) };
  }

  async list(
    page = 1,
    limit = 48,
    genreSlug?: string,
    featuredOnly?: boolean,
    discoveryStatus?: 'complete' | 'stub',
    author?: string,
    q?: string,
  ) {
    const genreJoin = genreSlug
      ? sql`INNER JOIN story_genre sg ON sg.story_id = s.id
            INNER JOIN genre g        ON g.id = sg.genre_id AND g.slug = ${genreSlug}`
      : sql``;

    const featuredFilter = featuredOnly ? sql`AND s.featured = true` : sql``;
    const discoveryFilter =
      discoveryStatus === 'complete'
        ? sql`AND s.discovery_status = 'complete'`
        : discoveryStatus === 'stub'
          ? sql`AND s.discovery_status <> 'complete'`
          : sql``;
    const authorFilter = author ? sql`AND s.author = ${author}` : sql``;
    // Vietnamese-friendly free-text search via the GIN trigram index on
    // immutable_unaccent(lower(title || ' ' || author)) — see CLAUDE.md
    // hard-won workaround #13.
    const qFilter = q
      ? sql`AND immutable_unaccent(lower(s.title || ' ' || COALESCE(s.author,'')))
            ILIKE '%' || immutable_unaccent(lower(${q})) || '%'`
      : sql``;

    const rawRows = await this.db.execute<{
      id: string;
      slug: string;
      title: string;
      author: string | null;
      status: string;
      total_chapters: number;
      has_cover: boolean;
      discovery_status: string;
      discovery_error: string | null;
      discovered_at: string | null;
      updated_at: string;
      view_count: number;
      rating_avg: string | null;
      rating_count: string;
      featured: boolean;
      latest_chapter_index: string | null;
    }>(sql`
      SELECT
        s.id, s.slug, s.title, s.author, s.status,
        s.total_chapters, s.view_count, s.updated_at,
        (s.cover IS NOT NULL)  AS has_cover,
        s.discovery_status, s.discovery_error, s.discovered_at,
        s.featured,
        r.avg                  AS rating_avg,
        COALESCE(r.cnt, 0)     AS rating_count,
        c.latest_chapter_index AS latest_chapter_index
      FROM story s
      ${genreJoin}
      LEFT JOIN (
        SELECT story_id,
               avg(value)::numeric(3,2) AS avg,
               count(*)::int            AS cnt
        FROM rating
        GROUP BY story_id
      ) r ON r.story_id = s.id
      LEFT JOIN (
        SELECT story_id,
               MAX(index) AS latest_chapter_index
        FROM chapter
        WHERE status = 'crawled'
        GROUP BY story_id
      ) c ON c.story_id = s.id
      WHERE 1=1 ${featuredFilter} ${discoveryFilter} ${authorFilter} ${qFilter}
      ORDER BY s.updated_at DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `);

    const arr = rowsOf<{
      id: string;
      slug: string;
      title: string;
      author: string | null;
      status: string;
      total_chapters: number;
      has_cover: boolean;
      discovery_status: string;
      discovery_error: string | null;
      discovered_at: string | null;
      updated_at: string;
      view_count: number;
      rating_avg: string | null;
      rating_count: string;
      featured: boolean;
      latest_chapter_index: string | null;
    }>(rawRows);

    return arr.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      author: row.author ?? null,
      status: row.status,
      totalChapters: Number(row.total_chapters),
      hasCover: Boolean(row.has_cover),
      discoveryStatus: row.discovery_status,
      discoveryError: row.discovery_error ?? null,
      discoveredAt: row.discovered_at ?? null,
      updatedAt: row.updated_at,
      viewCount: Number(row.view_count ?? 0),
      ratingAvg: row.rating_avg != null ? Number(row.rating_avg) : null,
      ratingCount: Number(row.rating_count ?? 0),
      featured: Boolean(row.featured),
      // numeric(10,2) comes back as a string from drizzle/pg. Floor the integer
      // part so the "Ch.N" pill never renders "Ch.47.50". null when no chapter
      // is in 'crawled' status yet — FE hides the pill in that case.
      latestChapterIndex:
        row.latest_chapter_index != null ? Math.floor(Number(row.latest_chapter_index)) : null,
    }));
  }

  async getBySlug(slug: string) {
    const rawRows = await this.db.execute<{
      id: string;
      slug: string;
      title: string;
      author: string | null;
      description: string;
      status: string;
      total_chapters: number;
      has_cover: boolean;
      featured: boolean;
      discovery_status: string;
      discovery_error: string | null;
      discovered_at: string | null;
      updated_at: string;
      view_count: number;
      rating_avg: string | null;
      rating_count: string;
    }>(sql`
      SELECT
        s.id, s.slug, s.title, s.author, s.description, s.status,
        s.total_chapters, s.view_count, s.featured,
        (s.cover IS NOT NULL)  AS has_cover,
        s.discovery_status, s.discovery_error, s.discovered_at, s.updated_at,
        r.avg                  AS rating_avg,
        COALESCE(r.cnt, 0)     AS rating_count
      FROM story s
      LEFT JOIN (
        SELECT story_id,
               avg(value)::numeric(3,2) AS avg,
               count(*)::int            AS cnt
        FROM rating
        GROUP BY story_id
      ) r ON r.story_id = s.id
      WHERE s.slug = ${slug}
      LIMIT 1
    `);

    const arr = rowsOf<{
      id: string;
      slug: string;
      title: string;
      author: string | null;
      description: string;
      status: string;
      total_chapters: number;
      has_cover: boolean;
      featured: boolean;
      discovery_status: string;
      discovery_error: string | null;
      discovered_at: string | null;
      updated_at: string;
      view_count: number;
      rating_avg: string | null;
      rating_count: string;
    }>(rawRows);
    const row = arr[0];
    if (!row) throw new NotFoundException();

    const s = {
      id: row.id,
      slug: row.slug,
      title: row.title,
      author: row.author ?? null,
      description: row.description,
      status: row.status,
      totalChapters: Number(row.total_chapters),
      hasCover: Boolean(row.has_cover),
      featured: Boolean(row.featured),
      discoveryStatus: row.discovery_status,
      discoveryError: row.discovery_error ?? null,
      discoveredAt: row.discovered_at ?? null,
      updatedAt: row.updated_at,
      viewCount: Number(row.view_count ?? 0),
      ratingAvg: row.rating_avg != null ? Number(row.rating_avg) : null,
      ratingCount: Number(row.rating_count ?? 0),
    };

    // Genres + sources — keep existing typed selects
    const genres = await this.db
      .select({ slug: genre.slug, name: genre.name })
      .from(storyGenre)
      .innerJoin(genre, eq(storyGenre.genreId, genre.id))
      .where(eq(storyGenre.storyId, s.id));

    const sources = await this.db.select().from(storySource).where(eq(storySource.storyId, s.id));

    return { ...s, genres, sources };
  }

  async getById(id: string) {
    const [s] = await this.db.select().from(story).where(eq(story.id, id)).limit(1);
    if (!s) throw new NotFoundException();
    return s;
  }

  /** Per-story opt-out for the scheduled auto-refresh job. */
  async setAutoRefresh(id: string, autoRefresh: boolean) {
    const [updated] = await this.db
      .update(story)
      .set({ autoRefresh })
      .where(eq(story.id, id))
      .returning({ id: story.id, autoRefresh: story.autoRefresh });
    if (!updated) throw new NotFoundException();
    return updated;
  }

  /** Mark or unmark a story as featured for the homepage slider. */
  async setFeatured(id: string, featured: boolean) {
    const [updated] = await this.db
      .update(story)
      .set({ featured })
      .where(eq(story.id, id))
      .returning({ id: story.id, featured: story.featured });
    if (!updated) throw new NotFoundException();
    return updated;
  }

  async chapterListBySlug(slug: string, page = 1, pageSize = 50) {
    const [s] = await this.db
      .select({ id: story.id })
      .from(story)
      .where(eq(story.slug, slug))
      .limit(1);
    if (!s) throw new NotFoundException();
    const totalRows = await this.db
      .select({ value: count() })
      .from(chapter)
      .where(eq(chapter.storyId, s.id));
    const total = totalRows[0]?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const items = await this.db
      .select({ index: chapter.index, title: chapter.title, status: chapter.status })
      .from(chapter)
      .where(eq(chapter.storyId, s.id))
      .orderBy(asc(chapter.index))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return { items, page, totalPages, total };
  }

  async listChaptersByStoryId(storyId: string) {
    return this.db
      .select({
        id: chapter.id,
        index: chapter.index,
        title: chapter.title,
        status: chapter.status,
        lastError: chapter.lastError,
        crawledAt: chapter.crawledAt,
        size: chapter.contentByteSize,
      })
      .from(chapter)
      .where(eq(chapter.storyId, storyId))
      .orderBy(asc(chapter.index));
  }

  async enqueueImport(url: string, requestedBy: string | null, autoCrawl = false) {
    try {
      resolveAdapterForUrl(url);
    } catch {
      throw new BadRequestException('no adapter registered for that hostname');
    }
    await assertQueueCapacity(this.queue);
    const payload: ImportStoryJobData = { url, requestedBy, autoCrawl };
    const job = await this.queue.add(JOB_IMPORT_STORY, payload, {
      priority: JOB_PRIORITY.IMPORT_STORY,
    });
    return { jobId: String(job.id) };
  }

  /**
   * Plan 7 bulk metadata-only import. Each URL spawns its own import-story
   * job with skipDiscovery:true so the catalog action bar can fire 1-N
   * imports in one call without each one blocking on a 671-page chapter list.
   * Caps at BULK_IMPORT_CAP to avoid starving the 1 rps token bucket.
   */
  async enqueueImportBulk(urls: string[], requestedBy: string | null, autoCrawl = false) {
    const trimmed = urls.map((u) => u.trim()).filter((u) => u.length > 0);
    const unique = [...new Set(trimmed)];
    if (unique.length === 0) {
      throw new BadRequestException('urls must contain at least one entry');
    }
    if (unique.length > BULK_IMPORT_CAP) {
      throw new BadRequestException(`bulk import cap is ${BULK_IMPORT_CAP} URLs per call`);
    }
    await assertQueueCapacity(this.queue);
    const queued: { url: string; jobId: string }[] = [];
    const skipped: { url: string; reason: string }[] = [];
    for (const url of unique) {
      try {
        resolveAdapterForUrl(url);
      } catch {
        skipped.push({ url, reason: 'no adapter for hostname' });
        continue;
      }
      const payload: ImportStoryJobData = { url, requestedBy, skipDiscovery: true, autoCrawl };
      const job = await this.queue.add(JOB_IMPORT_STORY, payload, {
        priority: JOB_PRIORITY.IMPORT_STORY,
      });
      queued.push({ url, jobId: String(job.id) });
    }
    return { queued, skipped, cap: BULK_IMPORT_CAP, autoCrawl };
  }

  /**
   * Plan 7 chapter-discovery trigger — fires the new discover-chapters job
   * for a metadata-only story. Idempotent via Bull jobId per-story so
   * double-clicking the button doesn't double-enqueue.
   */
  async enqueueDiscoverChapters(storyId: string, requestedBy: string | null, autoCrawl = false) {
    const [s] = await this.db
      .select({
        id: story.id,
        discoveryStatus: story.discoveryStatus,
      })
      .from(story)
      .where(eq(story.id, storyId))
      .limit(1);
    if (!s) throw new NotFoundException();
    if (s.discoveryStatus === 'running') {
      throw new ConflictException('chapter discovery already running for this story');
    }
    await assertQueueCapacity(this.queue);
    const payload: DiscoverChaptersJobData = { storyId, requestedBy, autoCrawl };
    const job = await this.queue.add(JOB_DISCOVER_CHAPTERS, payload, {
      jobId: `discover-chapters:${storyId}`,
      priority: JOB_PRIORITY.DISCOVER_CHAPTERS,
    });
    return { jobId: String(job.id) };
  }

  /**
   * Bulk action over selected story rows on /admin/stories.
   * - 'discover': fire chapter-list discovery for each (skips if discoveryStatus='running')
   * - 'crawl-missing': enqueue fetch-chapter for every pending/failed chapter (skip if discovery not complete)
   * - 'discover-and-crawl': discover first, chain crawl via autoCrawl flag
   * Returns per-story result so the UI can flash success/skip counts.
   */
  async enqueueBulkAction(
    ids: string[],
    action: 'discover' | 'crawl-missing' | 'discover-and-crawl',
    requestedBy: string | null,
  ) {
    if (ids.length === 0) throw new BadRequestException('ids must contain at least one entry');
    if (ids.length > 100) throw new BadRequestException('bulk action cap is 100 stories per call');
    await assertQueueCapacity(this.queue);

    const queued: { storyId: string; jobs: number }[] = [];
    const skipped: { storyId: string; reason: string }[] = [];

    for (const storyId of ids) {
      const [s] = await this.db
        .select({ id: story.id, discoveryStatus: story.discoveryStatus })
        .from(story)
        .where(eq(story.id, storyId))
        .limit(1);
      if (!s) {
        skipped.push({ storyId, reason: 'not found' });
        continue;
      }

      if (action === 'discover' || action === 'discover-and-crawl') {
        if (s.discoveryStatus === 'running') {
          skipped.push({ storyId, reason: 'discovery already running' });
          continue;
        }
        const payload: DiscoverChaptersJobData = {
          storyId,
          requestedBy,
          autoCrawl: action === 'discover-and-crawl',
        };
        await this.queue.add(JOB_DISCOVER_CHAPTERS, payload, {
          jobId: `discover-chapters:${storyId}`,
          priority: JOB_PRIORITY.DISCOVER_CHAPTERS,
        });
        queued.push({ storyId, jobs: 1 });
        continue;
      }

      // 'crawl-missing'
      if (s.discoveryStatus !== 'complete') {
        skipped.push({ storyId, reason: `discovery_status=${s.discoveryStatus}` });
        continue;
      }
      const rows = await this.db
        .select({ id: chapter.id })
        .from(chapter)
        .where(and(eq(chapter.storyId, storyId), inArray(chapter.status, ['pending', 'failed'])));
      for (const r of rows) {
        await this.queue.add(
          JOB_FETCH_CHAPTER,
          { chapterId: r.id },
          { jobId: `fetch-chapter:${r.id}`, priority: JOB_PRIORITY.FETCH_CHAPTER },
        );
      }
      queued.push({ storyId, jobs: rows.length });
    }

    return { queued, skipped };
  }
}
