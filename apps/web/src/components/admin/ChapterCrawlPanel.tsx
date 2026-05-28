'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function ChapterCrawlPanel({ storyId }: { storyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trigger(mode: 'missing' | 'all') {
    setBusy(mode); setInfo(null); setError(null);
    const res = await fetch(`/api/admin/stories/${storyId}/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    setBusy(null);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof body.error === 'string' ? body.error : 'Lỗi');
      return;
    }
    setInfo(`Đã enqueue ${body.enqueued} (trùng ${body.duplicates}, tổng ${body.total})`);
    router.refresh();
  }

  return (
    <div className="flex gap-3 items-center mb-4">
      <Button onClick={() => trigger('missing')} disabled={busy !== null} variant="default">
        {busy === 'missing' ? 'Đang enqueue...' : 'Crawl missing'}
      </Button>
      <Button onClick={() => trigger('all')} disabled={busy !== null} variant="outline">
        {busy === 'all' ? 'Đang enqueue...' : 'Recrawl all'}
      </Button>
      {info && <span className="text-sm text-emerald-600">{info}</span>}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
