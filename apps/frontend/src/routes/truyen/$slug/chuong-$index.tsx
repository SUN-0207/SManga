import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getChapterContent } from '@/api/chapters';
import { ChapterNav } from '@/components/reader/ChapterNav';

export const Route = createFileRoute('/truyen/$slug/chuong-$index')({
  component: ChapterReader,
});

function ChapterReader() {
  const { slug, index } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['chapter', slug, index],
    queryFn: () => getChapterContent(slug, index),
  });

  if (isLoading || !data) {
    return <div className="container py-8">Đang tải...</div>;
  }

  const navProps = {
    slug,
    current: data.chapter.index,
    prev: data.prev,
    next: data.next,
  };

  return (
    <article className="container max-w-3xl py-8">
      <header className="mb-4">
        <p className="text-sm text-muted-foreground">
          <a
            href={`/truyen/${slug}`}
            className="hover:underline transition-colors duration-150"
          >
            {data.story.title}
          </a>
        </p>
        <h1 className="text-2xl font-bold font-heading mt-1">
          Chương {data.chapter.index}:{' '}
          {data.chapter.title.replace(/^Chương\s*\d+(?:\.\d+)?\s*:?\s*/i, '')}
        </h1>
      </header>

      <ChapterNav {...navProps} />

      {data.chapter.isCrawled ? (
        <div
          className="max-w-prose mx-auto whitespace-pre-line leading-[1.75] my-8 text-foreground"
          style={{
            fontSize: 'var(--reader-font-size, 18px)',
            fontFamily: 'var(--reader-font-family, Newsreader, ui-serif, Georgia, serif)',
          }}
        >
          {data.chapter.content}
        </div>
      ) : (
        <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground my-8">
          Chương này chưa được crawl.
        </div>
      )}

      <ChapterNav {...navProps} />
    </article>
  );
}
