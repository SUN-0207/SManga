import { boolean, doublePrecision, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
  /** Kill switch for the dead-letter retry reconciler. Default ON — flip off
   * to instantly disable auto-retry during an incident. */
  autoRetryEnabled: boolean('auto_retry_enabled').notNull().default(true),
  /** Smart auto-crawl backlog drainer. OFF by default (opt-in). */
  autoCrawlEnabled: boolean('auto_crawl_enabled').notNull().default(false),
  /** Max fetch-chapter jobs the feeder keeps queued — the bound that makes it
   * non-disruptive. Clamped [50,2000] in the DTO/service. */
  autoCrawlWatermark: integer('auto_crawl_watermark').notNull().default(500),
  /** Live crawl rate (requests/sec) to the source — tunable at /admin/settings
   *  without a redeploy. Default 4 (probe-verified safe on truyenfull). Clamped
   *  [0.1, 20] in the DTO/service. float8 so sub-1 rps stays expressible. */
  crawlRps: doublePrecision('crawl_rps').notNull().default(4),
  /** Kill switch for the new-chapter notification sweep. Default ON — purely
   *  additive + safe; flip OFF to pause notifications during an incident. */
  newChapterNotifyEnabled: boolean('new_chapter_notify_enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastRunCount: integer('last_run_count'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AppSetting = typeof appSetting.$inferSelect;
