'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ImportStoryForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setBusy(true);
    const res = await fetch('/api/admin/stories/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof body.error === 'string' ? body.error : 'Lỗi');
      return;
    }
    setInfo(`Đã thêm job ${body.jobId}. Theo dõi ở mục Jobs.`);
    setUrl('');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col md:flex-row gap-3 items-start md:items-end mb-6">
      <div className="flex-1 space-y-1">
        <Label htmlFor="story-url">URL truyện</Label>
        <Input
          id="story-url"
          type="url"
          placeholder="https://truyenfull.today/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={busy}>{busy ? 'Đang gửi...' : 'Import truyện'}</Button>
      {error && <p className="basis-full text-sm text-destructive">{error}</p>}
      {info && <p className="basis-full text-sm text-emerald-600">{info}</p>}
    </form>
  );
}
