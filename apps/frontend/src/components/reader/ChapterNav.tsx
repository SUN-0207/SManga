import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, List } from 'lucide-react';

export interface ChapterNavProps {
  slug: string;
  prev: { index: number; title: string } | null;
  next: { index: number; title: string } | null;
  current: number;
  totalChapters?: number;
}

export function ChapterNav({ slug, prev, next, current, totalChapters }: ChapterNavProps) {
  return (
    <nav
      className="flex items-center justify-between gap-2 py-4"
      aria-label="Điều hướng chương"
    >
      <div className="flex-1 min-w-0">
        {prev ? (
          <Link
            to="/truyen/$slug/chuong/$index"
            params={{ slug, index: String(prev.index) }}
            className="group inline-flex items-center gap-2 h-10 pl-3 pr-4 rounded-full border border-border hover:border-foreground/40 hover:bg-muted/60 text-sm transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-w-full"
          >
            <ChevronLeft className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5" />
            <span className="font-medium shrink-0">Chương {prev.index}</span>
          </Link>
        ) : (
          <span aria-hidden />
        )}
      </div>

      <Link
        to="/truyen/$slug"
        params={{ slug }}
        search={{ page: 1 }}
        className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-border hover:border-foreground/40 hover:bg-muted/60 text-sm transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <List className="h-4 w-4" />
        <span className="hidden sm:inline">
          Chương {current}
          {totalChapters ? <span className="text-muted-foreground"> / {totalChapters}</span> : null}
        </span>
        <span className="sm:hidden">Mục lục</span>
      </Link>

      <div className="flex-1 min-w-0 flex justify-end">
        {next ? (
          <Link
            to="/truyen/$slug/chuong/$index"
            params={{ slug, index: String(next.index) }}
            className="group inline-flex items-center gap-2 h-10 pl-4 pr-3 rounded-full bg-foreground text-background hover:opacity-90 text-sm font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 max-w-full"
          >
            <span className="shrink-0">Chương {next.index}</span>
            <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <span aria-hidden />
        )}
      </div>
    </nav>
  );
}
