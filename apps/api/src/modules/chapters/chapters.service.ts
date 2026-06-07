import { gunzipSync } from 'node:zlib';
import { DRIZZLE } from '@/modules/db/db.provider';
import {
  type FetchChapterJobData,
  JOB_FETCH_CHAPTER,
  QUEUE_CRAWLER,
} from '@/modules/queue/queue.constants';
import { InjectQueue } from '@nestjs/bull';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { chapter, story } from '@smanga/db/schema';
import type { Queue } from 'bull';
import { and, asc, desc, eq, gt, inArray, lt } from 'drizzle-orm';
import { CrawlChaptersDto } from './dto/crawl.dto';

@Injectable()
export class ChaptersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue(QUEUE_CRAWLER) private readonly queue: Queue,
  ) {}

  async getChapterContent(slug: string, indexStr: string) {
    const [row] = await this.db
      .select({
        index: chapter.index,
        title: chapter.title,
        content: chapter.contentText,
        status: chapter.status,
        storyId: story.id,
        storySlug: story.slug,
        storyTitle: story.title,
        storyTotalChapters: story.totalChapters,
        chapterId: chapter.id,
        chapterViewCount: chapter.viewCount,
      })
      .from(chapter)
      .innerJoin(story, eq(chapter.storyId, story.id))
      .where(and(eq(story.slug, slug), eq(chapter.index, indexStr)))
      .limit(1);
    if (!row) throw new NotFoundException();

    let text: string | null = null;
    if (row.content && row.content.length > 0) {
      try {
        text = gunzipSync(row.content as Buffer).toString('utf-8');
      } catch {
        text = (row.content as Buffer).toString('utf-8');
      }
    }

    const [prev] = await this.db
      .select({ index: chapter.index, title: chapter.title })
      .from(chapter)
      .where(and(eq(chapter.storyId, row.storyId), lt(chapter.index, row.index)))
      .orderBy(desc(chapter.index))
      .limit(1);

    const [next] = await this.db
      .select({ index: chapter.index, title: chapter.title })
      .from(chapter)
      .where(and(eq(chapter.storyId, row.storyId), gt(chapter.index, row.index)))
      .orderBy(asc(chapter.index))
      .limit(1);

    return {
      story: {
        id: row.storyId,
        slug: row.storySlug,
        title: row.storyTitle,
        totalChapters: row.storyTotalChapters,
      },
      chapter: {
        id: row.chapterId, // UUID string — used by useTrackChapterView
        index: Number(row.index),
        title: row.title,
        content: text,
        isCrawled: row.status === 'crawled' && text !== null,
        viewCount: Number(row.chapterViewCount ?? 0),
      },
      prev: prev ? { index: Number(prev.index), title: prev.title } : null,
      next: next ? { index: Number(next.index), title: next.title } : null,
    };
  }

  async crawl(storyId: string, dto: CrawlChaptersDto) {
    const db = this.db;

    // Plan 7 gate: refuse content-crawl until chapter LIST discovery is complete.
    // Without this we'd happily enqueue 0 fetch-chapter jobs for a metadata-only
    // story and confuse the operator. Surface the precondition explicitly.
    const [storyRow] = await db
      .select({ discoveryStatus: story.discoveryStatus })
      .from(story)
      .where(eq(story.id, storyId))
      .limit(1);
    if (!storyRow) {
      throw new BadRequestException(`story not found: ${storyId}`);
    }
    if (storyRow.discoveryStatus !== 'complete') {
      throw new BadRequestException(
        `chapter list not yet discovered for this story (discovery_status=${storyRow.discoveryStatus}). POST /stories/:id/discover first.`,
      );
    }

    let ids: string[] = [];
    if (dto.mode === 'one') {
      if (!dto.chapterId) throw new BadRequestException('chapterId required for mode=one');
      ids = [dto.chapterId];
    } else if (dto.mode === 'missing') {
      const rows = await db
        .select({ id: chapter.id })
        .from(chapter)
        .where(and(eq(chapter.storyId, storyId), inArray(chapter.status, ['pending', 'failed'])))
        .orderBy(asc(chapter.index));
      ids = rows.map((r) => r.id);
    } else {
      const rows = await db
        .select({ id: chapter.id })
        .from(chapter)
        .where(eq(chapter.storyId, storyId))
        .orderBy(asc(chapter.index));
      ids = rows.map((r) => r.id);
    }
    let enqueued = 0;
    for (const chapterId of ids) {
      const payload: FetchChapterJobData = { chapterId };
      await this.queue.add(JOB_FETCH_CHAPTER, payload, {
        jobId: `fetch-chapter:${chapterId}`,
      });
      enqueued += 1;
    }
    return { enqueued, total: ids.length };
  }
}
