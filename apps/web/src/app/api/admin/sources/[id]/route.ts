import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { source } from '@smanga/db/schema';
import { getDb } from '@/server/db';

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  rateLimitRps: z.coerce.number().positive().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name) update.name = parsed.data.name;
  if (parsed.data.baseUrl) update.baseUrl = parsed.data.baseUrl;
  if (parsed.data.rateLimitRps) update.rateLimitRps = String(parsed.data.rateLimitRps);
  if (parsed.data.isActive !== undefined) update.isActive = parsed.data.isActive;
  await getDb().update(source).set(update).where(eq(source.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await getDb().delete(source).where(eq(source.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: `cannot delete source — likely referenced by stories: ${(err as Error).message}` },
      { status: 409 },
    );
  }
}
