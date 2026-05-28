import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

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
    <div className="flex gap-3 items-center mb-4 flex-wrap">
      <Button
        onClick={() => trigger('missing')}
        disabled={busy !== null}
        variant="default"
        className="cursor-pointer"
      >
        {busy === 'missing' ? 'Đang enqueue...' : 'Crawl missing'}
      </Button>
      <Button
        onClick={() => trigger('all')}
        disabled={busy !== null}
        variant="outline"
        className="cursor-pointer"
      >
        {busy === 'all' ? 'Đang enqueue...' : 'Recrawl all'}
      </Button>
      {info && <span className="text-sm text-emerald-600">{info}</span>}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
