import { source } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SourceForm } from '@/components/admin/SourceForm';

export const dynamic = 'force-dynamic';

export default async function AdminSourcesPage() {
  const rows = await getDb().select().from(source).orderBy(source.id);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sources</h1>
      <SourceForm />
      <Table>
        <Thead>
          <Tr>
            <Th>ID</Th><Th>Tên</Th><Th>Base URL</Th><Th>RPS</Th><Th>Trạng thái</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((r) => (
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
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
