import { gzipSync } from 'node:zlib';
import { eq, sql } from 'drizzle-orm';
import { storyMetadataSchema, type StoryMetadata } from '@smanga/shared';
import {
  chapter,
  genre,
  source as sourceTable,
  story,
  storyGenre,
  storySource,
} from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { downloadCover } from './cover.js';
import { fetchHtml } from './fetcher.js';
import { logger } from './logger.js';
import { getAdapter, resolveAdapterForUrl } from './registry.js';
import { TokenBucket } from './rate-limit.js';

const buckets = new Map<string, TokenBucket>();
function bucketFor(sourceId: string, rps: number): TokenBucket {
  let b = buckets.get(sourceId);
  if (!b) {
    b = new TokenBucket({ ratePerSecond: rps, burst: rps });
    buckets.set(sourceId, b);
  }
  return b;
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export interface ImportResult {
  storyId: string;
  totalChapters: number;
}

export async function importStory(db: Database, url: string): Promise<ImportResult> {
  const adapter = resolveAdapterForUrl(url);
  const bucket = bucketFor(adapter.id, adapter.rateLimit.rps);
  logger.info({ url, source: adapter.id }, 'importing story');

  await bucket.acquire();
  const html = await fetchHtml(url);
  const rawMetadata = await adapter.parseStoryFromUrl(url, html);
  const metadata: StoryMetadata = storyMetadataSchema.parse(rawMetadata);

  const cover = metadata.coverUrl ? await downloadCover(metadata.coverUrl) : null;

  const baseSlug = slugify(metadata.title) || slugify(metadata.externalId) || 'story';
  const slug = await uniqueSlug(db, baseSlug);

  await db
    .insert(sourceTable)
    .values({ id: adapter.id, name: adapter.name, baseUrl: adapter.baseUrl })
    .onConflictDoNothing();

  const [storyRow] = await db
    .insert(story)
    .values({
      slug,
      title: metadata.title,
      author: metadata.author,
      description: metadata.description,
      status: metadata.status,
      cover: cover?.bytes,
      coverMimeType: cover?.mimeType,
    })
    .returning();
  if (!storyRow) throw new Error('story insert returned no row');

  await db
    .insert(storySource)
    .values({
      storyId: storyRow.id,
      sourceId: adapter.id,
      externalId: metadata.externalId,
      externalUrl: url,
      isPrimary: true,
    })
    .onConflictDoNothing();

  for (const name of metadata.genres) {
    const gSlug = slugify(name);
    if (!gSlug) continue;
    const [g] = await db
      .insert(genre)
      .values({ slug: gSlug, name })
      .onConflictDoUpdate({ target: genre.slug, set: { name } })
      .returning();
    if (!g) continue;
    await db
      .insert(storyGenre)
      .values({ storyId: storyRow.id, genreId: g.id })
      .onConflictDoNothing();
  }

  let total = 0;
  let page = 1;
  while (true) {
    const listUrl = adapter.buildListChaptersUrl(url, page);
    await bucket.acquire();
    const listHtml = await fetchHtml(listUrl);
    const { chapters, hasNextPage } = await adapter.listChapters(listHtml);
    if (chapters.length === 0) break;

    const rows = chapters.map((c) => ({
      storyId: storyRow.id,
      index: String(c.index),
      title: c.title,
      sourceId: adapter.id,
      externalUrl: c.externalUrl,
      status: 'pending' as const,
    }));
    await db.insert(chapter).values(rows).onConflictDoNothing();
    total += rows.length;

    if (!hasNextPage) break;
    page += 1;
    if (page > 200) {
      logger.warn({ url }, 'chapter list pagination exceeded 200 pages; aborting');
      break;
    }
  }

  await db
    .update(story)
    .set({ totalChapters: total, updatedAt: new Date() })
    .where(eq(story.id, storyRow.id));

  logger.info({ storyId: storyRow.id, total }, 'story imported');
  return { storyId: storyRow.id, totalChapters: total };
}

async function uniqueSlug(db: Database, base: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const existing = await db
      .select({ id: story.id })
      .from(story)
      .where(eq(story.slug, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
  }
  throw new Error(`could not generate unique slug for base=${base}`);
}

export async function fetchChapterById(db: Database, chapterId: string): Promise<void> {
  const [row] = await db.select().from(chapter).where(eq(chapter.id, chapterId)).limit(1);
  if (!row) throw new Error(`chapter not found: ${chapterId}`);
  const [src] = await db.select().from(sourceTable).where(eq(sourceTable.id, row.sourceId)).limit(1);
  if (!src) throw new Error(`source not found: ${row.sourceId}`);

  const adapter = getAdapter(row.sourceId);
  const bucket = bucketFor(adapter.id, Number(src.rateLimitRps));
  await bucket.acquire();

  try {
    const html = await fetchHtml(row.externalUrl);
    const content = await adapter.fetchChapterContent(html);
    const raw = Buffer.from(content.text, 'utf-8');
    const compressed = gzipSync(raw);
    await db
      .update(chapter)
      .set({
        contentText: compressed,
        contentByteSize: raw.length, // uncompressed size for stats
        status: 'crawled',
        crawledAt: new Date(),
        lastError: null,
      })
      .where(eq(chapter.id, chapterId));
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    await db
      .update(chapter)
      .set({ status: 'failed', lastError: msg })
      .where(eq(chapter.id, chapterId));
    throw err;
  }
}

export async function fetchAllPendingChapters(db: Database, storyId: string): Promise<{ done: number; failed: number }> {
  const pending = await db
    .select({ id: chapter.id })
    .from(chapter)
    .where(sql`${chapter.storyId} = ${storyId} AND ${chapter.status} IN ('pending', 'failed')`);

  let done = 0;
  let failed = 0;
  for (const row of pending) {
    try {
      await fetchChapterById(db, row.id);
      done += 1;
    } catch {
      failed += 1;
    }
  }
  return { done, failed };
}
