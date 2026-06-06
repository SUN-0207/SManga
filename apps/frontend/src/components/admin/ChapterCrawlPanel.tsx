import type { DiscoveryStatus } from '@/api/discover';
import { api } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Download, RefreshCw, ScanSearch } from 'lucide-react';
import { useState } from 'react';

interface CrawlResult {
  enqueued: number;
  total: number;
}

export function ChapterCrawlPanel({
  storyId,
  discoveryStatus,
}: {
  storyId: string;
  discoveryStatus: DiscoveryStatus;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canDiscover = discoveryStatus === 'pending' || discoveryStatus === 'failed';
  const canCrawl = discoveryStatus === 'complete';

  function readApiError(err: unknown): string {
    const data = (err as { response?: { data?: { message?: string; error?: string } } })?.response
      ?.data;
    const msg = data?.message ?? data?.error ?? 'Lỗi';
    return typeof msg === 'string' ? msg : JSON.stringify(msg);
  }

  async function triggerDiscover() {
    setBusy('discover');
    setInfo(null);
    setError(null);
    try {
      await api.post<{ jobId: string }>(`/stories/${storyId}/discover`);
      setInfo('Đã enqueue job quét danh sách chương. Theo dõi ở Jobs.');
      // Story query has refetchInterval while running — just invalidate to
      // pick up the new discoveryStatus immediately.
      await queryClient.invalidateQueries({ queryKey: ['admin', 'story', storyId] });
    } catch (err) {
      setError(readApiError(err));
    } finally {
      setBusy(null);
    }
  }

  async function triggerCrawl(mode: 'missing' | 'all') {
    setBusy(mode);
    setInfo(null);
    setError(null);
    try {
      const res = await api.post<CrawlResult>(`/chapters/crawl/${storyId}`, { mode });
      setInfo(`Đã enqueue ${res.data.enqueued} / ${res.data.total} chương`);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'story', storyId, 'chapters'] });
    } catch (err) {
      setError(readApiError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background p-5 space-y-3">
      <h2 className="font-heading font-semibold text-base">
        {canDiscover ? 'Quét danh sách chương' : 'Crawl chapter'}
      </h2>
      <p className="text-xs text-muted-foreground">
        {canDiscover
          ? 'Truyện đang ở trạng thái metadata-only. Quét chapter list trước khi crawl được nội dung.'
          : 'Enqueue job để fetch nội dung chapter từ source gốc.'}
      </p>

      <div className="flex flex-wrap gap-2">
        {/* Phase B: discover chapter list */}
        <button
          type="button"
          onClick={triggerDiscover}
          disabled={busy !== null || !canDiscover}
          title={
            discoveryStatus === 'running'
              ? 'Đang chạy...'
              : discoveryStatus === 'complete'
                ? 'Danh sách chapter đã có'
                : undefined
          }
          className={
            canDiscover
              ? 'inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-[hsl(var(--color-cta))] text-white text-sm font-medium hover:opacity-95 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-cta))] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
              : 'inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-border text-muted-foreground text-sm transition-colors duration-200 cursor-not-allowed opacity-50'
          }
        >
          <ScanSearch className="h-4 w-4" />
          {busy === 'discover'
            ? 'Đang enqueue...'
            : discoveryStatus === 'failed'
              ? 'Thử quét lại'
              : 'Quét danh sách chương'}
        </button>

        {/* Phase C: crawl chapter content (gated on discoveryStatus complete) */}
        <button
          type="button"
          onClick={() => triggerCrawl('missing')}
          disabled={busy !== null || !canCrawl}
          title={!canCrawl ? 'Quét danh sách chương trước' : undefined}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4" />
          {busy === 'missing' ? 'Đang enqueue...' : 'Crawl missing'}
        </button>
        <button
          type="button"
          onClick={() => triggerCrawl('all')}
          disabled={busy !== null || !canCrawl}
          title={!canCrawl ? 'Quét danh sách chương trước' : undefined}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-border hover:border-foreground/40 hover:bg-muted/60 text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className="h-4 w-4" />
          {busy === 'all' ? 'Đang enqueue...' : 'Recrawl all'}
        </button>
      </div>

      {info && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {info}
        </p>
      )}
      {error && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
