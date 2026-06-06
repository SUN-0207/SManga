import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { source, story, storySource } from '../src/schema/index.js';
import { db } from './setup.js';

describe('story schema', () => {
  it('inserts a story with a primary source mapping', async () => {
    await db
      .insert(source)
      .values({ id: 'truyenfull-2', name: 'TF2', baseUrl: 'https://x.test' })
      .onConflictDoNothing();

    const [inserted] = await db
      .insert(story)
      .values({
        slug: 'tieu-thuyet-test-1',
        title: 'Tiểu thuyết test',
        author: 'Tác giả X',
      })
      .returning();

    expect(inserted?.id).toBeDefined();

    await db.insert(storySource).values({
      storyId: inserted?.id,
      sourceId: 'truyenfull-2',
      externalId: 'tieu-thuyet-test',
      externalUrl: 'https://x.test/tieu-thuyet-test',
      isPrimary: true,
    });

    const rows = await db.select().from(storySource).where(eq(storySource.storyId, inserted?.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isPrimary).toBe(true);
  });

  it('enforces unique (sourceId, externalId)', async () => {
    await db
      .insert(source)
      .values({ id: 'src-dup', name: 'Dup', baseUrl: 'https://x.test' })
      .onConflictDoNothing();

    const [s1] = await db.insert(story).values({ slug: 'dup-1', title: 'Dup 1' }).returning();
    const [s2] = await db.insert(story).values({ slug: 'dup-2', title: 'Dup 2' }).returning();

    await db.insert(storySource).values({
      storyId: s1?.id,
      sourceId: 'src-dup',
      externalId: 'same-external',
      externalUrl: 'https://x.test/a',
    });

    await expect(
      db.insert(storySource).values({
        storyId: s2?.id,
        sourceId: 'src-dup',
        externalId: 'same-external',
        externalUrl: 'https://x.test/b',
      }),
    ).rejects.toThrow();
  });
});
