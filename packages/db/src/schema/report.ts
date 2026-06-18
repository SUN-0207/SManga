import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
// Internal cross-schema imports MUST use .ts extensions (CLAUDE.md workaround #1)
import { user } from './auth.ts';
import { chapter } from './chapter.ts';
import { reportCategoryEnum, reportStatusEnum } from './enums.ts';
import { story } from './story.ts';

export const report = pgTable(
  'report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    category: reportCategoryEnum('category').notNull(),
    message: text('message').notNull(),
    storyId: uuid('story_id').references(() => story.id, { onDelete: 'set null' }),
    chapterId: uuid('chapter_id').references(() => chapter.id, { onDelete: 'set null' }),
    status: reportStatusEnum('status').notNull().default('open'),
    adminNote: text('admin_note'),
    resolvedByUserId: text('resolved_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Serves the admin list (status filter + newest-first) and the open-count badge.
    statusCreatedIdx: index('report_status_created_idx').on(t.status, t.createdAt.desc()),
    userIdx: index('report_user_idx').on(t.userId),
  }),
);

export type Report = typeof report.$inferSelect;
export type NewReport = typeof report.$inferInsert;
