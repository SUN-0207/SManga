import { describe, expect, it, vi } from 'vitest';
import { SeoService } from './seo.service';

// db.execute is called as: currentVersion, listStories, listChapters (in rebuild order).
function mockDb(version: string, storyRows: unknown[], chapterRows: unknown[]) {
  const execute = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ v: version }] }) // currentVersion
    .mockResolvedValueOnce({ rows: storyRows }) // listStoriesForSitemap
    .mockResolvedValueOnce({ rows: chapterRows }); // listChaptersForSitemap
  return { db: { execute } as never, execute };
}

function chapterRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    slug: `s${i}`,
    index: '1',
    updated_at: '2026-06-01T00:00:00.000Z',
  }));
}

describe('SeoService sitemap sharding + cache', () => {
  it('shards chapters at 10k/file and lists each shard in the index', async () => {
    // 25,001 chapter URLs -> 3 shards (10k, 10k, 5k001)
    const { db } = mockDb(
      '2026-06-11T10:00:00.000Z',
      [{ slug: 'a', updated_at: '2026-06-01T00:00:00.000Z' }],
      chapterRows(25_001),
    );
    const svc = new SeoService(db);

    const index = await svc.getSitemap('index');
    expect(index).not.toBeNull();
    expect(index?.body).toContain('/sitemap-chapters-1.xml');
    expect(index?.body).toContain('/sitemap-chapters-3.xml');
    expect(index?.body).not.toContain('/sitemap-chapters-4.xml');
    expect(index?.body).toContain('/sitemap-stories.xml');

    const shard3 = await svc.getSitemap('chapters-3');
    expect(shard3?.body.match(/<url>/g)?.length).toBe(5_001);
    const shard1 = await svc.getSitemap('chapters-1');
    expect(shard1?.body.match(/<url>/g)?.length).toBe(10_000);
    expect(await svc.getSitemap('chapters-4')).toBeNull();
  });

  it('always exposes chapters-1 even with zero chapters', async () => {
    const { db } = mockDb('2026-06-11T10:00:00.000Z', [], []);
    const svc = new SeoService(db);
    const shard1 = await svc.getSitemap('chapters-1');
    expect(shard1).not.toBeNull();
    expect(shard1?.body).toContain('<urlset');
    expect((await svc.getSitemap('index'))?.body).toContain('/sitemap-chapters-1.xml');
  });

  it('builds once: a second getSitemap within TTL makes no new db calls', async () => {
    const { db, execute } = mockDb('2026-06-11T10:00:00.000Z', [], chapterRows(1));
    const svc = new SeoService(db);
    await svc.getSitemap('index');
    const callsAfterBuild = execute.mock.calls.length; // 3 (version + stories + chapters)
    await svc.getSitemap('stories');
    await svc.getSitemap('chapters-1');
    expect(execute.mock.calls.length).toBe(callsAfterBuild);
  });

  it('derives a stable ETag from the version (304-friendly)', async () => {
    const { db } = mockDb('2026-06-11T10:00:00.000Z', [], chapterRows(1));
    const svc = new SeoService(db);
    const a = await svc.getSitemap('stories');
    const b = await svc.getSitemap('stories');
    expect(a?.etag).toBe(b?.etag);
    expect(a?.etag).toMatch(/^"[0-9a-f]{40}"$/);
  });
});
