import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAdapterForUrl } from '@smanga/crawler';
import { auth } from '@/server/auth';
import { enqueueImportStory } from '@/server/queue';

const schema = z.object({ url: z.string().url() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid url' }, { status: 400 });

  try {
    resolveAdapterForUrl(parsed.data.url);
  } catch {
    return NextResponse.json({ error: 'no adapter registered for that hostname' }, { status: 400 });
  }

  const session = await auth();
  const requestedBy = (session?.user as { id?: string } | undefined)?.id ?? null;
  const jobId = await enqueueImportStory({ url: parsed.data.url, requestedBy });
  return NextResponse.json({ jobId });
}
