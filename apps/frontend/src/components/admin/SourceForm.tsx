import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Plus } from 'lucide-react';
import { sourcesApi } from '@/api/sources';

export function SourceForm() {
  const queryClient = useQueryClient();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [rps, setRps] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await sourcesApi.create({ id, name, baseUrl, rateLimitRps: Number(rps) });
      setId('');
      setName('');
      setBaseUrl('');
      setRps('1');
      await queryClient.invalidateQueries({ queryKey: ['sources'] });
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
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <Field label="ID adapter" className="md:col-span-1">
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="truyenfull"
            required
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Tên" className="md:col-span-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Base URL" className="md:col-span-3">
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://example.com"
            required
            className={INPUT_CLS}
          />
        </Field>
        <Field label="RPS" className="md:col-span-1">
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={rps}
            onChange={(e) => setRps(e.target.value)}
            required
            className={`${INPUT_CLS} tabular-nums`}
          />
        </Field>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          {busy ? 'Đang thêm...' : 'Thêm source'}
        </button>
      </div>
    </form>
  );
}

const INPUT_CLS =
  'h-9 w-full px-3 rounded-md border border-border bg-background text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/40 focus:ring-2 focus:ring-primary/20 transition-all duration-200';

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block space-y-1 ${className ?? ''}`}>
      <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
