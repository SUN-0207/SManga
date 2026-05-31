import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { resolveAdapterForUrl } from '@smanga/crawler';
import { chapter, genre, story, storyGenre, storySource } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_DISCOVER_CHAPTERS,
  JOB_FETCH_CHAPTER,
  JOB_IMPORT_STORY,
  QUEUE_CRAWLER,
  type DiscoverChaptersJobData,
  type ImportStoryJobData,
} from '@/modules/queue/queue.constants';

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
    const result = await this.db.execute(sql`
      SELECT
        COALESCE(SUM(octet_length(content_text)), 0)::bigint AS content_bytes,
        COUNT(*) FILTER (WHERE content_text IS NOT NULL)::bigint AS chapters_with_content
      FROM chapter
    `);
    const coverResult = await this.db.execute(sql`
      SELECT
        COALESCE(SUM(octet_length(cover)), 0)::bigint AS cover_bytes,
        COUNT(*) FILTER (WHERE cover IS NOT NULL)::bigint AS stories_with_cover
      FROM story
    `);
    const chapterRow = (result as unknown as { rows: Array<Record<string, string | number>> })
      .rows?.[0] ?? (result as unknown as Array<Record<string, string | number>>)[0];
    const coverRow = (coverResult as unknown as { rows: Array<Record<string, string | number>> })
      .rows?.[0] ?? (coverResult as unknown as Array<Record<string, string | number>>)[0];
    const contentBytes = Number(chapterRow?.content_bytes ?? 0);
    const coverBytes = Number(coverRow?.cover_bytes ?? 0);
    return {
      contentBytes,
      coverBytes,
      totalBytes: contentBytes + coverBytes,
      chaptersWithContent: Number(chapterRow?.chapters_with_content ?? 0),
      storiesWithCover: Number(coverRow?.stories_with_cover ?? 0),
    };
  }

  async list(page = 1, limit = 48) {
    const rawRows = await this.db.execute<{
      id: string; slug: string; title: string; author: string | null;
      status: string; total_chapters: number; has_cover: boolean;
      discovery_status: string; discovery_error: string | null;
      discovered_at: string | null; updated_at: string;
      view_count: number; rating_avg: string | null; rating_count: string;
    }>(sql`
      SELECT
        s.id, s.slug, s.title, s.author, s.status,
        s.total_chapters, s.view_count, s.updated_at,
        (s.cover IS NOT NULL)  AS has_cover,
        s.discovery_status, s.discovery_error, s.discovered_at,
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
      ORDER BY s.updated_at DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `);

    const arr = rowsOf<{
      id: string; slug: string; title: string; author: string | null;
      status: string; total_chapters: number; has_cover: boolean;
      discovery_status: string; discovery_error: string | null;
      discovered_at: string | null; updated_at: string;
      view_count: number; rating_avg: string | null; rating_count: string;
    }>(rawRows);

    return arr.map((row) => ({
      id:             row.id,
      slug:           row.slug,
      title:          row.title,
      author:         row.author ?? null,
      status:         row.status,
      totalChapters:  Number(row.total_chapters),
      hasCover:       Boolean(row.has_cover),
      discoveryStatus: row.discovery_status,
      discoveryError: row.discovery_error ?? null,
      discoveredAt:   row.discovered_at ?? null,
      updatedAt:      row.updated_at,
      viewCount:      Number(row.view_count ?? 0),
      ratingAvg:      row.rating_avg != null ? Number(row.rating_avg) : null,
      ratingCount:    Number(row.rating_count ?? 0),
    }));
  }

  async getBySlug(slug: string) {
    const rawRows = await this.db.execute<{
      id: string; slug: string; title: string; author: string | null;
      description: string; status: string; total_chapters: number;
      has_cover: boolean; discovery_status: string; discovery_error: string | null;
      discovered_at: string | null; view_count: number;
      rating_avg: string | null; rating_count: string;
    }>(sql`
      SELECT
        s.id, s.slug, s.title, s.author, s.description, s.status,
        s.total_chapters, s.view_count,
        (s.cover IS NOT NULL)  AS has_cover,
        s.discovery_status, s.discovery_error, s.discovered_at,
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
      id: string; slug: string; title: string; author: string | null;
      description: string; status: string; total_chapters: number;
      has_cover: boolean; discovery_status: string; discovery_error: string | null;
      discovered_at: string | null; view_count: number;
      rating_avg: string | null; rating_count: string;
    }>(rawRows);
    if (arr.length === 0) throw new NotFoundException();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const row = arr[0]!;

    const s = {
      id:             row.id,
      slug:           row.slug,
      title:          row.title,
      author:         row.author ?? null,
      description:    row.description,
      status:         row.status,
      totalChapters:  Number(row.total_chapters),
      hasCover:       Boolean(row.has_cover),
      discoveryStatus: row.discovery_status,
      discoveryError: row.discovery_error ?? null,
      discoveredAt:   row.discovered_at ?? null,
      viewCount:      Number(row.view_count ?? 0),
      ratingAvg:      row.rating_avg != null ? Number(row.rating_avg) : null,
      ratingCount:    Number(row.rating_count ?? 0),
    };

    // Genres + sources — keep existing typed selects
    const genres = await this.db
      .select({ slug: genre.slug, name: genre.name })
      .from(storyGenre)
      .innerJoin(genre, eq(storyGenre.genreId, genre.id))
      .where(eq(storyGenre.storyId, s.id));

    const sources = await this.db
      .select()
      .from(storySource)
      .where(eq(storySource.storyId, s.id));

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

  async enqueueImport(url: string, requestedBy: string | null) {
    try {
      resolveAdapterForUrl(url);
    } catch {
      throw new BadRequestException('no adapter registered for that hostname');
    }
    const payload: ImportStoryJobData = { url, requestedBy };
    const job = await this.queue.add(JOB_IMPORT_STORY, payload);
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
      const job = await this.queue.add(JOB_IMPORT_STORY, payload);
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
    const payload: DiscoverChaptersJobData = { storyId, requestedBy, autoCrawl };
    const job = await this.queue.add(JOB_DISCOVER_CHAPTERS, payload, {
      jobId: `discover-chapters:${storyId}`,
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
          { jobId: `fetch-chapter:${r.id}` },
        );
      }
      queued.push({ storyId, jobs: rows.length });
    }

    return { queued, skipped };
  }
}
