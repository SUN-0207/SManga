import {
  type CatalogPage,
  type ChapterContent,
  type ChapterRef,
  ParserError,
  type StoryListItem,
  type StoryMetadata,
} from '@smanga/shared';
import * as cheerio from 'cheerio';

function extractSlug(url: string): string {
  const u = new URL(url);
  const parts = u.pathname.split('/').filter(Boolean);
  const slug = parts[0];
  if (!slug) throw new ParserError(`cannot extract slug from ${url}`);
  return slug;
}

/**
 * Extract synopsis with paragraph breaks preserved.
 *
 * cheerio's `.text()` concatenates block-level children without any whitespace,
 * which fuses sentences across <p> and <br> boundaries (e.g. "côngThẩm",
 * "bảo.Để"). We walk the children of the desc container and insert newlines
 * between blocks ourselves before extracting text.
 */
function extractDescription($: cheerio.CheerioAPI): string {
  const container = $('.desc-text').first().length
    ? $('.desc-text').first()
    : $('div[itemprop="description"]').first();
  if (container.length === 0) return '';

  // Replace <br> with explicit newline markers so they survive .text()
  container.find('br').replaceWith('\n');
  // Append newlines to block children that produce paragraph breaks
  container.find('p, div, h1, h2, h3, h4, h5, h6, li').each((_, el) => {
    $(el).append('\n\n');
  });

  return container
    .text()
    .replace(/ /g, ' ') // nbsp → space
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/Giới\s+Thiệu\s+Truyện\s*-\s*/gi, '') // strip site-template header prefix
    .replace(/^\s*-\s+/gm, '') // strip leading dash bullets
    .replace(/^-?\s*Tags:\s*.*$/gim, '') // strip "- Tags: ..." footer line
    .trim();
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

  const description = extractDescription($);

  let coverUrl: string | null = null;
  const imgEl = $('.book img, .books img, .info img').first();
  const src = imgEl.attr('src') ?? imgEl.attr('data-src') ?? null;
  if (src) coverUrl = new URL(src, url).toString();

  // Fix 1: scope genre selector to .info only to avoid picking up the site-wide
  // genre navigation and "top stories" sidebar widgets that also carry
  // itemprop="genre" on their links.
  const genres: string[] = [];
  $('.info a[href*="/the-loai/"]').each((_, el) => {
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

  // hasNextPage: pagination has a "next" link (right arrow glyph or Vietnamese "tiếp"/"sau").
  // NOTE: do NOT use href.includes('/trang-') — previous-page links also contain '/trang-'
  // and would cause false positives on the last page, resulting in infinite pagination.
  let hasNextPage = false;
  $('.pagination a, ul.pagination a').each((_, el) => {
    const t = $(el).text().trim().toLowerCase();
    // Detect next-page indicators: Vietnamese "sau", "tiếp", or glyphicon-menu-right arrow
    if (
      t.includes('sau') ||
      t.includes('tiếp') ||
      t.includes('next') ||
      $(el).find('.glyphicon-menu-right').length > 0
    ) {
      hasNextPage = true;
    }
  });

  return { chapters, hasNextPage };
}

/**
 * Parse a catalog listing page (truyen-moi / truyen-hot / truyen-full /
 * the-loai/<slug>). All four pages share the same DOM shape — a sequence of
 * `<div class="row" itemtype="schema.org/Book">` rows under
 * `.list-truyen` / `#list-page`.
 */
export function parseCatalogListingHtml(html: string, baseUrl: string, page: number): CatalogPage {
  const $ = cheerio.load(html);
  const items: StoryListItem[] = [];

  $('div[itemtype$="/Book"]').each((_, el) => {
    const row = $(el);
    const titleAnchor = row.find('h3.truyen-title a[itemprop="url"]').first();
    const title = titleAnchor.text().trim();
    const href = titleAnchor.attr('href');
    if (!title || !href) return;

    const externalUrl = new URL(href, baseUrl).toString();
    const externalId = extractStorySlugFromUrl(externalUrl);
    if (!externalId) return;

    // Author: "<glyphicon> Author Name" — strip the icon's empty text
    const authorEl = row.find('span.author[itemprop="author"]').first();
    const author = authorEl.text().replace(/\s+/g, ' ').trim() || null;

    // Cover: lazyimg div carries thumb in data-image (small) + data-desk-image (larger)
    const lazy = row.find('div.lazyimg').first();
    const rawCover = lazy.attr('data-desk-image') ?? lazy.attr('data-image') ?? null;
    const coverThumbUrl = rawCover ? new URL(rawCover, baseUrl).toString() : null;

    // Status badge: <span class="label-title label-new"> etc.
    // Class suffix tells us the badge ("new", "full", "hot"). Map to Vietnamese label.
    const labelClass = row.find('span.label-title').first().attr('class') ?? '';
    const statusLabel = mapStatusLabel(labelClass);

    // Total chapters HINT: the latest chapter number in the col-xs-2 link
    const chapterMatch = row.find('div.col-xs-2 a').first().text().match(/(\d+)/);
    const totalChaptersHint = chapterMatch?.[1] ? Number(chapterMatch[1]) : null;

    items.push({
      externalUrl,
      externalId,
      title,
      author,
      coverThumbUrl,
      statusLabel,
      totalChaptersHint,
    });
  });

  // hasNextPage: a `glyphicon-menu-right` inside the pagination links
  // (same heuristic as the chapter list — avoids `/trang-N/` false positives)
  let hasNextPage = false;
  $('.pagination a').each((_, el) => {
    if ($(el).find('.glyphicon-menu-right').length > 0) hasNextPage = true;
  });

  return { items, page, hasNextPage };
}

function extractStorySlugFromUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[0] ?? null;
  } catch {
    return null;
  }
}

function mapStatusLabel(labelClass: string): string | null {
  if (/label-full/.test(labelClass)) return 'Full';
  if (/label-hot/.test(labelClass)) return 'Hot';
  if (/label-new/.test(labelClass)) return 'Mới';
  return null;
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
  // Fix 3: insert block separators before extracting text so adjacent <p> blocks
  // don't fuse together (e.g. "hồn...\"Tiêu" or ".Theo").
  contentEl.find('p, div, h1, h2, h3, h4, h5, h6, li, br').each((_, el) => {
    $(el).append('\n\n');
  });
  const text = contentEl
    .text()
    .replace(/ /g, ' ') // nbsp → space
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) throw new ParserError('chapter content empty after parse');
  return { title, text };
}
