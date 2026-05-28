import * as cheerio from 'cheerio';
import { ParserError, type ChapterContent, type ChapterRef, type StoryMetadata } from '@smanga/shared';

function extractSlug(url: string): string {
  const u = new URL(url);
  const parts = u.pathname.split('/').filter(Boolean);
  const slug = parts[0];
  if (!slug) throw new ParserError(`cannot extract slug from ${url}`);
  return slug;
}

function normaliseStatus(raw: string): StoryMetadata['status'] {
  const s = raw.toLowerCase();
  if (s.includes('full') || s.includes('hoàn') || s.includes('hoan')) return 'completed';
  if (s.includes('đang ra') || s.includes('dang ra') || s.includes('ongoing')) return 'ongoing';
  if (s.includes('drop')) return 'dropped';
  return 'unknown';
}

export function parseStoryHtml(html: string, url: string): StoryMetadata {
  const $ = cheerio.load(html);

  const title =
    $('h3.title').first().text().trim() ||
    $('h1.title').first().text().trim() ||
    $('h1').first().text().trim();
  if (!title) throw new ParserError('could not locate story title');

  const author =
    $('a[itemprop="author"]').first().text().trim() ||
    $('.info a[href*="/tac-gia/"]').first().text().trim() ||
    null;

  const description =
    $('.desc-text').first().text().trim() ||
    $('div[itemprop="description"]').first().text().trim() ||
    '';

  let coverUrl: string | null = null;
  const imgEl = $('.book img, .books img, .info img').first();
  const src = imgEl.attr('src') ?? imgEl.attr('data-src') ?? null;
  if (src) coverUrl = new URL(src, url).toString();

  const genres: string[] = [];
  $('a[itemprop="genre"], .info a[href*="/the-loai/"]').each((_, el) => {
    const name = $(el).text().trim();
    if (name) genres.push(name);
  });

  const statusRaw =
    $('.info span.text-success').first().text().trim() ||
    $('.info span.text-primary').first().text().trim() ||
    '';
  const status = normaliseStatus(statusRaw);

  return {
    externalId: extractSlug(url),
    title,
    author,
    description,
    coverUrl,
    genres,
    status,
  };
}

export function parseChapterListHtml(
  html: string,
  storyUrl: string,
): { chapters: ChapterRef[]; hasNextPage: boolean } {
  const $ = cheerio.load(html);
  const chapters: ChapterRef[] = [];
  const slugRe = /chuong-(\d+(?:-\d+)?)/i;

  $('ul.list-chapter a').each((_, el) => {
    const a = $(el);
    const href = a.attr('href');
    const title = a.text().trim();
    if (!href || !title) return;

    const fullUrl = new URL(href, storyUrl).toString();
    const urlPath = new URL(fullUrl).pathname;
    const slug = urlPath.split('/').filter(Boolean).pop() ?? '';

    const m = slug.match(slugRe);
    if (!m || !m[1]) return;
    const idx = Number(m[1].replace('-', '.'));
    if (Number.isNaN(idx)) return;

    chapters.push({
      index: idx,
      title,
      externalId: slug,
      externalUrl: fullUrl,
    });
  });

  // hasNextPage: pagination has a "next" link (right arrow glyph or trang-N link beyond current page)
  let hasNextPage = false;
  $('.pagination a, ul.pagination a').each((_, el) => {
    const t = $(el).text().trim().toLowerCase();
    const href = $(el).attr('href') ?? '';
    // Detect next-page indicators: Vietnamese "sau", "tiếp", right arrow text, or glyphicon-menu-right
    if (
      t.includes('sau') ||
      t.includes('tiếp') ||
      t.includes('next') ||
      t === '»' ||
      $(el).find('.glyphicon-menu-right').length > 0
    ) {
      hasNextPage = true;
    }
    // Also detect via href: if there's a trang-N link in pagination it means there are more pages
    if (href.includes('/trang-')) {
      hasNextPage = true;
    }
  });

  return { chapters, hasNextPage };
}

export function parseChapterContentHtml(html: string): ChapterContent {
  const $ = cheerio.load(html);

  // Title is in <h2><a class="chapter-title">...</a></h2>
  const title =
    $('a.chapter-title').first().text().trim() ||
    $('.chapter-title').first().text().trim() ||
    $('h2.chapter').first().text().trim() ||
    $('h2').first().text().trim() ||
    '';

  const contentEl = $('#chapter-c, .chapter-c, .chapter-content').first();
  if (contentEl.length === 0) throw new ParserError('could not locate chapter content element');

  contentEl.find('script, style, ins, iframe').remove();
  const text = contentEl
    .text()
    .replace(/ /g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) throw new ParserError('chapter content empty after parse');
  return { title, text };
}
