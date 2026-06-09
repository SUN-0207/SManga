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
};
