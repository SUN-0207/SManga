import { check, index, pgTable, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
// Internal cross-schema imports MUST use .ts extensions (CLAUDE.md workaround #1)
import { user } from './auth.ts';
import { story } from './story.ts';

export const rating = pgTable(
  'rating',
  {
    userId:    text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    storyId:   uuid('story_id').notNull().references(() => story.id, { onDelete: 'cascade' }),
    value:     smallint('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk:         primaryKey({ columns: [t.userId, t.storyId] }),
    storyIdx:   index('rating_story_idx').on(t.storyId),
    // DB-level safety floor — class-validator is the API-facing guard
    valueCheck: check('rating_value_range', sql`${t.value} BETWEEN 1 AND 5`),
  }),
);

export type Rating    = typeof rating.$inferSelect;
export type NewRating = typeof rating.$inferInsert;
