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

@Injectable()
export class SeoService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listStoriesForSitemap(): Promise<Array<{ slug: string; updatedAt: string }>> {
    const r = await this.db.execute<{ slug: string; updated_at: string }>(sql`
      SELECT slug, updated_at
      FROM story
      WHERE discovery_status = 'complete'
      ORDER BY updated_at DESC
    `);
    return rowsOf<{ slug: string; updated_at: string }>(r).map((row) => ({
      slug: row.slug,
      updatedAt: row.updated_at,
    }));
  }

  // First 3 chapters per story — joined on story.discovery_status = 'complete'
  // so we never advertise chapters whose parent is still a stub.
  async listChaptersForSitemap(): Promise<
    Array<{ slug: string; chapterIndex: string; updatedAt: string }>
  > {
    const r = await this.db.execute<{
      slug: string;
      index: string;
      updated_at: string;
    }>(sql`
      SELECT s.slug, (c.index::int)::text AS index, c.updated_at
      FROM chapter c
      JOIN story s ON s.id = c.story_id
      WHERE c.index IN (1, 2, 3)
        AND s.discovery_status = 'complete'
      ORDER BY s.updated_at DESC, c.index ASC
    `);
    return rowsOf<{ slug: string; index: string; updated_at: string }>(r).map((row) => ({
      slug: row.slug,
      chapterIndex: row.index,
      updatedAt: row.updated_at,
    }));
  }

  buildSitemapIndexXml(now: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${BASE}/sitemap-stories.xml</loc>
    <lastmod>${escapeXml(now)}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${BASE}/sitemap-chapters.xml</loc>
    <lastmod>${escapeXml(now)}</lastmod>
  </sitemap>
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
