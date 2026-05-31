import { Link, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, X } from 'lucide-react';
import { meApi } from '@/api/me';
import { useAuthStore } from '@/stores/auth-store';
import { useContinueReadingDismiss } from '@/stores/continue-reading-dismiss-store';

/**
 * Plan C: wired to GET /me/reading-progress/continue-reading.
 * Visibility rules:
 *   1. anonymous → hidden (query disabled)
 *   2. no progress → BE returns 204 → hidden
 *   3. current route is the chapter reader for THIS exact story → hidden
 *   4. user dismissed for the same {storyId, updatedAt} pair → hidden until they read more
 */
export function ContinueReadingBar() {
  const user = useAuthStore((s) => s.user);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const dismissedKey = useContinueReadingDismiss((s) => s.dismissedKey);
  const dismiss = useContinueReadingDismiss((s) => s.dismiss);

  const q = useQuery({
    queryKey: ['me', 'continue-reading'],
    queryFn: () => meApi.continueReading(),
    enabled: !!user,
    staleTime: 60_000,
  });

  if (!user) return null;
  const cr = q.data;
  if (!cr) return null;

  // Hide when already reading the same story's chapter.
  // Note: AppShell already hides the bar on ALL chapter routes via its `isChapter` regex,
  // so in practice this branch never fires today. We keep it as intentional double-defense:
  // if AppShell's regex ever changes, the bar still won't appear "on top of itself" while
  // the reader is on the matching chapter.
  const onThisChapter = path.startsWith(`/truyen/${cr.storySlug}/chuong/`);
  if (onThisChapter) return null;

  // Hide when user dismissed this exact (story, last-read-chapter) pair. Once they read
  // more, BE's updatedAt advances and the dismissed key no longer matches → bar returns.
  const key = `${cr.storyId}:${cr.updatedAt}`;
  if (dismissedKey === key) return null;

  const chapter = Math.floor(Number(cr.chapterIndex));

  // Sticky offset must match the responsive height of DesktopTopNav.
  // Plan B Task 10 sets the admin top bar to `h-14 sm:h-16` and the reader nav follows
  // the same pattern. If the reader nav uses a different height, update both values here.
  return (
    <div
      className="sticky top-14 sm:top-16 z-20 border-b border-accent/20 transition-colors duration-fast"
      style={{
        background:
          'linear-gradient(90deg, rgba(236,72,153,0.12), rgba(244,114,182,0.04))',
      }}
    >
      <div className="container flex items-center h-10 sm:h-12 gap-2 sm:gap-3">
        <Link
          to="/truyen/$slug/chuong/$index"
          params={{ slug: cr.storySlug, index: String(chapter) }}
          className="flex-1 min-w-0 flex items-center gap-3 hover:opacity-90 transition-opacity duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
        >
          {cr.hasCover ? (
            <img
              src={`/api/v1/cover/${cr.storyId}`}
              alt=""
              loading="lazy"
              className="h-7 w-5 sm:h-9 sm:w-7 rounded-sm object-cover flex-shrink-0"
            />
          ) : (
            <div
              aria-hidden
              className="h-7 w-5 sm:h-9 sm:w-7 bg-accent-gradient rounded-sm flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] sm:text-label text-fg-muted truncate">
              ĐỌC TIẾP · CHƯƠNG {chapter} / {cr.totalChapters}
            </p>
            <p className="text-body-sm sm:text-body font-semibold truncate">
              {cr.storyTitle}
            </p>
          </div>
        </Link>
        <Link
          to="/truyen/$slug/chuong/$index"
          params={{ slug: cr.storySlug, index: String(chapter) }}
          className="hidden sm:inline-flex items-center h-7 px-3 rounded-md bg-fg text-bg text-body-sm font-semibold hover:opacity-90 transition-opacity duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Tiếp tục →
        </Link>
        <Link
          to="/truyen/$slug/chuong/$index"
          params={{ slug: cr.storySlug, index: String(chapter) }}
          aria-label="Tiếp tục đọc"
          className="sm:hidden inline-flex items-center justify-center h-8 w-8 rounded-md text-accent cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </Link>
        <button
          type="button"
          onClick={() => dismiss(key)}
          aria-label="Ẩn thanh đọc tiếp"
          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
