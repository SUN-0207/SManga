import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { sourcesApi } from '@/api/sources';
import { jobsApi } from '@/api/jobs';
import { listStories } from '@/api/stories';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
});

function AdminDashboard() {
  const sourcesQ = useQuery({ queryKey: ['sources'], queryFn: sourcesApi.list });
  const storiesQ = useQuery({
    queryKey: ['stories', { page: 1, limit: 1000 }],
    queryFn: () => listStories(1, 1000),
  });
  const jobsStatsQ = useQuery({ queryKey: ['jobs', 'stats'], queryFn: jobsApi.stats });

  const sourceCount = sourcesQ.data?.length ?? '…';
  const storyCount = storiesQ.data?.length ?? '…';
  const chapterCount = storiesQ.data
    ? storiesQ.data.reduce((sum, s) => sum + (s.totalChapters ?? 0), 0)
    : '…';

  const stats = jobsStatsQ.data;
  const jobCompleted = stats ? (stats.completed ?? 0) : '…';
  const jobFailed = stats ? (stats.failed ?? 0) : '…';
  const jobActive = stats ? ((stats.waiting ?? 0) + (stats.active ?? 0)) : '…';

  const cards = [
    { label: 'Sources', value: sourceCount },
    { label: 'Truyện', value: storyCount },
    { label: 'Chapter (tổng)', value: chapterCount },
    { label: 'Jobs hoàn thành', value: jobCompleted },
    { label: 'Jobs thất bại', value: jobFailed },
    { label: 'Jobs đang chờ', value: jobActive },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tổng quan</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
