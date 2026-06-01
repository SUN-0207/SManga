import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';

export interface ChapterListItem {
  index: number;
  title: string;
  isCrawled: boolean;
}

export interface ChapterListProps {
  slug: string;
  chapters: ChapterListItem[];
  currentPage: number;
  totalPages: number;
}

export function ChapterList({ slug, chapters, currentPage, totalPages }: ChapterListProps) {
  if (chapters.length === 0) {
    return (
      <p className="text-center text-sm text-fg-muted py-12">
        Trang này chưa có chương nào.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-px">
        {chapters.map((c) => (
          <li key={c.index} className="border-b border-border/60 py-2.5">
            {c.isCrawled ? (
              <Link
                to="/truyen/$slug/chuong/$index"
                params={{ slug, index: String(c.index) }}
                search={{ commentsPage: 1 }}
                className="group flex items-baseline gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                <span className="font-sans font-semibold text-sm text-fg-muted/70 tabular-nums w-[5.25rem] shrink-0 group-hover:text-fg transition-colors duration-200">
                  Chương {c.index}
                </span>
                <span className="text-sm leading-snug line-clamp-1 group-hover:underline underline-offset-[3px] decoration-fg/40 transition-all duration-200">
                  {c.title.replace(/^Chương\s*\d+(?:\.\d+)?\s*:?\s*/i, '')}
                </span>
              </Link>
            ) : (
              <span
                className="flex items-baseline gap-3 text-fg-muted/60"
                title="Chưa crawl"
              >
                <span className="font-sans font-semibold text-sm tabular-nums w-[5.25rem] shrink-0">
                  Chương {c.index}
                </span>
                <span className="text-sm leading-snug line-clamp-1 flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  {c.title.replace(/^Chương\s*\d+(?:\.\d+)?\s*:?\s*/i, '')}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <Pagination slug={slug} currentPage={currentPage} totalPages={totalPages} />
      )}
    </div>
  );
}

function Pagination({
  slug,
  currentPage,
  totalPages,
}: {
  slug: string;
  currentPage: number;
  totalPages: number;
}) {
  const windowSize = 5;
  const start = Math.max(1, currentPage - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  const pages: number[] = [];
  for (let p = start; p <= end; p += 1) pages.push(p);

  const baseLink =
    'inline-flex items-center justify-center min-w-9 h-9 px-3 rounded-full text-sm border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <nav
      className="flex items-center justify-center gap-1.5 pt-6 flex-wrap"
      aria-label="Phân trang"
    >
      {currentPage > 1 && (
        <Link
          to="/truyen/$slug"
          params={{ slug }}
          search={{ page: currentPage - 1, commentsPage: 1 }}
          className={`${baseLink} border-border hover:border-fg/40 hover:bg-bg-subtle/60`}
          aria-label="Trang trước"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
      )}
      {start > 1 && (
        <>
          <Link
            to="/truyen/$slug"
            params={{ slug }}
            search={{ page: 1, commentsPage: 1 }}
            className={`${baseLink} border-border hover:border-fg/40 hover:bg-bg-subtle/60`}
          >
            1
          </Link>
          {start > 2 && <span className="px-1 text-fg-muted text-xs">…</span>}
        </>
      )}
      {pages.map((p) => (
        <Link
          key={p}
          to="/truyen/$slug"
          params={{ slug }}
          search={{ page: p, commentsPage: 1 }}
          aria-current={p === currentPage ? 'page' : undefined}
          className={
            p === currentPage
              ? `${baseLink} border-fg bg-fg text-bg`
              : `${baseLink} border-border hover:border-fg/40 hover:bg-bg-subtle/60`
          }
        >
          {p}
        </Link>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && (
            <span className="px-1 text-fg-muted text-xs">…</span>
          )}
          <Link
            to="/truyen/$slug"
            params={{ slug }}
            search={{ page: totalPages, commentsPage: 1 }}
            className={`${baseLink} border-border hover:border-fg/40 hover:bg-bg-subtle/60`}
          >
            {totalPages}
          </Link>
        </>
      )}
      {currentPage < totalPages && (
        <Link
          to="/truyen/$slug"
          params={{ slug }}
          search={{ page: currentPage + 1, commentsPage: 1 }}
          className={`${baseLink} border-border hover:border-fg/40 hover:bg-bg-subtle/60`}
          aria-label="Trang sau"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </nav>
  );
}
