import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
// Internal cross-schema imports MUST use .ts extensions (CLAUDE.md workaround #1)
import { user } from './auth.ts';
import { commentTargetTypeEnum } from './enums.ts';
import { story } from './story.ts';

export const comment = pgTable(
  'comment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    targetType: commentTargetTypeEnum('target_type').notNull(),
    targetId: uuid('target_id').notNull(), // NO .references() — polymorphic FK
    parentId: uuid('parent_id').references((): AnyPgColumn => comment.id, { onDelete: 'cascade' }),
    depth: smallint('depth').notNull().default(1),
    body: text('body').notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    depthCheck: check('comment_depth_range', sql`${t.depth} BETWEEN 1 AND 3`),
    targetIdx: index('comment_target_idx').on(t.targetType, t.targetId, t.createdAt.desc()),
    parentIdx: index('comment_parent_idx').on(t.parentId),
    userIdx: index('comment_user_idx').on(t.userId, t.createdAt),
  }),
);

export const commentReaction = pgTable(
  'comment_reaction',
  {
    commentId: uuid('comment_id')
      .notNull()
      .references(() => comment.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull().default('like'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.commentId, t.userId, t.type] }),
  }),
);

export const notification = pgTable(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    sourceCommentId: uuid('source_comment_id').references(() => comment.id, {
      onDelete: 'cascade',
    }),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    // new_chapter notifications: which story updated + the latest crawled index +
    // how many new chapters this (coalesced) row represents. NULL for comment rows.
    storyId: uuid('story_id').references(() => story.id, { onDelete: 'cascade' }),
    chapterIndex: numeric('chapter_index', { precision: 10, scale: 2 }),
    newCount: integer('new_count').notNull().default(1),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // At most ONE unread new_chapter notification per (user, story) — the target
    // of the coalescing ON CONFLICT upsert in the sweep. Once read, a new advance
    // creates a fresh row (the predicate only constrains unread rows).
    newChapterUnreadUniq: uniqueIndex('notification_new_chapter_unread_uniq')
      .on(t.userId, t.storyId)
      .where(sql`type = 'new_chapter' AND read_at IS NULL`),
    // Serves the bell's default (all-notifications) list: WHERE user_id ORDER BY created_at DESC.
    // The unread partial index doesn't cover the non-unread list.
    userCreatedIdx: index('notification_user_created_idx').on(t.userId, t.createdAt.desc()),
  }),
);

export type Comment = typeof comment.$inferSelect;
export type NewComment = typeof comment.$inferInsert;
export type CommentReaction = typeof commentReaction.$inferSelect;
export type Notification = typeof notification.$inferSelect;
