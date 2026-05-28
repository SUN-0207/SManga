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
    id: string; name: string; state: string; retry_count: number; created_on: string; output: unknown;
  }>(sql`
    SELECT id::text AS id, name, state, retry_count, created_on, output
    FROM pgboss.job
    ORDER BY created_on DESC
    LIMIT 100;
  `);
  const rawJobs = ((jobsResult as { rows?: typeof jobsResult }).rows
    ?? (jobsResult as unknown as Array<{ id: string; name: string; state: string; retry_count: number; created_on: string; output: unknown }>));
  const jobs: JobRow[] = (rawJobs as Array<{ id: string; name: string; state: string; retry_count: number; created_on: string; output: unknown }>).map((r) => ({
    id: r.id,
    name: r.name,
    state: r.state,
    retryCount: r.retry_count,
    createdOn: r.created_on,
    output: r.output,
  }));

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
