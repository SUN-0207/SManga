import type { ChapterListItem } from '@/lib/chapter-filter';
import { cleanChapterTitle } from '@/lib/chapter-title';
import { Link } from '@tanstack/react-router';
import { Check, Clock } from 'lucide-react';

export interface ChapterGridProps {
  slug: string;
  chapters: ChapterListItem[];
  readUpToIndex: number | null;
}

export function ChapterGrid({ slug, chapters, readUpToIndex }: ChapterGridProps) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-px">
      {chapters.map((c) => {
        const isRead = readUpToIndex != null && c.index <= readUpToIndex;
        return (
          <li key={c.index} className="border-b border-border/60 py-2.5">
            {c.isCrawled ? (
              <Link
                to="/truyen/$slug/chuong/$index"
                params={{ slug, index: String(c.index) }}
                search={{ commentsPage: 1 }}
                className="group flex items-baseline gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                <span
                  className={`font-sans font-semibold text-sm tabular-nums w-[5.25rem] shrink-0 transition-colors duration-200 ${
                    isRead ? 'text-fg-muted/50' : 'text-fg-muted/70 group-hover:text-fg'
                  }`}
                >
                  Chương {c.index}
                </span>
                <span
                  className={`text-sm leading-snug line-clamp-1 inline-flex items-center gap-1.5 transition-all duration-200 ${
                    isRead
                      ? 'text-fg-muted/60'
                      : 'group-hover:underline underline-offset-[3px] decoration-fg/40'
                  }`}
                >
                  {isRead && (
                    <Check className="h-3 w-3 shrink-0 text-accent/70" aria-label="Đã đọc" />
                  )}
                  {cleanChapterTitle(c.title)}
                </span>
              </Link>
            ) : (
              <span className="flex items-baseline gap-3 text-fg-muted/60" title="Chưa crawl">
                <span className="font-sans font-semibold text-sm tabular-nums w-[5.25rem] shrink-0">
                  Chương {c.index}
                </span>
                <span className="text-sm leading-snug line-clamp-1 flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  {cleanChapterTitle(c.title)}
                </span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
