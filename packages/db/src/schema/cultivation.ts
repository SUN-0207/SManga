import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth.ts';

export const userCultivation = pgTable('user_cultivation', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  xp: bigint('xp', { mode: 'number' }).notNull().default(0),
  linhThach: bigint('linh_thach', { mode: 'number' }).notNull().default(0),
  tienNgoc: bigint('tien_ngoc', { mode: 'number' }).notNull().default(0),
  checkinStreak: integer('checkin_streak').notNull().default(0),
  lastCheckinDate: text('last_checkin_date'), // 'YYYY-MM-DD' in Asia/Ho_Chi_Minh
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chapterReadAward = pgTable(
  'chapter_read_award',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id').notNull(),
    chapterIndexInt: integer('chapter_index_int').notNull(),
    dwellSeconds: integer('dwell_seconds').notNull().default(0),
    rewardedAt: timestamp('rewarded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.storyId, t.chapterIndexInt] }) }),
);

export const rewardLedger = pgTable(
  'reward_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    source: text('source').notNull(), // 'read' | 'checkin' | 'tang' | 'breakthrough' | 'welcome'
    currency: text('currency').notNull(), // 'tu_vi' | 'linh_thach' | 'tien_ngoc'
    amount: bigint('amount', { mode: 'number' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index('reward_ledger_user_created_idx').on(t.userId, t.createdAt.desc()),
  }),
);

export type UserCultivation = typeof userCultivation.$inferSelect;
