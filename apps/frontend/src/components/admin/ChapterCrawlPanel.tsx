import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Download, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api-client';

interface CrawlResult {
  enqueued: number;
  total: number;
}

export function ChapterCrawlPanel({ storyId }: { storyId: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trigger(mode: 'missing' | 'all') {
    setBusy(mode);
    setInfo(null);
    setError(null);
    try {
      const res = await api.post<CrawlResult>(`/chapters/crawl/${storyId}`, { mode });
      setInfo(`Đã enqueue ${res.data.enqueued} / ${res.data.total} chương`);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'story', storyId, 'chapters'] });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data
          ?.message ??
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Lỗi';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => trigger('missing')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4" />
          {busy === 'missing' ? 'Đang enqueue...' : 'Crawl missing'}
        </button>
        <button
          type="button"
          onClick={() => trigger('all')}
          disabled={busy !== null}
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
