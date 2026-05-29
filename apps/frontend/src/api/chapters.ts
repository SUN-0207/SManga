import { api } from '@/lib/api-client';

export interface ChapterContent {
  story: { id: string; slug: string; title: string; totalChapters: number };
  chapter: { index: number; title: string; content: string | null; isCrawled: boolean };
  prev: { index: number; title: string } | null;
  next: { index: number; title: string } | null;
}

export async function getChapterContent(slug: string, index: string): Promise<ChapterContent> {
  const res = await api.get<ChapterContent>(`/chapters/by-slug/${slug}/${index}`);
  return res.data;
}
