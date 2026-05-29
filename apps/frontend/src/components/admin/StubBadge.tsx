import type { DiscoveryStatus } from '@/api/discover';
import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';

const TONE: Record<DiscoveryStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  running: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  complete: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  failed: 'bg-destructive/15 text-destructive border-destructive/30',
};

const LABEL: Record<DiscoveryStatus, string> = {
  pending: 'Chỉ metadata',
  running: 'Đang quét',
  complete: 'Đã đủ chapter',
  failed: 'Quét lỗi',
};

const ICON: Record<DiscoveryStatus, typeof Clock> = {
  pending: Clock,
  running: Loader2,
  complete: CheckCircle2,
  failed: AlertCircle,
};

export function StubBadge({ status }: { status: DiscoveryStatus }) {
  const Icon = ICON[status];
  return (
    <span
      className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] border ${TONE[status]}`}
    >
      <Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`} aria-hidden />
      {LABEL[status]}
    </span>
  );
}
