import { formatCompact } from '@/lib/format';
import { Eye } from 'lucide-react';
// Re-export for back-compat — consumers that imported formatCompact from here continue to work.
export { formatCompact } from '@/lib/format';

interface ViewCountProps {
  count: number;
  /** Optional suffix label, e.g. "lượt xem" */
  label?: string;
}

export function ViewCount({ count, label }: ViewCountProps) {
  return (
    <span className="inline-flex items-center gap-1 text-body-sm text-fg-muted">
      <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{formatCompact(count)}</span>
      {label && <span>{label}</span>}
    </span>
  );
}
