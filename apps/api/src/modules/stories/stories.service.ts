import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { desc, eq, sql, count, asc } from 'drizzle-orm';
import { resolveAdapterForUrl } from '@smanga/crawler';
import { chapter, genre, story, storyGenre, storySource } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  JOB_IMPORT_STORY,
  QUEUE_CRAWLER,
  type ImportStoryJobData,
} from '@/modules/queue/queue.constants';

@Injectable()
export class StoriesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  async list(page = 1, limit = 48) {
    const rows = await this.db
      .select({
        id: story.id,
        slug: story.slug,
        title: story.title,
        author: story.author,
        status: story.status,
        totalChapters: story.totalChapters,
        hasCover: sql<boolean>`${story.cover} IS NOT NULL`,
        updatedAt: story.updatedAt,
      })
      .from(story)
      .orderBy(desc(story.updatedAt))
      .limit(limit)
      .offset((page - 1) * limit);
    return rows;
  }

  async getBySlug(slug: string) {
    const [s] = await this.db
      .select({
        id: story.id,
        slug: story.slug,
        title: story.title,
        author: story.author,
        description: story.description,
        status: story.status,
        totalChapters: story.totalChapters,
        hasCover: sql<boolean>`${story.cover} IS NOT NULL`,
      })
      .from(story)
      .where(eq(story.slug, slug))
      .limit(1);
    if (!s) throw new NotFoundException();

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
}
