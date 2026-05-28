import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { listStories } from '@/api/stories';
import { ImportStoryForm } from '@/components/admin/ImportStoryForm';
import { Badge } from '@/components/ui/badge';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table';

export const Route = createFileRoute('/admin/stories/')({
  component: AdminStoriesPage,
});

function AdminStoriesPage() {
  const { data: stories = [], isLoading } = useQuery({
    queryKey: ['stories', { page: 1, limit: 100 }],
    queryFn: () => listStories(1, 100),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Truyện</h1>
      <ImportStoryForm />
      {isLoading ? (
        <p className="text-muted-foreground">Đang tải...</p>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Tiêu đề</Th>
              <Th>Tác giả</Th>
              <Th>Trạng thái</Th>
              <Th>Chapter</Th>
              <Th>Cập nhật</Th>
            </Tr>
          </Thead>
          <Tbody>
            {stories.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <Link
                    to="/admin/stories/$id"
                    params={{ id: r.id }}
                    className="underline hover:no-underline cursor-pointer"
                  >
                    {r.title}
                  </Link>
                </Td>
                <Td>{r.author ?? '—'}</Td>
                <Td>
                  <Badge variant="secondary">{r.status}</Badge>
                </Td>
                <Td>{r.totalChapters}</Td>
                <Td className="text-xs text-muted-foreground">
                  {new Date(r.updatedAt).toLocaleDateString('vi-VN')}
                </Td>
              </Tr>
            ))}
            {stories.length === 0 && (
              <Tr>
                <Td colSpan={5} className="text-center text-muted-foreground py-8">
                  Chưa có truyện nào
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
