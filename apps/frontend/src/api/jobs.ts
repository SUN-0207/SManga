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

export const jobsApi = {
  stats: () => api.get<Record<string, number>>('/jobs/stats').then((r) => r.data),
  list: () => api.get<JobRow[]>('/jobs').then((r) => r.data),
  retry: (id: string) => api.post(`/jobs/${id}/retry`).then((r) => r.data),
  retryAllFailed: () =>
    api.post<{ retried: number; skipped: number }>('/jobs/retry-failed').then((r) => r.data),
};
