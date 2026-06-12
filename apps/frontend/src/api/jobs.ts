import { api } from '@/lib/api-client';

export interface JobRow {
  id: string;
  name: string;
  state: string;
  attemptsMade: number;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  failedReason: string | null;
  data: unknown;
}

export interface JobStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  /** Count of waiting jobs that errored at least once and are queued for retry.
   * Sampled from the next `erroringSampled` waiting jobs (cap 200) — an
   * approximation that surfaces the "0 thất bại nhưng có lỗi đỏ" mismatch. */
  erroring: number;
  erroringSampled: number;
}

export interface DeadLetterRow {
  id: string;
  dedupKey: string;
  jobName: string;
  errorClass: string;
  classification: 'transient' | 'permanent';
  failedReason: string | null;
  attemptsMade: number;
  retryGeneration: number;
  status: 'pending' | 'retrying' | 'needs_attention' | 'dead' | 'resolved';
  firstFailedAt: string;
  lastFailedAt: string;
  nextRetryAt: string | null;
}

export interface DeadLetterPage {
  items: DeadLetterRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const jobsApi = {
  /** `fresh=true` bypasses the server-side 30s cache. Use it from the
   * manual "Làm mới" button so the operator sees current numbers; omit it
   * from the 15s background poll so polling keeps benefiting from the cache. */
  stats: (fresh = false) =>
    api
      .get<JobStats>('/jobs/stats', { params: fresh ? { fresh: 'true' } : undefined })
      .then((r) => r.data),
  list: () => api.get<JobRow[]>('/jobs').then((r) => r.data),
  retry: (id: string) => api.post(`/jobs/${id}/retry`).then((r) => r.data),
  retryAllFailed: () =>
    api.post<{ retried: number; skipped: number }>('/jobs/retry-failed').then((r) => r.data),
  refetchAllChapters: () =>
    api.post<{ enqueued: number }>('/jobs/refetch-all-chapters').then((r) => r.data),
  deadLetter: (page = 1, pageSize = 50) =>
    api
      .get<DeadLetterPage>('/jobs/dead-letter', { params: { page, pageSize } })
      .then((r) => r.data),
  deadLetterRetryNow: (id: string) =>
    api.post<{ ok: boolean }>(`/jobs/dead-letter/${id}/retry-now`).then((r) => r.data),
  deadLetterDismiss: (id: string) =>
    api.post<{ ok: boolean }>(`/jobs/dead-letter/${id}/dismiss`).then((r) => r.data),
  deadLetterRetryAll: () =>
    api.post<{ rearmed: number }>('/jobs/dead-letter/retry-all').then((r) => r.data),
  getAutoRetry: () =>
    api.get<{ autoRetryEnabled: boolean }>('/admin/settings/auto-retry').then((r) => r.data),
  setAutoRetry: (enabled: boolean) =>
    api
      .patch<{ autoRetryEnabled: boolean }>('/admin/settings/auto-retry', { enabled })
      .then((r) => r.data),
};
