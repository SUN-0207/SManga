import { gzipSync } from 'node:zlib';
import type { Database } from '@smanga/db';
import {
  chapter,
  genre,
  source as sourceTable,
  story,
  storyGenre,
  storySource,
} from '@smanga/db/schema';
import { type CatalogPage, type StoryMetadata, storyMetadataSchema } from '@smanga/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { downloadCover } from './cover.ts';
import { fetchHtml } from './fetcher.ts';
import { logger } from './logger.ts';
import { TokenBucket } from './rate-limit.ts';
import { getAdapter, resolveAdapterForUrl } from './registry.ts';

const buckets = new Map<string, { bucket: TokenBucket; rps: number }>();
function bucketFor(sourceId: string, rps: number): TokenBucket {
  const cached = buckets.get(sourceId);
  if (cached && cached.rps === rps) return cached.bucket;
  // rps changed (config/source edit) or first use → fresh bucket.
  const bucket = new TokenBucket({ ratePerSecond: rps, burst: rps });
  buckets.set(sourceId, { bucket, rps });
  return bucket;
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

/**
 * Phase A — metadata-only import.
 *
 * Fetches the story page, persists the story row + cover + genres + the
 * `story_source` link. Does NOT touch the chapter list (that's Phase B).
 *
 * Idempotent against an already-imported URL: if `story_source` already has
 * the (sourceId, externalId) pair, returns the existing storyId without
 * re-writing metadata.
 */
export async function importStoryMetadata(
  db: Database,
  url: string,
): Promise<{ storyId: string; alreadyExisted: boolean }> {
  const adapter = resolveAdapterForUrl(url);
  const bucket = bucketFor(adapter.id, adapter.rateLimit.rps);
  logger.info({ url, source: adapter.id }, 'importing story metadata');

  await bucket.acquire();
  const html = await fetchHtml(url);
  const rawMetadata = await adapter.parseStoryFromUrl(url, html);
  const metadata: StoryMetadata = storyMetadataSchema.parse(rawMetadata);

  // Dedup by (sourceId, externalId) before any expensive work (cover download).
  const existing = await db
    .select({ storyId: storySource.storyId })
    .from(storySource)
    .where(
      sql`${storySource.sourceId} = ${adapter.id} AND ${storySource.externalId} = ${metadata.externalId}`,
    )
    .limit(1);
  if (existing[0]) {
    const existingId = existing[0].storyId;
    // Heal stub stories that were created before the image/jpg mime fix —
    // their cover is NULL because downloadCover silently dropped the response.
    // Re-attempt the download exactly once per re-import; on success patch
    // the row, on failure log and short-circuit as before.
    const [row] = await db
      .select({ coverMimeType: story.coverMimeType })
      .from(story)
      .where(eq(story.id, existingId))
      .limit(1);
    if (row && row.coverMimeType === null && metadata.coverUrl) {
      const cover = await downloadCover(metadata.coverUrl);
      if (cover) {
        await db
          .update(story)
          .set({ cover: cover.bytes, coverMimeType: cover.mimeType, updatedAt: new Date() })
          .where(eq(story.id, existingId));
        logger.info({ storyId: existingId }, 'backfilled cover on re-import');
      }
    }
    return { storyId: existingId, alreadyExisted: true };
  }

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
      discoveryStatus: 'pending',
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

  logger.info({ storyId: storyRow.id }, 'story metadata persisted');
  return { storyId: storyRow.id, alreadyExisted: false };
}

/**
 * Phase B — discover chapter list for a metadata-only story.
 *
 * Paginates the source's chapter-list pages and inserts pending chapter rows.
 * Sets discovery_status running → complete (or failed on error).
 *
 * Safe to retry on a failed story; safe to no-op on a story that's already
 * complete (no extra rows inserted thanks to ON CONFLICT DO NOTHING).
 */
export async function discoverChapters(
  db: Database,
  storyId: string,
): Promise<{ totalChapters: number }> {
  const [storyRow] = await db.select().from(story).where(eq(story.id, storyId)).limit(1);
  if (!storyRow) throw new Error(`story not found: ${storyId}`);

  const [link] = await db
    .select()
    .from(storySource)
    .where(sql`${storySource.storyId} = ${storyId} AND ${storySource.isPrimary} = true`)
    .limit(1);
  if (!link) throw new Error(`no primary source link for story: ${storyId}`);

  const adapter = getAdapter(link.sourceId);
  const bucket = bucketFor(adapter.id, adapter.rateLimit.rps);
  logger.info({ storyId, url: link.externalUrl }, 'discovering chapters');

  await db
    .update(story)
    .set({ discoveryStatus: 'running', discoveryError: null, updatedAt: new Date() })
    .where(eq(story.id, storyId));

  try {
    let total = 0;
    let page = 1;
    while (true) {
      const listUrl = adapter.buildListChaptersUrl(link.externalUrl, page);
      await bucket.acquire();
      const listHtml = await fetchHtml(listUrl);
      const { chapters, hasNextPage } = await adapter.listChapters(listHtml);
      if (chapters.length === 0) break;

      const rows = chapters.map((c) => ({
        storyId,
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
        logger.warn({ storyId }, 'chapter list pagination exceeded 200 pages; aborting');
        break;
      }
    }

    await db
      .update(story)
      .set({
        totalChapters: total,
        discoveryStatus: 'complete',
        discoveryError: null,
        discoveredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(story.id, storyId));

    logger.info({ storyId, total }, 'chapter discovery complete');
    return { totalChapters: total };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    await db
      .update(story)
      .set({ discoveryStatus: 'failed', discoveryError: msg, updatedAt: new Date() })
      .where(eq(story.id, storyId));
    throw err;
  }
}

/**
 * Composite import (back-compat for CLI): metadata + chapter discovery in one
 * call. New code paths (catalog bulk import) should call the two helpers
 * separately.
 */
export async function importStory(db: Database, url: string): Promise<ImportResult> {
  const { storyId } = await importStoryMetadata(db, url);
  const { totalChapters } = await discoverChapters(db, storyId);
  return { storyId, totalChapters };
}

/**
 * Catalog browse — fetch + parse a listing page from a source. Each returned
 * StoryListItem is annotated with `existingStoryId` / `existingDiscoveryStatus`
 * so the UI can show "already imported" badges + skip selection.
 */
export type DiscoveryStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface BrowseResult extends Omit<CatalogPage, 'items'> {
  feedId: string;
  items: (CatalogPage['items'][number] & {
    existingStoryId: string | null;
    existingDiscoveryStatus: DiscoveryStatus | null;
  })[];
}

export async function browseCatalog(
  db: Database,
  sourceId: string,
  feedId: string,
  page: number,
): Promise<BrowseResult> {
  const adapter = getAdapter(sourceId);
  if (!adapter.catalogFeeds.some((f) => f.id === feedId)) {
    throw new Error(`unknown feed for source ${sourceId}: ${feedId}`);
  }
  const bucket = bucketFor(adapter.id, adapter.rateLimit.rps);

  await bucket.acquire();
  const url = adapter.buildCatalogUrl(feedId, page);
  const html = await fetchHtml(url);
  const parsed = await adapter.parseCatalogPage(html, feedId, page);

  return annotateWithExisting(db, parsed, sourceId, feedId);
}

export async function searchCatalog(
  db: Database,
  sourceId: string,
  query: string,
  page: number,
): Promise<BrowseResult> {
  const adapter = getAdapter(sourceId);
  if (!adapter.buildSearchUrl || !adapter.parseSearchPage) {
    throw new Error(`source ${sourceId} does not support search`);
  }
  const bucket = bucketFor(adapter.id, adapter.rateLimit.rps);

  await bucket.acquire();
  const url = adapter.buildSearchUrl(query, page);
  const html = await fetchHtml(url);
  const parsed = await adapter.parseSearchPage(html, query, page);

  return annotateWithExisting(db, parsed, sourceId, 'search');
}

async function annotateWithExisting(
  db: Database,
  parsed: CatalogPage,
  sourceId: string,
  feedId: string,
): Promise<BrowseResult> {
  if (parsed.items.length === 0) {
    return { page: parsed.page, hasNextPage: parsed.hasNextPage, feedId, items: [] };
  }
  const externalIds = parsed.items.map((it) => it.externalId);
  const existing = await db
    .select({
      externalId: storySource.externalId,
      storyId: storySource.storyId,
      discoveryStatus: story.discoveryStatus,
    })
    .from(storySource)
    .innerJoin(story, eq(story.id, storySource.storyId))
    .where(
      sql`${storySource.sourceId} = ${sourceId} AND ${inArray(storySource.externalId, externalIds)}`,
    );

  const map = new Map(existing.map((r) => [r.externalId, r]));
  return {
    page: parsed.page,
    hasNextPage: parsed.hasNextPage,
    feedId,
    items: parsed.items.map((it) => {
      const hit = map.get(it.externalId);
      return {
        ...it,
        existingStoryId: hit?.storyId ?? null,
        existingDiscoveryStatus: hit?.discoveryStatus ?? null,
      };
    }),
  };
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
  const [src] = await db
    .select()
    .from(sourceTable)
    .where(eq(sourceTable.id, row.sourceId))
    .limit(1);
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
        contentByteSize: raw.length,
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

export async function fetchAllPendingChapters(
  db: Database,
  storyId: string,
): Promise<{ done: number; failed: number }> {
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
