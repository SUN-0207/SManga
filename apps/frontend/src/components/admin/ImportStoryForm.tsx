import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ImportStoryForm() {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await api.post<{ jobId: string }>('/stories/import', { url });
      setInfo(`Đã thêm job ${res.data.jobId}. Theo dõi ở mục Jobs.`);
      setUrl('');
      await queryClient.invalidateQueries({ queryKey: ['stories'] });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data
          ?.message ??
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Lỗi';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col md:flex-row gap-3 items-start md:items-end mb-6"
    >
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
      <Button type="submit" disabled={busy} className="cursor-pointer">
        {busy ? 'Đang gửi...' : 'Import truyện'}
      </Button>
      {error && <p className="basis-full text-sm text-destructive">{error}</p>}
      {info && <p className="basis-full text-sm text-emerald-600">{info}</p>}
    </form>
  );
}
