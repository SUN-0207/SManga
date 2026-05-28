import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowUp } from 'lucide-react';
import { getChapterContent } from '@/api/chapters';
import { ChapterNav } from '@/components/reader/ChapterNav';

export const Route = createFileRoute('/truyen/$slug/chuong/$index')({
  component: ChapterReader,
});

function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      const doc = document.documentElement;
      const scrolled = window.scrollY;
      const max = doc.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, scrolled / max) : 0);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return progress;
}

function ChapterReader() {
  const { slug, index } = Route.useParams();
  const progress = useScrollProgress();
  const [showTopBtn, setShowTopBtn] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTopBtn(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [slug, index]);

  const { data, isLoading } = useQuery({
    queryKey: ['chapter', slug, index],
    queryFn: () => getChapterContent(slug, index),
  });

  if (isLoading || !data) {
    return (
      <div className="container py-20 text-center text-muted-foreground">
        Đang tải chương...
      </div>
    );
  }

  const cleanTitle = data.chapter.title.replace(/^Chương\s*\d+(?:\.\d+)?\s*:?\s*/i, '');
  const navProps = { slug, current: data.chapter.index, prev: data.prev, next: data.next };

  return (
    <article className="relative pb-24">
      {/* Reading progress bar */}
      <div
        className="fixed top-16 inset-x-0 h-[2px] z-20 pointer-events-none"
        aria-hidden
      >
        <div
          className="h-full bg-[hsl(var(--color-cta))] origin-left transition-transform duration-150"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

      <div className="container max-w-2xl pt-10">
        {/* Header */}
        <header className="space-y-2 mb-6">
          <Link
            to="/truyen/$slug"
            params={{ slug }}
            search={{ page: 1 }}
            className="inline-flex items-center text-xs uppercase tracking-[0.28em] text-muted-foreground font-medium hover:text-foreground transition-colors duration-200 cursor-pointer"
          >
            ← {data.story.title}
          </Link>
          <p className="font-heading text-base text-muted-foreground">
            Chương {data.chapter.index}
          </p>
          <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight leading-[1.15]">
            {cleanTitle}
          </h1>
        </header>

        <ChapterNav {...navProps} />

        {/* Content */}
        {data.chapter.isCrawled && data.chapter.content ? (
          <div
            className="reader-prose font-body whitespace-pre-line my-10 text-foreground/90 max-w-prose mx-auto"
            style={{
              fontSize: 'var(--reader-font-size, 18px)',
              fontFamily: 'var(--reader-font-family, Newsreader, ui-serif, Georgia, serif)',
              lineHeight: 1.85,
            }}
          >
            {data.chapter.content}
          </div>
        ) : (
          <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground my-10">
            <p className="font-heading text-lg mb-1">Chương này chưa được crawl</p>
            <p className="text-sm">Quay lại sau nhé.</p>
          </div>
        )}

        <ChapterNav {...navProps} />
      </div>

      {/* Floating back to top */}
      {showTopBtn && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Lên đầu trang"
          className="fixed bottom-6 right-6 z-20 h-11 w-11 rounded-full bg-foreground text-background shadow-lg hover:opacity-90 transition-all duration-200 flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </article>
  );
}
