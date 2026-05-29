import { useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { discoverApi } from '@/api/discover';
import { useDiscoverImportStore } from '@/stores/discover-import-store';

export function DiscoverActionBar({ onImported }: { onImported: () => void }) {
  const selected = useDiscoverImportStore((s) => s.selected);
  const clear = useDiscoverImportStore((s) => s.clearSelection);
  const markImporting = useDiscoverImportStore((s) => s.markImporting);
  const markDone = useDiscoverImportStore((s) => s.markDone);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (selected.size === 0 && !info) return null;

  async function submit() {
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const urls = [...selected];
    try {
      const res = await discoverApi.importBulk(urls);
      markImporting(urls);
      const queuedCount = res.queued.length;
      const skippedCount = res.skipped.length;
      setInfo(
        skippedCount > 0
          ? `Đã enqueue ${queuedCount} job, bỏ qua ${skippedCount}. Theo dõi ở Jobs.`
          : `Đã enqueue ${queuedCount} job. Theo dõi ở Jobs.`,
      );
      // Optimistically remove from importing after 12s so cards refresh
      setTimeout(() => markDone(urls), 12_000);
      onImported();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        (err as Error).message ??
        'Lỗi không xác định';
      setError(typeof msg === 'string' ? msg : 'Lỗi');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[min(640px,calc(100%-3rem))] rounded-2xl border border-border bg-background shadow-[0_30px_60px_-20px_rgba(0,0,0,0.35)] p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-foreground text-background text-xs font-bold tabular-nums">
            {selected.size}
          </span>
          <span className="text-muted-foreground">
            đã chọn{selected.size > 50 ? ' (vượt giới hạn 50)' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clear}
            disabled={submitting}
            aria-label="Bỏ chọn tất cả"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || selected.size === 0 || selected.size > 50}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-[hsl(var(--color-cta))] text-white text-sm font-medium hover:opacity-95 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-cta))] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            Import metadata
          </button>
        </div>
      </div>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      {info && !error && (
        <p className="text-xs text-emerald-600">{info}</p>
      )}
    </div>
  );
}
