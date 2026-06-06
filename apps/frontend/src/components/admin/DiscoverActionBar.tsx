import { discoverApi } from '@/api/discover';
import { useDiscoverImportStore } from '@/stores/discover-import-store';
import { Download, Loader2, X, Zap } from 'lucide-react';
import { useState } from 'react';

export function DiscoverActionBar({ onImported }: { onImported: () => void }) {
  const selected = useDiscoverImportStore((s) => s.selected);
  const clearSelection = useDiscoverImportStore((s) => s.clearSelection);
  const markImporting = useDiscoverImportStore((s) => s.markImporting);
  const markDone = useDiscoverImportStore((s) => s.markDone);

  // Local UI state (NOT in store):
  const [autoCrawl, setAutoCrawl] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (selected.size === 0 && !info) return null;

  const count = selected.size;
  const overLimit = count > 50;

  async function submit() {
    setError(null);
    setInfo(null);
    setSubmitting(true);
    const urls = [...selected];
    try {
      const res = await discoverApi.importBulk(urls, autoCrawl);
      markImporting(urls);
      const queuedCount = res.queued.length;
      const skippedCount = res.skipped.length;
      const tail = autoCrawl ? ' · sẽ tự quét chương + crawl' : '';
      setInfo(
        skippedCount > 0
          ? `Đã enqueue ${queuedCount} job, bỏ qua ${skippedCount}${tail}. Theo dõi ở Jobs.`
          : `Đã enqueue ${queuedCount} job${tail}. Theo dõi ở Jobs.`,
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
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 w-[min(95vw,720px)] -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border-strong bg-bg-elevated px-4 py-3 shadow-elev">
        <span className="inline-flex h-7 items-center rounded-full bg-accent-gradient px-3 text-[12px] font-semibold text-white">
          {count}
        </span>
        <span className="text-body-sm text-fg-muted">
          đã chọn
          {overLimit ? <span className="ml-2 text-destructive">(tối đa 50)</span> : null}
        </span>

        <label className="ml-auto inline-flex items-center gap-2 text-body-sm text-fg-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoCrawl}
            onChange={(e) => setAutoCrawl(e.target.checked)}
            disabled={submitting}
            className="h-4 w-4 rounded border-border-strong bg-bg-elevated text-accent focus:ring-2 focus:ring-accent cursor-pointer"
          />
          Crawl ngay
        </label>

        <button
          type="button"
          onClick={() => {
            clearSelection();
            setInfo(null);
            setError(null);
          }}
          disabled={submitting}
          aria-label="Bỏ chọn tất cả"
          className="inline-flex h-9 items-center gap-1 rounded-md border border-border-strong bg-bg-subtle px-3 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-bg-subtle/80 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X className="h-4 w-4" />
          Bỏ chọn
        </button>

        <button
          type="button"
          onClick={submit}
          disabled={submitting || selected.size === 0 || overLimit}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent-gradient px-4 text-body-sm font-bold text-white shadow-glow-pink-soft transition-opacity duration-fast hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang import…
            </>
          ) : autoCrawl ? (
            <>
              <Zap className="h-4 w-4" aria-hidden />
              Import + crawl
            </>
          ) : (
            <>
              <Download className="h-4 w-4" aria-hidden />
              Chỉ import metadata
            </>
          )}
        </button>
      </div>

      {error && <p className="mt-2 text-[11px] text-destructive text-center">{error}</p>}
      {info && !error && <p className="mt-2 text-[11px] text-positive text-center">{info}</p>}
    </div>
  );
}
