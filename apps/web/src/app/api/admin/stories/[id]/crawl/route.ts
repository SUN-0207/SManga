import { NextResponse } from 'next/server';
import { and, eq, inArray, asc } from 'drizzle-orm';
import { z } from 'zod';
import { chapter } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { enqueueFetchChapter } from '@/server/queue';

const schema = z.object({
  mode: z.enum(['missing', 'all', 'one']),
  chapterId: z.string().uuid().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: storyId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });

  const db = getDb();
  let ids: string[] = [];

  if (parsed.data.mode === 'one') {
    if (!parsed.data.chapterId) {
      return NextResponse.json({ error: 'chapterId required for mode=one' }, { status: 400 });
    }
    ids = [parsed.data.chapterId];
  } else if (parsed.data.mode === 'missing') {
    const rows = await db
      .select({ id: chapter.id })
      .from(chapter)
      .where(and(eq(chapter.storyId, storyId), inArray(chapter.status, ['pending', 'failed'])))
      .orderBy(asc(chapter.index));
    ids = rows.map((r) => r.id);
  } else {
    const rows = await db
      .select({ id: chapter.id })
      .from(chapter)
      .where(eq(chapter.storyId, storyId))
      .orderBy(asc(chapter.index));
    ids = rows.map((r) => r.id);
  }

  let enqueued = 0;
  let duplicates = 0;
  for (const chapterId of ids) {
    const result = await enqueueFetchChapter({ chapterId });
    if (result === 'duplicate') duplicates += 1;
    else enqueued += 1;
  }
  return NextResponse.json({ enqueued, duplicates, total: ids.length });
}
