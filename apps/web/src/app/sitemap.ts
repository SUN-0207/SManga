import type { MetadataRoute } from 'next';
import { eq } from 'drizzle-orm';
import { chapter, story } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { env } from '@/lib/env';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '');
  const db = getDb();

  const stories = await db
    .select({ slug: story.slug, updatedAt: story.updatedAt })
    .from(story);

  const chapterRefs = await db
    .select({
      slug: story.slug,
      index: chapter.index,
      crawledAt: chapter.crawledAt,
    })
    .from(chapter)
    .innerJoin(story, eq(chapter.storyId, story.id))
    .where(eq(chapter.status, 'crawled'));

  const entries: MetadataRoute.Sitemap = [];

  entries.push({ url: `${base}/`, lastModified: new Date(), changeFrequency: 'hourly', priority: 1 });

  for (const s of stories) {
    entries.push({
      url: `${base}/truyen/${s.slug}`,
      lastModified: s.updatedAt ?? new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    });
  }

  for (const c of chapterRefs) {
    entries.push({
      url: `${base}/truyen/${c.slug}/chuong-${c.index}`,
      lastModified: c.crawledAt ?? new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }

  return entries;
}
