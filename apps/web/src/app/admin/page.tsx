import { count, eq } from 'drizzle-orm';
import { chapter, source, story } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const db = getDb();
  const storyRows = await db.select({ value: count() }).from(story);
  const sourceRows = await db.select({ value: count() }).from(source);
  const chapterRows = await db.select({ value: count() }).from(chapter);
  const crawledRows = await db
    .select({ value: count() })
    .from(chapter)
    .where(eq(chapter.status, 'crawled'));

  const storyCount = storyRows[0]?.value ?? 0;
  const sourceCount = sourceRows[0]?.value ?? 0;
  const chapterCount = chapterRows[0]?.value ?? 0;
  const crawledCount = crawledRows[0]?.value ?? 0;

  const cards = [
    { label: 'Sources', value: sourceCount },
    { label: 'Truyện', value: storyCount },
    { label: 'Chapter', value: chapterCount },
    { label: 'Chapter đã crawl', value: crawledCount },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tổng quan</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
