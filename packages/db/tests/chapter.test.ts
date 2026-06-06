import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { chapter, source, story } from '../src/schema/index.js';
import { db } from './setup.js';

describe('chapter schema', () => {
  it('inserts a chapter with bytea content', async () => {
    await db
      .insert(source)
      .values({ id: 'tf-ch', name: 'TF', baseUrl: 'https://x.test' })
      .onConflictDoNothing();
    const [s] = await db.insert(story).values({ slug: 'ch-s-1', title: 'Ch S 1' }).returning();

    const payload = Buffer.from('Hello, gzipped text would go here');
    await db.insert(chapter).values({
      storyId: s?.id,
      index: '1',
      title: 'Chương 1',
      sourceId: 'tf-ch',
      externalUrl: 'https://x.test/ch1',
      contentText: payload,
      contentByteSize: payload.length,
      status: 'crawled',
    });

    const rows = await db.select().from(chapter).where(eq(chapter.storyId, s?.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.contentText?.toString()).toContain('Hello');
  });

  it('rejects duplicate (storyId, index)', async () => {
    await db
      .insert(source)
      .values({ id: 'tf-dup', name: 'TF', baseUrl: 'https://x.test' })
      .onConflictDoNothing();
    const [s] = await db.insert(story).values({ slug: 'ch-s-2', title: 'Ch S 2' }).returning();

    await db.insert(chapter).values({
      storyId: s?.id,
      index: '1',
      title: 'Chương 1',
      sourceId: 'tf-dup',
      externalUrl: 'https://x.test/a',
    });

    await expect(
      db.insert(chapter).values({
        storyId: s?.id,
        index: '1',
        title: 'Chương 1 dup',
        sourceId: 'tf-dup',
        externalUrl: 'https://x.test/b',
      }),
    ).rejects.toThrow();
  });
});
