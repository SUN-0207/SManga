import { numeric, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.ts';

export const bookmark = pgTable(
  'bookmark',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.storyId] }) }),
);

export const readingProgress = pgTable(
  'reading_progress',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id').notNull(),
    chapterIndex: numeric('chapter_index', { precision: 10, scale: 2 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.storyId] }) }),
);
