import { eq } from 'drizzle-orm';
import { type FetchChapterPayload, fetchChapterPayloadSchema } from '@smanga/shared';
import { fetchChapterById } from '@smanga/crawler';
import { chapter, story } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { revalidatePaths } from '../revalidate-client.js';

export async function handleFetchChapter(db: Database, raw: unknown): Promise<void> {
  const payload: FetchChapterPayload = fetchChapterPayloadSchema.parse(raw);
  await fetchChapterById(db, payload.chapterId);
  const [row] = await db
    .select({ slug: story.slug, index: chapter.index })
    .from(chapter)
    .innerJoin(story, eq(chapter.storyId, story.id))
    .where(eq(chapter.id, payload.chapterId))
    .limit(1);
  if (row?.slug) {
    await revalidatePaths([`/truyen/${row.slug}`, `/truyen/${row.slug}/chuong-${row.index}`]);
  }
}
