import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Compact pagination with Prev / "Trang X / Y" / Next.
 * Plan A tokens. Buttons are disabled at edges. Loading prop dims controls
 * during refetch so the user knows the click registered.
 */
export function Pagination({
  page,
  totalPages,
  isLoading,
  onChange,
}: {
  page: number;
  totalPages: number;
  isLoading?: boolean;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const baseBtn =
    'inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-body-sm font-medium transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2';

  return (
    <nav
      aria-label="Phân trang"
      className="flex items-center justify-center gap-3 pt-8"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={!hasPrev || isLoading}
        aria-label="Trang trước"
        className={
          hasPrev && !isLoading
            ? `${baseBtn} border border-border text-fg hover:bg-bg-subtle cursor-pointer`
            : `${baseBtn} border border-border/40 text-fg-subtle cursor-not-allowed`
        }
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Trước
      </button>

      <div
        role="status"
        aria-live="polite"
        className="flex items-baseline gap-1.5 text-body-sm tabular-nums px-2"
      >
        <span className="text-fg font-semibold">Trang {page}</span>
        <span className="text-fg-muted">/ {totalPages}</span>
      </div>

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={!hasNext || isLoading}
        aria-label="Trang sau"
        className={
          hasNext && !isLoading
            ? `${baseBtn} bg-accent-gradient text-white shadow-glow-pink-soft hover:shadow-glow-pink cursor-pointer`
            : `${baseBtn} border border-border/40 text-fg-subtle cursor-not-allowed`
        }
      >
        Sau
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  );
}
