'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SourceForm() {
  const router = useRouter();
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
    const res = await fetch('/api/admin/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, baseUrl, rateLimitRps: Number(rps) }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === 'string' ? body.error : 'Lỗi');
      return;
    }
    setId(''); setName(''); setBaseUrl(''); setRps('1');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end mb-6">
      <div className="space-y-1">
        <Label htmlFor="src-id">ID adapter</Label>
        <Input id="src-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="truyenfull" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="src-name">Tên</Label>
        <Input id="src-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-1 md:col-span-2">
        <Label htmlFor="src-url">Base URL</Label>
        <Input id="src-url" type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="src-rps">RPS</Label>
        <Input id="src-rps" type="number" step="0.1" min="0.1" value={rps} onChange={(e) => setRps(e.target.value)} required />
      </div>
      {error && <p className="md:col-span-5 text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy} className="md:col-span-5">
        {busy ? 'Đang thêm...' : 'Thêm source'}
      </Button>
    </form>
  );
}
