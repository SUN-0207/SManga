import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { JobsTable, type JobRow } from '@/components/admin/JobsTable';

export const dynamic = 'force-dynamic';

export default async function AdminJobsPage() {
  const db = getDb();
  const stateResult = await db.execute<{ state: string; count: number }>(sql`
    SELECT state, COUNT(*)::int AS count FROM pgboss.job GROUP BY state ORDER BY state;
  `);
  const stateRows = (stateResult as { rows?: { state: string; count: number }[] }).rows
    ?? (stateResult as unknown as { state: string; count: number }[]);

  const jobsResult = await db.execute<{
    id: string; name: string; state: string; retrycount: number; createdon: string; output: unknown;
  }>(sql`
    SELECT id::text AS id, name, state, retrycount, createdon, output
    FROM pgboss.job
    ORDER BY createdon DESC
    LIMIT 100;
  `);
  const jobs = ((jobsResult as { rows?: JobRow[] }).rows ?? (jobsResult as unknown as JobRow[])) as JobRow[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Jobs</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stateRows.map((s) => (
          <Card key={s.state}>
            <CardHeader><CardTitle className="text-xs text-muted-foreground">{s.state}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{s.count}</div></CardContent>
          </Card>
        ))}
      </div>

      <JobsTable jobs={jobs} />
    </div>
  );
}
