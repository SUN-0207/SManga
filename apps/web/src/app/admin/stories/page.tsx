import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { story } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ImportStoryForm } from '@/components/admin/ImportStoryForm';

export const dynamic = 'force-dynamic';

export default async function AdminStoriesPage() {
  const rows = await getDb()
    .select({
      id: story.id,
      slug: story.slug,
      title: story.title,
      author: story.author,
      status: story.status,
      totalChapters: story.totalChapters,
      updatedAt: story.updatedAt,
    })
    .from(story)
    .orderBy(desc(story.updatedAt))
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Truyện</h1>
      <ImportStoryForm />
      <Table>
        <Thead>
          <Tr>
            <Th>Tiêu đề</Th><Th>Tác giả</Th><Th>Trạng thái</Th><Th>Chapter</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td>
                <Link href={`/admin/stories/${r.id}`} className="underline">{r.title}</Link>
              </Td>
              <Td>{r.author ?? '—'}</Td>
              <Td><Badge variant="secondary">{r.status}</Badge></Td>
              <Td>{r.totalChapters}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
