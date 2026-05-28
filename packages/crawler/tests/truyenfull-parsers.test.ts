import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStoryHtml, parseChapterListHtml } from '../src/sources/truyenfull/parsers.js';

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
    const { chapters } = parseChapterListHtml(chapterListHtml, 'https://truyenfull.today/xuyen-thu-chi-ba-ai-doc-the/');
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters.every((c) => Number.isFinite(c.index))).toBe(true);
    expect(chapters.every((c) => c.externalUrl.startsWith('http'))).toBe(true);
  });

  it('returns hasNextPage as a boolean', () => {
    const { hasNextPage } = parseChapterListHtml(chapterListHtml, 'https://truyenfull.today/xuyen-thu-chi-ba-ai-doc-the/');
    expect(typeof hasNextPage).toBe('boolean');
  });
});
