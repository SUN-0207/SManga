import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sourcesApi } from '@/api/sources';
import { SourceForm } from '@/components/admin/SourceForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table';
import { useState } from 'react';

export const Route = createFileRoute('/admin/sources')({
  component: AdminSourcesPage,
});

function AdminSourcesPage() {
  const queryClient = useQueryClient();
  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: sourcesApi.list,
  });
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleRemove(id: string) {
    if (!confirm(`Xóa source "${id}"?`)) return;
    setDeleting(id);
    try {
      await sourcesApi.remove(id);
      await queryClient.invalidateQueries({ queryKey: ['sources'] });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sources</h1>
      <SourceForm />
      {isLoading ? (
        <p className="text-muted-foreground">Đang tải...</p>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>ID</Th>
              <Th>Tên</Th>
              <Th>Base URL</Th>
              <Th>RPS</Th>
              <Th>Trạng thái</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {sources.map((r) => (
              <Tr key={r.id}>
                <Td className="font-mono text-xs">{r.id}</Td>
                <Td>{r.name}</Td>
                <Td className="text-xs">{r.baseUrl}</Td>
                <Td>{r.rateLimitRps}</Td>
                <Td>
                  <Badge variant={r.isActive ? 'success' : 'secondary'}>
                    {r.isActive ? 'active' : 'inactive'}
                  </Badge>
                </Td>
                <Td>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRemove(r.id)}
                    disabled={deleting === r.id}
                    className="cursor-pointer text-destructive hover:text-destructive"
                  >
                    Xóa
                  </Button>
                </Td>
              </Tr>
            ))}
            {sources.length === 0 && (
              <Tr>
                <Td colSpan={6} className="text-center text-muted-foreground py-8">
                  Chưa có source nào
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
