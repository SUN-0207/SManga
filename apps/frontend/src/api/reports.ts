import { api } from '@/lib/api-client';

export type ReportCategory = 'content' | 'comment' | 'technical' | 'other';

export interface CreateReportBody {
  category: ReportCategory;
  message: string;
  storyId?: string;
  chapterId?: string;
}

export async function submitReport(body: CreateReportBody): Promise<{ id: string }> {
  const { data } = await api.post<{ id: string }>('/reports', body);
  return data;
}

// --- Admin API ---

export type ReportStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed';

export interface AdminReport {
  id: string;
  category: ReportCategory;
  message: string;
  status: ReportStatus;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  storySlug: string | null;
  storyTitle: string | null;
  chapterIndex: number | null;
}

export interface AdminReportsPage {
  items: AdminReport[];
  total: number;
  page: number;
  limit: number;
}

export async function getAdminReports(params: {
  status?: ReportStatus;
  category?: ReportCategory;
  page?: number;
  limit?: number;
}): Promise<AdminReportsPage> {
  const { data } = await api.get<AdminReportsPage>('/admin/reports', { params });
  return data;
}

export async function getReportsOpenCount(): Promise<{ openCount: number }> {
  const { data } = await api.get<{ openCount: number }>('/admin/reports/open-count');
  return data;
}

export interface UpdatedReport {
  id: string;
  status: ReportStatus;
  adminNote: string | null;
}

export async function updateReport(
  id: string,
  patch: { status?: ReportStatus; adminNote?: string },
): Promise<UpdatedReport> {
  const { data } = await api.patch<UpdatedReport>(`/admin/reports/${id}`, patch);
  return data;
}
