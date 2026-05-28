import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listAdapters } from '@smanga/crawler';
import { source } from '@smanga/db/schema';
import { getDb } from '@/server/db';

const createSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z.string().url(),
  rateLimitRps: z.coerce.number().positive().default(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', issues: parsed.error.issues }, { status: 400 });
  }
  const validIds = new Set(listAdapters().map((a) => a.id));
  if (!validIds.has(parsed.data.id)) {
    return NextResponse.json(
      { error: `no adapter registered for id=${parsed.data.id}. Valid: ${[...validIds].join(', ')}` },
      { status: 400 },
    );
  }
  const db = getDb();
  await db
    .insert(source)
    .values({
      id: parsed.data.id,
      name: parsed.data.name,
      baseUrl: parsed.data.baseUrl,
      rateLimitRps: String(parsed.data.rateLimitRps),
    })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
