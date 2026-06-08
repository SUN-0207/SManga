import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseCatalogListingHtml,
  parseChapterContentHtml,
  parseChapterListHtml,
  parseStoryHtml,
} from '../src/sources/truyenfull/parsers.js';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'sources',
  'truyenfull',
  '__fixtures__',
);

const storyHtml = readFileSync(join(fixturesDir, 'story.html'), 'utf-8');
const chapterListHtml = readFileSync(join(fixturesDir, 'chapter-list.html'), 'utf-8');
const chapterHtml = readFileSync(join(fixturesDir, 'chapter.html'), 'utf-8');
const catalogNewestHtml = readFileSync(join(fixturesDir, 'catalog-newest-page1.html'), 'utf-8');

describe('truyenfull parseStoryHtml', () => {
  it('extracts non-empty title', () => {
    const md = parseStoryHtml(storyHtml, 'https://truyenfull.today/xuyen-thu-chi-ba-ai-doc-the/');
    expect(md.title.length).toBeGreaterThan(0);
  });

  it('extracts externalId from the URL slug', () => {
    const md = parseStoryHtml(storyHtml, 'https://truyenfull.today/example-slug/');
    expect(md.externalId).toBe('example-slug');
  });

  it('extracts at least one genre', () => {
    const md = parseStoryHtml(storyHtml, 'https://truyenfull.today/example/');
    expect(md.genres.length).toBeGreaterThan(0);
  });

  it('extracts cover URL when present', () => {
    const md = parseStoryHtml(storyHtml, 'https://truyenfull.today/example/');
    if (md.coverUrl !== null) {
      expect(md.coverUrl).toMatch(/^https?:\/\//);
    }
  });

  it('returns a recognised status value', () => {
    const md = parseStoryHtml(storyHtml, 'https://truyenfull.today/example/');
    expect(['ongoing', 'completed', 'dropped', 'unknown']).toContain(md.status);
  });
});

describe('truyenfull parseChapterListHtml', () => {
  it('extracts at least one chapter with monotonically meaningful indices', () => {
    const { chapters } = parseChapterListHtml(
      chapterListHtml,
      'https://truyenfull.today/xuyen-thu-chi-ba-ai-doc-the/',
    );
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters.every((c) => Number.isFinite(c.index))).toBe(true);
    expect(chapters.every((c) => c.externalUrl.startsWith('http'))).toBe(true);
  });

  it('returns hasNextPage as a boolean', () => {
    const { hasNextPage } = parseChapterListHtml(
      chapterListHtml,
      'https://truyenfull.today/xuyen-thu-chi-ba-ai-doc-the/',
    );
    expect(typeof hasNextPage).toBe('boolean');
  });
});

describe('truyenfull parseCatalogListingHtml', () => {
  const result = parseCatalogListingHtml(catalogNewestHtml, 'https://truyenfull.today', 1);

  it('extracts multiple story stubs from a listing page', () => {
    expect(result.items.length).toBeGreaterThanOrEqual(10);
  });

  it('each stub has a non-empty title + absolute story URL', () => {
    for (const it of result.items) {
      expect(it.title.length).toBeGreaterThan(0);
      expect(it.externalUrl).toMatch(/^https:\/\/truyenfull\.today\//);
    }
  });

  it('each stub has a slug as externalId', () => {
    for (const it of result.items) {
      expect(it.externalId).toMatch(/^[a-z0-9-]+$/i);
      expect(it.externalUrl).toContain(it.externalId);
    }
  });

  it('extracts cover thumb URL when present', () => {
    const withCover = result.items.filter((it) => it.coverThumbUrl);
    expect(withCover.length).toBeGreaterThan(0);
    expect(withCover[0]?.coverThumbUrl).toMatch(/^https?:\/\//);
  });

  it('extracts author for most stubs', () => {
    const withAuthor = result.items.filter((it) => it.author && it.author.length > 0);
    expect(withAuthor.length).toBeGreaterThan(result.items.length / 2);
  });

  it('reports page number back unchanged', () => {
    expect(result.page).toBe(1);
  });

  it('detects hasNextPage when pagination has glyphicon-menu-right', () => {
    // Page 1 of newest always has many pages following — must report true
    expect(result.hasNextPage).toBe(true);
  });
});

describe('truyenfull parseChapterContentHtml', () => {
  it('extracts non-empty text', () => {
    const c = parseChapterContentHtml(chapterHtml);
    expect(c.text.length).toBeGreaterThan(100);
  });

  it('does not include script tags in text', () => {
    const c = parseChapterContentHtml(chapterHtml);
    expect(c.text).not.toMatch(/<script/i);
  });

  it('extracts a non-empty title', () => {
    const c = parseChapterContentHtml(chapterHtml);
    expect(c.title.length).toBeGreaterThan(0);
  });
});

describe('parseChapterContentHtml — paragraph separation', () => {
  it('emits \\n\\n between adjacent <p> blocks so FE split("\\n\\n") produces real paragraphs', () => {
    const html =
      '<h2><a class="chapter-title">Chương 1: Test</a></h2>' +
      '<div id="chapter-c" class="chapter-c">' +
      '<p>Hello world.</p>' +
      '<p>Second paragraph.</p>' +
      '<p>Third one.</p>' +
      '</div>';
    const result = parseChapterContentHtml(html);
    expect(result.text).toBe('Hello world.\n\nSecond paragraph.\n\nThird one.');
    expect(result.text.split('\n\n')).toHaveLength(3);
  });
});
