import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const result = await db.execute(sql`
    UPDATE pgboss.job
    SET state = 'created', retrycount = 0, startedon = NULL, completedon = NULL
    WHERE id = ${id} AND state IN ('failed', 'cancelled')
    RETURNING id;
  `);
  const affected = Array.isArray(result) ? result.length : (result as { rowCount?: number }).rowCount ?? 0;
  if (affected === 0) return NextResponse.json({ error: 'not found or not retryable' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
