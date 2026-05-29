import type { CatalogFeed, SourceAdapter } from '@smanga/shared';
import {
  parseCatalogListingHtml,
  parseChapterContentHtml,
  parseChapterListHtml,
  parseStoryHtml,
} from './parsers.ts';

const BASE = 'https://truyenfull.today';

const CATALOG_FEEDS: readonly CatalogFeed[] = [
  { id: 'newest', label: 'Mới cập nhật', kind: 'newest' },
  { id: 'hot', label: 'Truyện hot', kind: 'hot' },
  { id: 'completed', label: 'Đã hoàn thành', kind: 'completed' },
] as const;

const FEED_PATH: Record<string, string> = {
  newest: 'danh-sach/truyen-moi',
  hot: 'danh-sach/truyen-hot',
  completed: 'danh-sach/truyen-full',
};

function buildPaginatedUrl(basePath: string, page: number): string {
  const trimmed = basePath.replace(/\/$/, '');
  if (page <= 1) return `${BASE}/${trimmed}/`;
  return `${BASE}/${trimmed}/trang-${page}/`;
}

export const truyenfullAdapter: SourceAdapter = {
  id: 'truyenfull',
  name: 'TruyenFull',
  baseUrl: BASE,
  hostnames: ['truyenfull.today', 'www.truyenfull.today'],
  requiresJs: false,
  rateLimit: { rps: 1 },

  catalogFeeds: CATALOG_FEEDS,

  async parseStoryFromUrl(url, html) {
    return parseStoryHtml(html, url);
  },
  async listChapters(html) {
    return parseChapterListHtml(html, BASE + '/');
  },
  async fetchChapterContent(html) {
    return parseChapterContentHtml(html);
  },
  buildListChaptersUrl(storyUrl, page) {
    if (page <= 1) return storyUrl;
    const u = new URL(storyUrl);
    const trimmed = u.pathname.replace(/\/$/, '');
    u.pathname = `${trimmed}/trang-${page}/`;
    return u.toString();
  },

  buildCatalogUrl(feedId, page) {
    const path = FEED_PATH[feedId];
    if (!path) {
      throw new Error(`unknown truyenfull catalog feed: ${feedId}`);
    }
    return buildPaginatedUrl(path, page);
  },
  async parseCatalogPage(html, _feedId, page) {
    return parseCatalogListingHtml(html, BASE, page);
  },

  buildSearchUrl(query, page) {
    const q = encodeURIComponent(query.trim());
    if (page <= 1) return `${BASE}/tim-kiem/?tukhoa=${q}`;
    return `${BASE}/tim-kiem/trang-${page}/?tukhoa=${q}`;
  },
  async parseSearchPage(html, _query, page) {
    // Search results page on truyenfull renders the same Book row markup as listings,
    // so the catalog parser handles it.
    return parseCatalogListingHtml(html, BASE, page);
  },
};
