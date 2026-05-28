import { boolean, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const source = pgTable('source', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  rateLimitRps: numeric('rate_limit_rps', { precision: 6, scale: 2 }).notNull().default('1'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Source = typeof source.$inferSelect;
export type NewSource = typeof source.$inferInsert;
