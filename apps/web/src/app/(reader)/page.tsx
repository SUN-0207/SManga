import { desc, sql } from 'drizzle-orm';
import { story } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { StoryGrid } from '@/components/reader/StoryGrid';

export const revalidate = 300; // 5 minutes ISR

export default async function ReaderLanding() {
  const rows = await getDb()
    .select({
      id: story.id,
      slug: story.slug,
      title: story.title,
      author: story.author,
      status: story.status,
      totalChapters: story.totalChapters,
      hasCover: sql<boolean>`${story.cover} IS NOT NULL`,
    })
    .from(story)
    .orderBy(desc(story.updatedAt))
    .limit(48);

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mới cập nhật</h1>
        <p className="text-muted-foreground text-sm">{rows.length} truyện</p>
      </div>
      <StoryGrid stories={rows} />
    </div>
  );
}
