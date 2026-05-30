import { ChevronLeft, ChevronRight } from 'lucide-react';

export function DiscoverPagination({
  page,
  hasNextPage,
  isLoading,
  onChange,
}: {
  page: number;
  hasNextPage: boolean;
  isLoading: boolean;
  onChange: (page: number) => void;
}) {
  const hasPrev = page > 1;

  return (
    <div className="flex items-center justify-center gap-3 py-6">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={!hasPrev || isLoading}
        aria-label="Trang trước"
        className={
          hasPrev && !isLoading
            ? 'inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-sm border border-border hover:border-foreground/40 hover:bg-muted/60 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
            : 'inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-sm border border-border/40 text-muted-foreground/40 cursor-not-allowed'
        }
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Trước
      </button>

      <div className="flex flex-col items-center text-xs leading-tight">
        <span className="font-medium text-foreground tabular-nums">Trang {page}</span>
        <span className="text-[10px] text-muted-foreground">
          {hasNextPage ? 'còn nhiều trang' : 'trang cuối'}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={!hasNextPage || isLoading}
        aria-label="Trang sau"
        className={
          hasNextPage && !isLoading
            ? 'inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2'
            : 'inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-sm border border-border/40 text-muted-foreground/40 cursor-not-allowed'
        }
      >
        Sau
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
