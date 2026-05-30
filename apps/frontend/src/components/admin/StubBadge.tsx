import type { DiscoveryStatus } from '@/api/discover';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';

const TONE: Record<DiscoveryStatus, { cls: string; label: string; Icon: typeof Clock }> = {
  pending: {
    cls: 'bg-bg-subtle text-fg-muted border-border',
    label: 'Đang chờ',
    Icon: Clock,
  },
  running: {
    cls: 'bg-accent/15 text-accent border-accent/30',
    label: 'Đang quét',
    Icon: Loader2,
  },
  complete: {
    cls: 'bg-positive/15 text-positive border-positive/30',
    label: 'Hoàn thành',
    Icon: CheckCircle2,
  },
  failed: {
    cls: 'bg-destructive/15 text-destructive border-destructive/30',
    label: 'Thất bại',
    Icon: XCircle,
  },
};

export function StubBadge({ status }: { status: DiscoveryStatus }) {
  const t = TONE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${t.cls}`}
    >
      <t.Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {t.label}
    </span>
  );
}
