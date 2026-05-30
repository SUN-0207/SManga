import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Singleton settings table. Always exactly one row (enforced via CHECK).
 * Holds runtime-tunable config that admins can change from /admin/settings
 * without a redeploy — currently the scheduled auto-refresh policy.
 */
export const appSetting = pgTable('app_setting', {
  // CHECK (id = 1) — single-row table. Drizzle has no clean CHECK helper, so
  // the migration applies it as raw SQL.
  id: integer('id').primaryKey().default(1),
  autoRefreshEnabled: boolean('auto_refresh_enabled').notNull().default(false),
  autoRefreshCron: text('auto_refresh_cron').notNull().default('0 2 * * *'),
  /** 'ongoing' = only status='ongoing' stories; 'all' = every story with discovery complete. */
  autoRefreshScope: text('auto_refresh_scope').notNull().default('ongoing'),
  autoRefreshConcurrency: integer('auto_refresh_concurrency').notNull().default(5),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastRunCount: integer('last_run_count'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AppSetting = typeof appSetting.$inferSelect;
