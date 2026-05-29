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
  const baseLink =
    'inline-flex items-center justify-center h-9 px-4 rounded-md text-sm border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="flex items-center justify-center gap-2 py-8">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1 || isLoading}
        aria-label="Trang trước"
        className={`${baseLink} border-border hover:border-foreground/40 hover:bg-muted/60`}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm text-muted-foreground tabular-nums px-2 min-w-[3rem] text-center">
        Trang {page}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={!hasNextPage || isLoading}
        aria-label="Trang sau"
        className={`${baseLink} border-border hover:border-foreground/40 hover:bg-muted/60`}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
