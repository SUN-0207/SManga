import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { story } from '@smanga/db/schema';
import { getDb } from '@/server/db';

export async function GET(req: Request, { params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  const [row] = await getDb()
    .select({ cover: story.cover, mime: story.coverMimeType })
    .from(story)
    .where(eq(story.id, storyId))
    .limit(1);

  if (!row?.cover) {
    return new Response('Not found', { status: 404 });
  }

  const etag = `"${createHash('sha1').update(row.cover).digest('hex')}"`;
  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return new Response(row.cover as unknown as ArrayBuffer, {
    headers: {
      'Content-Type': row.mime ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: etag,
    },
  });
}
