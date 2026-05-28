import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db';

export async function GET() {
  const db = getDb();
  const stateCounts = await db.execute<{ state: string; count: number }>(sql`
    SELECT state, COUNT(*)::int AS count FROM pgboss.job GROUP BY state ORDER BY state;
  `);
  const rows = (stateCounts as { rows?: { state: string; count: number }[] }).rows
    ?? (stateCounts as unknown as { state: string; count: number }[]);
  return NextResponse.json({ states: rows });
}
