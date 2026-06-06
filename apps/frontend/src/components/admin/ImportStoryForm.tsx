import { api } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { type FormEvent, useState } from 'react';

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
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
          URL truyện
        </span>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://truyenfull.today/..."
            required
            className="flex-1 h-10 px-4 rounded-md border border-border bg-background text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/40 focus:ring-2 focus:ring-primary/20 transition-all duration-200"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <Download className="h-4 w-4" />
            {busy ? 'Đang gửi...' : 'Import'}
          </button>
        </div>
      </label>

      {error && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {info && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {info}
        </p>
      )}
    </form>
  );
}
