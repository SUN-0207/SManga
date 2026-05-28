import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { env } from '@/lib/env';

const schema = z.object({
  paths: z.array(z.string().startsWith('/')).min(1).max(50),
});

export async function POST(req: Request) {
  const secret = req.headers.get('x-revalidate-secret');
  if (secret !== env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  for (const path of parsed.data.paths) {
    revalidatePath(path);
  }
  return NextResponse.json({ ok: true, revalidated: parsed.data.paths.length });
}
