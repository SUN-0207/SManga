import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { storyDiscoveryStatusEnum, storySourceStatusEnum, storyStatusEnum } from './enums.ts';
import { source } from './source.ts';

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea';
  },
});

export const story = pgTable(
  'story',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    author: text('author'),
    description: text('description').notNull().default(''),
    cover: bytea('cover'),
    coverMimeType: text('cover_mime_type'),
    status: storyStatusEnum('status').notNull().default('unknown'),
    totalChapters: integer('total_chapters').notNull().default(0),
    lastChapterAt: timestamp('last_chapter_at', { withTimezone: true }),
    discoveryStatus: storyDiscoveryStatusEnum('discovery_status').notNull().default('pending'),
    discoveryError: text('discovery_error'),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }),
    /** If false, scheduled refresh skips this story (operator opt-out per-row). */
    autoRefresh: boolean('auto_refresh').notNull().default(true),
    /** If true, this story is highlighted in the featured slider on the homepage. */
    featured: boolean('featured').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    viewCount: integer('view_count').notNull().default(0),
    /** High-water mark of the last CRAWLED chapter index we've sent new-chapter
     *  notifications for. NULL = not yet baselined (the sweep baselines without
     *  notifying, so a fresh import never blasts its backlog). */
    lastNotifiedChapterIndex: numeric('last_notified_chapter_index', { precision: 10, scale: 2 }),
  },
  (t) => ({
    searchIdx: index('story_search_idx').using(
      'gin',
      sql`immutable_unaccent(lower(${t.title} || ' ' || coalesce(${t.author}, ''))) gin_trgm_ops`,
    ),
    lastChapterIdx: index('story_last_chapter_idx').on(t.lastChapterAt),
    // Serves the public list's ORDER BY updated_at DESC LIMIT N top-N.
    updatedAtIdx: index('story_updated_at_idx').on(t.updatedAt.desc()),
  }),
);

export const storySource = pgTable(
  'story_source',
  {
    storyId: uuid('story_id')
      .notNull()
      .references(() => story.id, { onDelete: 'cascade' }),
    sourceId: text('source_id')
      .notNull()
      .references(() => source.id, { onDelete: 'restrict' }),
    externalId: text('external_id').notNull(),
    externalUrl: text('external_url').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    status: storySourceStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.storyId, t.sourceId] }),
    externalIdx: uniqueIndex('story_source_external_idx').on(t.sourceId, t.externalId),
  }),
);

export const genre = pgTable('genre', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
});

export const storyGenre = pgTable(
  'story_genre',
  {
    storyId: uuid('story_id')
      .notNull()
      .references(() => story.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genre.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.storyId, t.genreId] }) }),
);

export type Story = typeof story.$inferSelect;
export type NewStory = typeof story.$inferInsert;
export type StorySource = typeof storySource.$inferSelect;
export type NewStorySource = typeof storySource.$inferInsert;
export type Genre = typeof genre.$inferSelect;
