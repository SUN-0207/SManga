import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { chapter, story, storySource } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChapterCrawlPanel } from '@/components/admin/ChapterCrawlPanel';

export const dynamic = 'force-dynamic';

export default async function AdminStoryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [s] = await db.select().from(story).where(eq(story.id, id)).limit(1);
  if (!s) notFound();

  const sources = await db.select().from(storySource).where(eq(storySource.storyId, id));
  const chapters = await db
    .select({
      id: chapter.id,
      index: chapter.index,
      title: chapter.title,
      status: chapter.status,
      lastError: chapter.lastError,
      crawledAt: chapter.crawledAt,
      size: chapter.contentByteSize,
    })
    .from(chapter)
    .where(eq(chapter.storyId, id))
    .orderBy(asc(chapter.index));

  const statusVariant: Record<string, 'default' | 'success' | 'destructive' | 'secondary'> = {
    pending: 'secondary',
    crawled: 'success',
    failed: 'destructive',
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/stories" className="text-sm underline text-muted-foreground">← Truyện</Link>
        <h1 className="text-2xl font-bold mt-2">{s.title}</h1>
        <p className="text-muted-foreground">{s.author ?? '—'} · {s.totalChapters} chapter</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Sources</CardTitle></CardHeader>
        <CardContent>
          {sources.map((src) => (
            <div key={src.sourceId} className="text-sm flex gap-4 items-center">
              <Badge variant={src.isPrimary ? 'default' : 'secondary'}>
                {src.sourceId}{src.isPrimary ? ' (primary)' : ''}
              </Badge>
              <a href={src.externalUrl} target="_blank" rel="noreferrer" className="underline text-xs">
                {src.externalUrl}
              </a>
            </div>
          ))}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-2">Chapter</h2>
        <ChapterCrawlPanel storyId={id} />
        <Table>
          <Thead>
            <Tr>
              <Th className="w-16">#</Th><Th>Tiêu đề</Th><Th className="w-32">Trạng thái</Th>
              <Th className="w-24">Bytes</Th><Th>Lỗi</Th>
            </Tr>
          </Thead>
          <Tbody>
            {chapters.map((c) => (
              <Tr key={c.id}>
                <Td className="font-mono">{c.index}</Td>
                <Td>{c.title}</Td>
                <Td><Badge variant={statusVariant[c.status]}>{c.status}</Badge></Td>
                <Td className="text-xs text-muted-foreground">{c.size ?? '—'}</Td>
                <Td className="text-xs text-destructive">{c.lastError ?? ''}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    </div>
  );
}
