import { eq } from 'drizzle-orm';
import { type ImportStoryPayload, importStoryPayloadSchema } from '@smanga/shared';
import { importStory } from '@smanga/crawler';
import { story } from '@smanga/db/schema';
import type { Database } from '@smanga/db';
import { revalidatePaths } from '../revalidate-client.js';

export async function handleImportStory(db: Database, raw: unknown): Promise<void> {
  const payload: ImportStoryPayload = importStoryPayloadSchema.parse(raw);
  const result = await importStory(db, payload.url);
  const [row] = await db.select({ slug: story.slug }).from(story).where(eq(story.id, result.storyId)).limit(1);
  if (row?.slug) {
    await revalidatePaths(['/', `/truyen/${row.slug}`]);
  }
}
