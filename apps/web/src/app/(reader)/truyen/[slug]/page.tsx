import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, count, eq } from 'drizzle-orm';
import { chapter, genre, story, storyGenre } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { ChapterList, type ChapterListItem } from '@/components/reader/ChapterList';
import { Badge } from '@/components/ui/badge';

export const revalidate = 300;

const PAGE_SIZE = 50;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [s] = await getDb()
    .select({ title: story.title, description: story.description, author: story.author })
    .from(story)
    .where(eq(story.slug, slug))
    .limit(1);
  if (!s) return { title: 'SManga' };
  const desc = (s.description ?? '').slice(0, 160) || `Đọc truyện ${s.title}.`;
  return {
    title: `${s.title} — SManga`,
    description: desc,
    openGraph: { title: s.title, description: desc, type: 'book' },
  };
}

export default async function StoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const db = getDb();

  const [s] = await db
    .select({
      id: story.id,
      slug: story.slug,
      title: story.title,
      author: story.author,
      description: story.description,
      status: story.status,
      totalChapters: story.totalChapters,
    })
    .from(story)
    .where(eq(story.slug, slug))
    .limit(1);
  if (!s) notFound();

  const totalRowsResult = await db
    .select({ value: count() })
    .from(chapter)
    .where(eq(chapter.storyId, s.id));
  const totalRows = totalRowsResult[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const chapters = await db
    .select({
      index: chapter.index,
      title: chapter.title,
      status: chapter.status,
    })
    .from(chapter)
    .where(eq(chapter.storyId, s.id))
    .orderBy(asc(chapter.index))
    .limit(PAGE_SIZE)
    .offset((safePage - 1) * PAGE_SIZE);

  const genres = await db
    .select({ slug: genre.slug, name: genre.name })
    .from(storyGenre)
    .innerJoin(genre, eq(storyGenre.genreId, genre.id))
    .where(eq(storyGenre.storyId, s.id));

  const items: ChapterListItem[] = chapters.map((c) => ({
    index: Number(c.index),
    title: c.title,
    isCrawled: c.status === 'crawled',
  }));

  const firstCrawled = await db
    .select({ index: chapter.index })
    .from(chapter)
    .where(and(eq(chapter.storyId, s.id), eq(chapter.status, 'crawled')))
    .orderBy(asc(chapter.index))
    .limit(1);

  return (
    <div className="container py-8 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
        <div className="aspect-[3/4] bg-muted overflow-hidden rounded">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/cover/${s.id}`} alt={`Bìa ${s.title}`} className="w-full h-full object-cover" />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">{s.title}</h1>
          <p className="text-muted-foreground">
            Tác giả: {s.author ?? 'Khuyết danh'}
          </p>
          <div className="flex gap-2 flex-wrap items-center">
            <Badge variant={s.status === 'completed' ? 'success' : 'secondary'}>
              {s.status === 'completed' ? 'Hoàn thành' : s.status === 'ongoing' ? 'Đang ra' : s.status}
            </Badge>
            <span className="text-sm text-muted-foreground">{s.totalChapters} chương</span>
          </div>
          {genres.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {genres.map((g) => (
                <span key={g.slug} className="text-xs px-2 py-0.5 rounded bg-muted">
                  {g.name}
                </span>
              ))}
            </div>
          )}
          {firstCrawled[0] && (
            <Link
              href={`/truyen/${s.slug}/chuong-${firstCrawled[0].index}`}
              className="inline-block mt-2 px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 text-sm"
            >
              Đọc từ đầu
            </Link>
          )}
        </div>
      </div>

      {s.description && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Giới thiệu</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed">{s.description}</p>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Danh sách chương</h2>
        <ChapterList slug={s.slug} chapters={items} currentPage={safePage} totalPages={totalPages} />
      </section>
    </div>
  );
}
