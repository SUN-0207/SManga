import { getChapterContent } from '@/api/chapters';
import { CommentSection } from '@/components/comments/CommentSection';
import { ReadingProgressTracker } from '@/components/reader/ReadingProgressTracker';
import { useReadingSessionTracker } from '@/hooks/use-reading-session-tracker';
import { useTrackChapterView } from '@/hooks/use-track-view';
import { useReaderPrefs } from '@/stores/reader-prefs-store';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, List, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

export const Route = createFileRoute('/truyen/$slug/chuong/$index')({
  component: ChapterReader,
  validateSearch: (s: Record<string, unknown>) => ({
    commentsPage: Number(s.commentsPage) || 1,
  }),
});

function ChapterReader() {
  const { slug, index } = Route.useParams();
  const navigate = useNavigate();
  const setSettingsOpen = useReaderPrefs((s) => s.setSettingsOpen);
  const fontSize = useReaderPrefs((s) => s.fontSize);
  const fontFamily = useReaderPrefs((s) => s.fontFamily);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Scroll to top on chapter change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [slug, index]);

  const { data, isLoading } = useQuery({
    queryKey: ['chapter', slug, index],
    queryFn: () => getChapterContent(slug, index),
  });

  // Plan D: fire view increment after 3s on page (chapter UUID, not index number).
  // data?.chapter.id uses optional chaining because this hook is called BEFORE the
  // isLoading guard — data is undefined during loading. The hook handles undefined internally
  // (returns early when chapterId is falsy), so this is safe.
  useTrackChapterView(data?.chapter.id);

  // Plan C: accumulate session seconds for weeklyHours stats. Called before the
  // isLoading guard — hook returns early when storyId is undefined. `index` is
  // the route param string (always defined once the route matches).
  useReadingSessionTracker(data?.story.id, data ? index : undefined);

  // Auto-hide chrome on scroll-down, show on scroll-up / mouse-move / touch
  useEffect(() => {
    let lastY = window.scrollY;
    let hideTimer: ReturnType<typeof setTimeout>;

    function onScroll() {
      const y = window.scrollY;
      const goingDown = y > lastY;
      lastY = y;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      setScrollProgress(max > 0 ? Math.min(100, (y / max) * 100) : 0);
      if (goingDown && y > 200) {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setChromeVisible(false), 600);
      } else if (!goingDown) {
        clearTimeout(hideTimer);
        setChromeVisible(true);
      }
    }

    function onInteract() {
      clearTimeout(hideTimer);
      setChromeVisible(true);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('mousemove', onInteract);
    window.addEventListener('touchstart', onInteract);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('mousemove', onInteract);
      window.removeEventListener('touchstart', onInteract);
      clearTimeout(hideTimer);
    };
  }, []);

  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (isLoading || !data) {
    return <div className="container py-20 text-center text-fg-muted">Đang tải chương...</div>;
  }

  const { chapter, story, prev, next } = data;

  // Strip redundant "Chương N:" prefix from title for clean display
  const cleanTitle = chapter.title.replace(/^Chương\s*\d+(?:\.\d+)?\s*:?\s*/i, '');

  const fontSizeClass =
    (
      {
        '15': 'text-[15px] leading-[1.7]',
        '18': 'text-[17px] sm:text-[18px] leading-[1.75]',
        '20': 'text-[18px] sm:text-[20px] leading-[1.75]',
        '24': 'text-[20px] sm:text-[24px] leading-[1.7]',
      } as Record<string, string>
    )[fontSize] ?? 'text-[18px] leading-[1.75]';

  const fontFamilyClass =
    fontFamily === 'sans' ? 'font-sans' : fontFamily === 'mono' ? 'font-mono' : 'font-prose';

  // Word-based reading time (Spec C: ceil(wordCount / 250))
  const wordCount = (chapter.content?.match(/\S+/g) ?? []).length;
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 250));

  // Drop-cap eligibility — suppress on smallest font size, when no letter in first 20 chars,
  // or when the user requests reduced motion (the gradient shimmer can read as motion).
  // The store ships fontSize as the string union '15' | '18' | '20' | '24'. Suppress at '15' per Spec C.
  const dropCapAllowed = fontSize !== '15' && !reduceMotion;

  function renderParagraph(para: string, i: number) {
    // Scene break detector
    const trimmed = para.trim();
    if (trimmed === '* * *' || trimmed === '***' || /^[*·•・]{3,}$/.test(trimmed)) {
      return (
        <p key={i} aria-hidden className="scene-break">
          · · ·
        </p>
      );
    }
    if (i === 0 && dropCapAllowed) {
      // Find first letter (skip leading non-letters) — Unicode-aware
      const match = para.match(/^([^\p{L}]{0,20})(\p{L})(.*)$/su);
      if (match) {
        const [, prefix, letter, rest] = match;
        return (
          <p key={i}>
            {prefix}
            <span className="drop-cap" aria-hidden>
              {letter}
            </span>
            <span className="sr-only">{letter}</span>
            {rest}
          </p>
        );
      }
    }
    return <p key={i}>{para}</p>;
  }

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* Auto-save reading progress after 5s (non-visual, non-critical) */}
      <ReadingProgressTracker storyId={story.id} chapterIndex={chapter.index} />

      {/* Scroll progress bar — fixed top, 2px pink gradient */}
      <div aria-hidden className="fixed top-0 left-0 right-0 h-0.5 bg-bg-subtle z-50">
        <div
          className="h-full bg-accent-gradient shadow-glow-pink-soft"
          style={{
            width: `${scrollProgress}%`,
            transition: reduceMotion ? 'none' : 'width 100ms linear',
          }}
        />
      </div>

      {/* Top chrome — auto-hides on scroll-down */}
      <header
        className={`fixed top-0 left-0 right-0 z-40 bg-bg/70 backdrop-blur-md border-b border-border transition-transform duration-200 ${
          chromeVisible || reduceMotion ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="container flex items-center justify-between h-12 sm:h-14 gap-3">
          <button
            type="button"
            onClick={() =>
              navigate({
                to: '/truyen/$slug',
                params: { slug },
                search: { page: 1, commentsPage: 1 },
              })
            }
            aria-label="Quay lại trang truyện"
            className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-bg-subtle transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-label text-fg-subtle uppercase tracking-wider truncate">
              CHƯƠNG {chapter.index} / {story.totalChapters}
            </p>
            <p className="text-body-sm text-fg-muted truncate">{story.title}</p>
          </div>
          <div className="flex gap-1">
            <Link
              to="/truyen/$slug"
              params={{ slug }}
              search={{ page: Math.max(1, Math.ceil(Number(chapter.index) / 50)), commentsPage: 1 }}
              aria-label="Mục lục chương"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-bg-subtle transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <List className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Cài đặt đọc"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-bg-subtle transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Prose body */}
      <article className="container max-w-[65ch] py-16 sm:py-20 lg:py-24">
        <h1 className="font-prose font-semibold text-display-sm lg:text-display-md mb-2">
          {cleanTitle || chapter.title}
        </h1>
        <p className="text-label text-fg-subtle mb-9">
          CHƯƠNG {chapter.index} · {readingMinutes} PHÚT ĐỌC
          {chapter.viewCount > 0 && ` · ${chapter.viewCount.toLocaleString('vi-VN')} LƯỢT XEM`}
        </p>

        {chapter.isCrawled && chapter.content ? (
          <div className={`${fontFamilyClass} ${fontSizeClass} text-fg/95 [&_p]:mb-5`}>
            {chapter.content.split('\n\n').map(renderParagraph)}
          </div>
        ) : (
          <div className="border border-dashed border-border rounded-xl p-10 text-center text-fg-muted my-10">
            <p className="font-prose text-lg mb-1">Chương này chưa được crawl</p>
            <p className="text-body-sm">Quay lại sau nhé.</p>
          </div>
        )}
      </article>

      <CommentSection targetType="chapter" targetId={chapter.id} slug={slug} chapterIndex={index} />

      {/* Floating prev/next pill — always visible, thumb-zone */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex gap-2 bg-bg/80 backdrop-blur-md p-1.5 rounded-full border border-border shadow-elev">
        {prev ? (
          <Link
            to="/truyen/$slug/chuong/$index"
            params={{ slug, index: String(prev.index) }}
            search={{ commentsPage: 1 }}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-bg-subtle text-body-sm text-fg-muted hover:text-fg transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ← Ch.{prev.index}
          </Link>
        ) : (
          <span className="inline-flex items-center h-9 px-4 rounded-full text-body-sm text-fg-subtle opacity-40 select-none">
            ← Ch.{Number(chapter.index) - 1}
          </span>
        )}
        {next ? (
          <Link
            to="/truyen/$slug/chuong/$index"
            params={{ slug, index: String(next.index) }}
            search={{ commentsPage: 1 }}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-accent-gradient text-white text-body-sm font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Ch.{next.index} →
          </Link>
        ) : (
          <span className="inline-flex items-center h-9 px-4 rounded-full text-body-sm text-fg-subtle opacity-40 select-none">
            Hết truyện
          </span>
        )}
      </div>
    </div>
  );
}
