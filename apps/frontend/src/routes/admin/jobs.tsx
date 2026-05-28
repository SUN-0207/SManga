import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { jobsApi } from '@/api/jobs';
import { JobsTable } from '@/components/admin/JobsTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/admin/jobs')({
  component: AdminJobsPage,
});

const STAT_LABELS: Record<string, string> = {
  waiting: 'Chờ',
  active: 'Đang chạy',
  completed: 'Hoàn thành',
  failed: 'Thất bại',
  delayed: 'Delay',
  paused: 'Dừng',
};

function AdminJobsPage() {
  const statsQ = useQuery({
    queryKey: ['jobs', 'stats'],
    queryFn: jobsApi.stats,
    refetchInterval: 5000,
  });

  const jobsQ = useQuery({
    queryKey: ['jobs', 'list'],
    queryFn: jobsApi.list,
    refetchInterval: 5000,
  });

  const stats = statsQ.data ?? {};
  const jobs = jobsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Jobs</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void statsQ.refetch();
            void jobsQ.refetch();
          }}
          className="cursor-pointer"
        >
          Làm mới
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(stats).map(([state, count]) => (
          <Card key={state}>
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground">
                {STAT_LABELS[state] ?? state}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="text-2xl font-bold">{count}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Jobs table */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recent jobs</h2>
        {jobsQ.isLoading ? (
          <p className="text-muted-foreground">Đang tải...</p>
        ) : (
          <JobsTable jobs={jobs} />
        )}
      </div>
    </div>
  );
}
