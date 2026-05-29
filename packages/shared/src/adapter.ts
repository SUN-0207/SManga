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

/**
 * Catalog feed = one named slice of a source's listing pages (newest, hot,
 * full, genre/<slug>, etc). Each feed is paginated independently.
 */
export const catalogFeedSchema = z.object({
  id: z.string().min(1), // 'newest' | 'hot' | 'completed' | 'genre:tien-hiep' ...
  label: z.string().min(1), // 'Mới cập nhật' | 'Truyện hot' | 'Đã hoàn thành'
  kind: z.enum(['newest', 'hot', 'completed', 'genre', 'author']),
});
export type CatalogFeed = z.infer<typeof catalogFeedSchema>;

/**
 * Story stub returned from a catalog listing page — enough to render a card.
 * NOT a full StoryMetadata (no description, no genres list, no status enum
 * necessarily); we use these to seed a metadata-only import.
 */
export const storyListItemSchema = z.object({
  externalUrl: z.string().url(),
  externalId: z.string().min(1),
  title: z.string().min(1),
  author: z.string().nullable(),
  coverThumbUrl: z.string().url().nullable(),
  /** Free-form status badge text from the listing card ("Full", "Đang ra", null). */
  statusLabel: z.string().nullable(),
  /** Optional inline meta like total chapters when the listing shows it. */
  totalChaptersHint: z.number().int().nullable(),
});
export type StoryListItem = z.infer<typeof storyListItemSchema>;

export const catalogPageSchema = z.object({
  items: z.array(storyListItemSchema),
  page: z.number().int().min(1),
  hasNextPage: z.boolean(),
});
export type CatalogPage = z.infer<typeof catalogPageSchema>;

export const searchPageSchema = catalogPageSchema;
export type SearchPage = CatalogPage;

export interface SourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly hostnames: string[];
  readonly requiresJs: boolean;
  readonly rateLimit: { rps: number };

  // Per-story operations
  parseStoryFromUrl(url: string, html: string): Promise<StoryMetadata>;
  listChapters(html: string): Promise<{ chapters: ChapterRef[]; hasNextPage: boolean }>;
  fetchChapterContent(html: string): Promise<ChapterContent>;
  buildListChaptersUrl(storyUrl: string, page: number): string;

  // Catalog browsing (mandatory)
  readonly catalogFeeds: readonly CatalogFeed[];
  buildCatalogUrl(feedId: string, page: number): string;
  parseCatalogPage(html: string, feedId: string, page: number): Promise<CatalogPage>;

  // Search (optional; not all sources expose a search endpoint)
  buildSearchUrl?(query: string, page: number): string;
  parseSearchPage?(html: string, query: string, page: number): Promise<SearchPage>;
}
