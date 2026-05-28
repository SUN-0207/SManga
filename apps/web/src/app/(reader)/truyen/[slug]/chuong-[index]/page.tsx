import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, gt, lt } from 'drizzle-orm';
import { chapter, story } from '@smanga/db/schema';
import { getDb } from '@/server/db';
import { decompressChapterContent } from '@/server/chapter-content';
import { ChapterNav } from '@/components/reader/ChapterNav';

export const revalidate = 3600;

interface RouteParams {
  slug: string;
  index: string;
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { slug, index } = await params;
  const [row] = await getDb()
    .select({ title: chapter.title, storyTitle: story.title })
    .from(chapter)
    .innerJoin(story, eq(chapter.storyId, story.id))
    .where(and(eq(story.slug, slug), eq(chapter.index, index)))
    .limit(1);
  if (!row) return { title: 'SManga' };
  return {
    title: `${row.title} — ${row.storyTitle} — SManga`,
    description: `${row.storyTitle}: ${row.title}`,
  };
}

export default async function ChapterPage({ params }: { params: Promise<RouteParams> }) {
  const { slug, index } = await params;
  const db = getDb();

  const [row] = await db
    .select({
      id: chapter.id,
      index: chapter.index,
      title: chapter.title,
      content: chapter.contentText,
      status: chapter.status,
      storyId: story.id,
      storySlug: story.slug,
      storyTitle: story.title,
    })
    .from(chapter)
    .innerJoin(story, eq(chapter.storyId, story.id))
    .where(and(eq(story.slug, slug), eq(chapter.index, index)))
    .limit(1);

  if (!row) notFound();

  const text = decompressChapterContent(row.content as unknown as Buffer | null);
  const isCrawled = row.status === 'crawled' && text !== null;

  const [prev] = await db
    .select({ index: chapter.index, title: chapter.title })
    .from(chapter)
    .where(and(eq(chapter.storyId, row.storyId), lt(chapter.index, row.index)))
    .orderBy(desc(chapter.index))
    .limit(1);

  const [next] = await db
    .select({ index: chapter.index, title: chapter.title })
    .from(chapter)
    .where(and(eq(chapter.storyId, row.storyId), gt(chapter.index, row.index)))
    .orderBy(asc(chapter.index))
    .limit(1);

  const navProps = {
    slug,
    current: Number(row.index),
    prev: prev ? { index: Number(prev.index), title: prev.title } : null,
    next: next ? { index: Number(next.index), title: next.title } : null,
  };

  return (
    <article className="container max-w-3xl py-8">
      <header className="mb-4">
        <p className="text-sm text-muted-foreground">
          <a href={`/truyen/${slug}`} className="hover:underline">{row.storyTitle}</a>
        </p>
        <h1 className="text-2xl font-bold mt-1">
          Chương {row.index}: {row.title.replace(/^Chương\s*\d+(?:\.\d+)?\s*:?\s*/i, '')}
        </h1>
      </header>

      <ChapterNav {...navProps} />

      {isCrawled ? (
        <div
          className="prose prose-sm sm:prose-base max-w-none whitespace-pre-line leading-relaxed"
          style={{
            fontSize: 'var(--reader-font-size, 18px)',
            fontFamily: 'var(--reader-font-family, ui-serif, Georgia, serif)',
          }}
        >
          {text}
        </div>
      ) : (
        <div className="border border-dashed border-border rounded p-8 text-center text-muted-foreground">
          Chương này chưa được crawl. Quay lại sau hoặc liên hệ quản trị.
        </div>
      )}

      <ChapterNav {...navProps} />
    </article>
  );
}
