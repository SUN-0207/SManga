import { createHash } from 'node:crypto';
import { DRIZZLE } from '@/modules/db/db.provider';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { sql } from 'drizzle-orm';

const BASE = 'https://smanga.shop';

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

// Escape characters that XML 1.0 parsers reject inside element content.
// Apostrophe and quote are not strictly required outside attribute values,
// but escaping them is cheap and avoids surprises if a slug ever lands inside
// an attribute later.
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const SHARD_SIZE = 10_000; // sitemap protocol caps a file at 50k URLs; 10k keeps each file small + fast.
const SITEMAP_TTL_MS = 60 * 60_000; // 1h staleness cap; ETag stays stable across rebuilds while version is unchanged.

export interface SitemapEntry {
  body: string;
  etag: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

@Injectable()
export class SeoService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private cache: Map<string, SitemapEntry> | null = null;
  private cacheExpiresAt = 0;

  /**
   * Cached sitemap for `key` ('index' | 'stories' | 'chapters-<n>'), or null
   * if the key doesn't exist (e.g. an out-of-range shard). Rebuilds the whole
   * set once per TTL; ETags are derived from MAX(story.updated_at) so GSC gets
   * 304s while nothing changed.
   */
  async getSitemap(key: string): Promise<SitemapEntry | null> {
    const now = Date.now();
    if (!this.cache || this.cacheExpiresAt <= now) {
      const version = await this.currentVersion();
      await this.rebuild(version);
      this.cacheExpiresAt = now + SITEMAP_TTL_MS;
    }
    return this.cache?.get(key) ?? null;
  }

  private async currentVersion(): Promise<string> {
    const r = await this.db.execute<{ v: string | null }>(sql`
      SELECT MAX(updated_at) AS v FROM story WHERE discovery_status = 'complete'
    `);
    const v = rowsOf<{ v: string | null }>(r)[0]?.v;
    return v ? new Date(v).toISOString() : 'empty';
  }

  private async rebuild(version: string): Promise<void> {
    const stories = await this.listStoriesForSitemap();
    const chapters = await this.listChaptersForSitemap();
    const shards = chunk(chapters, SHARD_SIZE);
    const shardCount = Math.max(shards.length, 1); // always advertise at least chapters-1
    const cache = new Map<string, SitemapEntry>();
    const put = (key: string, body: string) =>
      cache.set(key, {
        body,
        etag: `"${createHash('sha1').update(`${version}:${key}`).digest('hex')}"`,
      });

    put('stories', this.buildSitemapStoriesXml(stories));
    for (let i = 0; i < shardCount; i++) {
      put(`chapters-${i + 1}`, this.buildSitemapChaptersXml(shards[i] ?? []));
    }
    put(
      'index',
      this.buildSitemapIndexXml(
        version === 'empty' ? new Date(0).toISOString() : version,
        shardCount,
      ),
    );

    this.cache = cache;
  }

  async listStoriesForSitemap(): Promise<Array<{ slug: string; updatedAt: string }>> {
    const r = await this.db.execute<{ slug: string; updated_at: string }>(sql`
      SELECT slug, updated_at
      FROM story
      WHERE discovery_status = 'complete'
      ORDER BY updated_at DESC
    `);
    return rowsOf<{ slug: string; updated_at: string }>(r).map((row) => ({
      slug: row.slug,
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  // First 3 chapters per story via a per-story lateral probe (no full chapter
  // scan). Joined on discovery_status='complete' so we never advertise
  // chapters whose parent is still a stub. URL index format preserved as the
  // integer text (e.g. "1") to match the reader's /chuong/:index route.
  async listChaptersForSitemap(): Promise<
    Array<{ slug: string; chapterIndex: string; updatedAt: string }>
  > {
    const r = await this.db.execute<{
      slug: string;
      index: string;
      updated_at: string;
    }>(sql`
      SELECT s.slug, (sub.index::int)::text AS index,
             COALESCE(sub.crawled_at, s.updated_at) AS updated_at
      FROM story s
      JOIN LATERAL (
        SELECT ch.index, ch.crawled_at
        FROM chapter ch
        WHERE ch.story_id = s.id AND ch.index IN (1, 2, 3)
        ORDER BY ch.index ASC
      ) sub ON true
      WHERE s.discovery_status = 'complete'
      ORDER BY s.updated_at DESC, s.slug, sub.index ASC
    `);
    return rowsOf<{ slug: string; index: string; updated_at: string }>(r).map((row) => ({
      slug: row.slug,
      chapterIndex: row.index,
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  buildSitemapIndexXml(lastmod: string, chapterShardCount: number): string {
    const shardEntries = Array.from(
      { length: chapterShardCount },
      (_, i) =>
        `  <sitemap>\n    <loc>${BASE}/sitemap-chapters-${i + 1}.xml</loc>\n    <lastmod>${escapeXml(lastmod)}</lastmod>\n  </sitemap>`,
    ).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${BASE}/sitemap-stories.xml</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
  </sitemap>
${shardEntries}
</sitemapindex>
`;
  }

  buildSitemapStoriesXml(stories: Array<{ slug: string; updatedAt: string }>): string {
    const urls = stories
      .map(
        (s) =>
          `  <url>\n    <loc>${BASE}/truyen/${escapeXml(s.slug)}</loc>\n    <lastmod>${escapeXml(s.updatedAt)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
      )
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  }

  buildSitemapChaptersXml(
    chapters: Array<{ slug: string; chapterIndex: string; updatedAt: string }>,
  ): string {
    const urls = chapters
      .map(
        (c) =>
          `  <url>\n    <loc>${BASE}/truyen/${escapeXml(c.slug)}/chuong/${escapeXml(c.chapterIndex)}</loc>\n    <lastmod>${escapeXml(c.updatedAt)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>`,
      )
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  }

  buildRobotsTxt(): string {
    return `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /dang-nhap
Disallow: /dang-ky
Disallow: /tim-kiem
Disallow: /tu-sach
Disallow: /tai-khoan
Disallow: /ban

Sitemap: ${BASE}/sitemap.xml
`;
  }
}
