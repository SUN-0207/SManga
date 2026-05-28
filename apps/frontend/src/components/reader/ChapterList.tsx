import { Link } from '@tanstack/react-router';

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
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
        {chapters.map((c) => (
          <li key={c.index} className="text-sm">
            {c.isCrawled ? (
              <Link
                to="/truyen/$slug/chuong-$index"
                params={{ slug, index: String(c.index) }}
                className="hover:underline text-foreground transition-colors duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                Chương {c.index}: {c.title.replace(/^Chương\s*\d+(?:\.\d+)?\s*:?\s*/i, '')}
              </Link>
            ) : (
              <span className="text-muted-foreground/60 line-through" title="Chưa crawl">
                Chương {c.index}: {c.title}
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

  return (
    <nav className="flex items-center gap-1 mt-4 text-sm" aria-label="Phân trang">
      {currentPage > 1 && (
        <Link
          to="/truyen/$slug"
          params={{ slug }}
          search={{ page: currentPage - 1 }}
          className="px-3 py-1 rounded border border-border hover:bg-muted transition-colors duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary"
        >
          ‹
        </Link>
      )}
      {pages.map((p) => (
        <Link
          key={p}
          to="/truyen/$slug"
          params={{ slug }}
          search={{ page: p }}
          className={`px-3 py-1 rounded border transition-colors duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary ${
            p === currentPage
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border hover:bg-muted'
          }`}
        >
          {p}
        </Link>
      ))}
      {currentPage < totalPages && (
        <Link
          to="/truyen/$slug"
          params={{ slug }}
          search={{ page: currentPage + 1 }}
          className="px-3 py-1 rounded border border-border hover:bg-muted transition-colors duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary"
        >
          ›
        </Link>
      )}
    </nav>
  );
}
