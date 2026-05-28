import { z } from 'zod';

export const storyStatusSchema = z.enum(['ongoing', 'completed', 'dropped', 'unknown']);

export const storyMetadataSchema = z.object({
  externalId: z.string().min(1),
  title: z.string().min(1),
  author: z.string().nullable(),
  description: z.string(),
  coverUrl: z.string().url().nullable(),
  genres: z.array(z.string()),
  status: storyStatusSchema,
});
export type StoryMetadata = z.infer<typeof storyMetadataSchema>;

export const chapterRefSchema = z.object({
  index: z.number(),
  title: z.string().min(1),
  externalId: z.string().min(1),
  externalUrl: z.string().url(),
});
export type ChapterRef = z.infer<typeof chapterRefSchema>;

export const chapterContentSchema = z.object({
  title: z.string(),
  text: z.string().min(1),
});
export type ChapterContent = z.infer<typeof chapterContentSchema>;

export const storySearchResultSchema = z.object({
  externalUrl: z.string().url(),
  title: z.string(),
  author: z.string().nullable(),
  coverUrl: z.string().url().nullable(),
});
export type StorySearchResult = z.infer<typeof storySearchResultSchema>;

export interface SourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly hostnames: string[];
  readonly requiresJs: boolean;
  readonly rateLimit: { rps: number };

  parseStoryFromUrl(url: string, html: string): Promise<StoryMetadata>;
  listChapters(html: string): Promise<{ chapters: ChapterRef[]; hasNextPage: boolean }>;
  fetchChapterContent(html: string): Promise<ChapterContent>;
  buildListChaptersUrl(storyUrl: string, page: number): string;
}
