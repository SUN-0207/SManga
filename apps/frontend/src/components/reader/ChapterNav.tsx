import { Link } from '@tanstack/react-router';

export interface ChapterNavProps {
  slug: string;
  prev: { index: number; title: string } | null;
  next: { index: number; title: string } | null;
  current: number;
}

export function ChapterNav({ slug, prev, next, current }: ChapterNavProps) {
  return (
    <nav className="flex items-center justify-between gap-3 py-4" aria-label="Điều hướng chương">
      <div className="flex-1">
        {prev && (
          <Link
            to="/truyen/$slug/chuong/$index"
            params={{ slug, index: String(prev.index) }}
            className="inline-flex items-center gap-1 text-sm hover:underline transition-colors duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            ‹ Chương {prev.index}
          </Link>
        )}
      </div>
      <Link
        to="/truyen/$slug"
        params={{ slug }}
        search={{ page: 1 }}
        className="text-sm text-muted-foreground hover:underline transition-colors duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary rounded"
      >
        Mục lục (đang ở chương {current})
      </Link>
      <div className="flex-1 text-right">
        {next && (
          <Link
            to="/truyen/$slug/chuong/$index"
            params={{ slug, index: String(next.index) }}
            className="inline-flex items-center gap-1 text-sm hover:underline transition-colors duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            Chương {next.index} ›
          </Link>
        )}
      </div>
    </nav>
  );
}
