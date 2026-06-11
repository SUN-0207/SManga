import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { chapterStatusEnum } from './enums.ts';
import { source } from './source.ts';
import { story } from './story.ts';

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea';
  },
});

export const chapter = pgTable(
  'chapter',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .notNull()
      .references(() => story.id, { onDelete: 'cascade' }),
    index: numeric('index', { precision: 10, scale: 2 }).notNull(),
    title: text('title').notNull(),
    contentText: bytea('content_text'),
    contentByteSize: integer('content_byte_size'),
    sourceId: text('source_id')
      .notNull()
      .references(() => source.id, { onDelete: 'restrict' }),
    externalUrl: text('external_url').notNull(),
    crawledAt: timestamp('crawled_at', { withTimezone: true }),
    status: chapterStatusEnum('status').notNull().default('pending'),
    lastError: text('last_error'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    viewCount: integer('view_count').notNull().default(0),
  },
  (t) => ({
    uniqStoryIndex: uniqueIndex('chapter_story_index_uniq').on(t.storyId, t.index),
    // Partial index for "has uncrawled/errored chapters": the needs-crawl
    // EXISTS probe and crawl-missing selects become empty-range index probes
    // instead of heap walks over every chapter of fully-crawled stories.
    needsCrawlIdx: index('chapter_needs_crawl_idx')
      .on(t.storyId)
      .where(sql`${t.status} IN ('pending', 'failed')`),
  }),
);

export type Chapter = typeof chapter.$inferSelect;
export type NewChapter = typeof chapter.$inferInsert;
