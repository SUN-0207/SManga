import { api } from '@/lib/api-client';

export interface ChapterContent {
  story: { id: string; slug: string; title: string; totalChapters: number };
  chapter: {
    id:        string;   // Plan D: UUID for POST /views/chapter/:chapterId
    index:     number;
    title:     string;
    content:   string | null;
    isCrawled: boolean;
    viewCount: number;   // Plan D: display in eyebrow when > 0
  };
  prev: { index: number; title: string } | null;
  next: { index: number; title: string } | null;
}

export async function getChapterContent(slug: string, index: string): Promise<ChapterContent> {
  const res = await api.get<ChapterContent>(`/chapters/by-slug/${slug}/${index}`);
  return res.data;
}
