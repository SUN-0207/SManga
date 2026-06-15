import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ClientPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const base =
  'inline-flex items-center justify-center min-w-9 h-9 px-3 rounded-full text-sm border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed';
const inactive = 'border-border hover:border-fg/40 hover:bg-bg-subtle/60';

export function ClientPagination({ currentPage, totalPages, onPageChange }: ClientPaginationProps) {
  const windowSize = 5;
  const start = Math.max(1, currentPage - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  const pages: number[] = [];
  for (let p = start; p <= end; p += 1) pages.push(p);

  return (
    <nav
      className="flex items-center justify-center gap-1.5 pt-6 flex-wrap"
      aria-label="Phân trang"
    >
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className={`${base} ${inactive}`}
        aria-label="Trang trước"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {start > 1 && (
        <>
          <button type="button" onClick={() => onPageChange(1)} className={`${base} ${inactive}`}>
            1
          </button>
          {start > 2 && <span className="px-1 text-fg-muted text-xs">…</span>}
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPageChange(p)}
          aria-current={p === currentPage ? 'page' : undefined}
          className={p === currentPage ? `${base} border-fg bg-fg text-bg` : `${base} ${inactive}`}
        >
          {p}
        </button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-fg-muted text-xs">…</span>}
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            className={`${base} ${inactive}`}
          >
            {totalPages}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className={`${base} ${inactive}`}
        aria-label="Trang sau"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
