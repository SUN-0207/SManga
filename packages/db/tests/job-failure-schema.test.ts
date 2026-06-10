import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  jobFailure,
  jobFailureClassEnum,
  jobFailureStatusEnum,
} from '../src/schema/job-failure.js';

describe('job_failure schema', () => {
  it('exposes the expected columns', () => {
    const cols = Object.keys(getTableColumns(jobFailure)).sort();
    expect(cols).toEqual(
      [
        'id',
        'dedupKey',
        'queue',
        'jobName',
        'jobData',
        'errorClass',
        'classification',
        'failedReason',
        'attemptsMade',
        'retryGeneration',
        'status',
        'firstFailedAt',
        'lastFailedAt',
        'nextRetryAt',
        'resolvedAt',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
  });

  it('declares the two enums with the right values', () => {
    expect(jobFailureClassEnum.enumValues).toEqual(['transient', 'permanent']);
    expect(jobFailureStatusEnum.enumValues).toEqual([
      'pending',
      'retrying',
      'needs_attention',
      'dead',
      'resolved',
    ]);
  });

  it('maps to the job_failure table with a unique dedup_key index', () => {
    const cfg = getTableConfig(jobFailure);
    expect(cfg.name).toBe('job_failure');
    const uniqueIdx = cfg.indexes.find((i) => i.config.unique);
    expect(uniqueIdx?.config.columns.map((c) => (c as { name: string }).name)).toEqual([
      'dedup_key',
    ]);
  });
});
