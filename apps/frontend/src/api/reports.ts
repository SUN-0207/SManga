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
