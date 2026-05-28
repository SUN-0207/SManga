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
      <p className="text-center text-sm text-muted-foreground py-12">
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
                className="group flex items-baseline gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                <span className="font-heading font-semibold text-sm text-muted-foreground/70 tabular-nums w-8 shrink-0 group-hover:text-foreground transition-colors duration-200">
                  {c.index}
                </span>
                <span className="text-sm leading-snug line-clamp-1 group-hover:underline underline-offset-[3px] decoration-foreground/40 transition-all duration-200">
                  {c.title.replace(/^Chương\s*\d+(?:\.\d+)?\s*:?\s*/i, '')}
                </span>
              </Link>
            ) : (
              <span
                className="flex items-baseline gap-3 text-muted-foreground/60"
                title="Chưa crawl"
              >
                <span className="font-heading font-semibold text-sm tabular-nums w-8 shrink-0">
                  {c.index}
                </span>
                <span className="text-sm leading-snug line-clamp-1 flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  {c.title}
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
    'inline-flex items-center justify-center min-w-9 h-9 px-3 rounded-full text-sm border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

  return (
    <nav
      className="flex items-center justify-center gap-1.5 pt-6 flex-wrap"
      aria-label="Phân trang"
    >
      {currentPage > 1 && (
        <Link
          to="/truyen/$slug"
          params={{ slug }}
          search={{ page: currentPage - 1 }}
          className={`${baseLink} border-border hover:border-foreground/40 hover:bg-muted/60`}
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
            search={{ page: 1 }}
            className={`${baseLink} border-border hover:border-foreground/40 hover:bg-muted/60`}
          >
            1
          </Link>
          {start > 2 && <span className="px-1 text-muted-foreground text-xs">…</span>}
        </>
      )}
      {pages.map((p) => (
        <Link
          key={p}
          to="/truyen/$slug"
          params={{ slug }}
          search={{ page: p }}
          aria-current={p === currentPage ? 'page' : undefined}
          className={
            p === currentPage
              ? `${baseLink} border-foreground bg-foreground text-background`
              : `${baseLink} border-border hover:border-foreground/40 hover:bg-muted/60`
          }
        >
          {p}
        </Link>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && (
            <span className="px-1 text-muted-foreground text-xs">…</span>
          )}
          <Link
            to="/truyen/$slug"
            params={{ slug }}
            search={{ page: totalPages }}
            className={`${baseLink} border-border hover:border-foreground/40 hover:bg-muted/60`}
          >
            {totalPages}
          </Link>
        </>
      )}
      {currentPage < totalPages && (
        <Link
          to="/truyen/$slug"
          params={{ slug }}
          search={{ page: currentPage + 1 }}
          className={`${baseLink} border-border hover:border-foreground/40 hover:bg-muted/60`}
          aria-label="Trang sau"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </nav>
  );
}
