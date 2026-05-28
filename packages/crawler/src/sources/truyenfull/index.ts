import type { SourceAdapter } from '@smanga/shared';
import {
  parseChapterContentHtml,
  parseChapterListHtml,
  parseStoryHtml,
} from './parsers.js';

export const truyenfullAdapter: SourceAdapter = {
  id: 'truyenfull',
  name: 'TruyenFull',
  baseUrl: 'https://truyenfull.today',
  hostnames: ['truyenfull.today', 'www.truyenfull.today'],
  requiresJs: false,
  rateLimit: { rps: 1 },

  async parseStoryFromUrl(url, html) {
    return parseStoryHtml(html, url);
  },
  async listChapters(html) {
    return parseChapterListHtml(html, 'https://truyenfull.today/');
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
};
