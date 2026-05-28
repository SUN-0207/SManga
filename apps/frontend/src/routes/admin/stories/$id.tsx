import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { ChapterCrawlPanel } from '@/components/admin/ChapterCrawlPanel';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table';

export const Route = createFileRoute('/admin/stories/$id')({
  component: AdminStoryDetail,
});

interface StoryRow {
  id: string;
  title: string;
  author: string | null;
  status: string;
  totalChapters: number;
  slug: string;
}

interface StorySource {
  sourceId: string;
  externalUrl: string;
  isPrimary: boolean;
}

interface ChapterRow {
  id: string;
  index: string;
  title: string;
  status: 'pending' | 'crawled' | 'failed';
  lastError: string | null;
  crawledAt: string | null;
  size: number | null;
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'destructive' | 'secondary'> = {
  pending: 'secondary',
  crawled: 'success',
  failed: 'destructive',
};

function AdminStoryDetail() {
  const { id } = Route.useParams();

  const storyQ = useQuery({
    queryKey: ['admin', 'story', id],
    queryFn: () => api.get<StoryRow>(`/stories/${id}`).then((r) => r.data),
  });

  const chaptersQ = useQuery({
    queryKey: ['admin', 'story', id, 'chapters'],
    queryFn: () => api.get<ChapterRow[]>(`/stories/${id}/chapters`).then((r) => r.data),
  });

  const story = storyQ.data;
  const chapters = chaptersQ.data ?? [];

  // Derive sources from story detail or fetch separately if needed
  // The admin story detail endpoint returns the basic story row; sources need a separate call
  // but since the plan doesn't expose sources on GET /stories/:id for admin,
  // we show what we have from storySource via the story slug endpoint if needed.
  // For now, render whatever comes back.

  if (storyQ.isLoading) return <p className="text-muted-foreground">Đang tải...</p>;
  if (!story) return <p className="text-destructive">Không tìm thấy truyện.</p>;

  const crawledCount = chapters.filter((c) => c.status === 'crawled').length;
  const pendingCount = chapters.filter((c) => c.status === 'pending').length;
  const failedCount = chapters.filter((c) => c.status === 'failed').length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/admin/stories"
          className="text-sm underline text-muted-foreground hover:no-underline cursor-pointer"
        >
          ← Truyện
        </Link>
        <h1 className="text-2xl font-bold mt-2">{story.title}</h1>
        <p className="text-muted-foreground">
          {story.author ?? '—'} · {story.totalChapters} chapter
        </p>
      </div>

      {/* Chapter stats */}
      <div className="flex gap-4 text-sm">
        <span className="text-emerald-600 font-medium">{crawledCount} đã crawl</span>
        <span className="text-muted-foreground">{pendingCount} chờ</span>
        {failedCount > 0 && <span className="text-destructive">{failedCount} lỗi</span>}
      </div>

      {/* Crawl controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Crawl chapter</CardTitle>
        </CardHeader>
        <CardContent>
          <ChapterCrawlPanel storyId={id} />
        </CardContent>
      </Card>

      {/* Chapter list */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Danh sách chapter</h2>
        {chaptersQ.isLoading ? (
          <p className="text-muted-foreground">Đang tải...</p>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th className="w-16">#</Th>
                <Th>Tiêu đề</Th>
                <Th className="w-32">Trạng thái</Th>
                <Th className="w-24">Bytes</Th>
                <Th>Lỗi</Th>
              </Tr>
            </Thead>
            <Tbody>
              {chapters.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-mono text-xs">{c.index}</Td>
                  <Td className="text-sm">{c.title}</Td>
                  <Td>
                    <Badge variant={STATUS_VARIANT[c.status] ?? 'secondary'}>{c.status}</Badge>
                  </Td>
                  <Td className="text-xs text-muted-foreground">{c.size ?? '—'}</Td>
                  <Td className="text-xs text-destructive truncate max-w-xs">
                    {c.lastError ?? ''}
                  </Td>
                </Tr>
              ))}
              {chapters.length === 0 && (
                <Tr>
                  <Td colSpan={5} className="text-center text-muted-foreground py-8">
                    Không có chapter nào
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
