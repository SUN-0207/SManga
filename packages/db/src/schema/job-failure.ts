import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const jobFailureClassEnum = pgEnum('job_failure_class', ['transient', 'permanent']);

export const jobFailureStatusEnum = pgEnum('job_failure_status', [
  'pending',
  'retrying',
  'needs_attention',
  'dead',
  'resolved',
]);

/**
 * Postgres-backed dead-letter queue for crawler jobs. One row per unit of
 * underlying work (keyed by `dedupKey`), surviving Redis's removeOnFail
 * trim and process restarts. The retry "brain" — see
 * docs/superpowers/specs/2026-06-10-job-retry-dead-letter-design.md.
 */
export const jobFailure = pgTable(
  'job_failure',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Natural key for the work, e.g. `fetch-chapter:<chapterId>`. Upsert
     * target — repeated failures of the same work update one row. */
    dedupKey: text('dedup_key').notNull(),
    queue: text('queue').notNull().default('crawler'),
    jobName: text('job_name').notNull(),
    /** Exact Bull payload needed to re-enqueue. */
    jobData: jsonb('job_data').notNull(),
    errorClass: text('error_class').notNull(),
    classification: jobFailureClassEnum('classification').notNull(),
    failedReason: text('failed_reason'),
    attemptsMade: integer('attempts_made').notNull().default(0),
    /** Reconciler re-enqueue count. Drives backoff + give-up. */
    retryGeneration: integer('retry_generation').notNull().default(0),
    status: jobFailureStatusEnum('status').notNull(),
    firstFailedAt: timestamp('first_failed_at', { withTimezone: true }).notNull().defaultNow(),
    lastFailedAt: timestamp('last_failed_at', { withTimezone: true }).notNull().defaultNow(),
    /** Reconciler picks rows where status='pending' AND next_retry_at <= now.
     * Null for permanent / dead / resolved. */
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dedupKeyUnique: uniqueIndex('job_failure_dedup_key_unique').on(t.dedupKey),
    // Serves the reconciler picker: status='pending' AND next_retry_at <= now.
    reconcilerIdx: index('job_failure_reconciler_idx').on(t.status, t.nextRetryAt),
  }),
);

export type JobFailure = typeof jobFailure.$inferSelect;
export type NewJobFailure = typeof jobFailure.$inferInsert;
