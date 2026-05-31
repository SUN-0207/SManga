import { Eye } from 'lucide-react';

interface ViewCountProps {
  count: number;
  /** Optional suffix label, e.g. "lượt xem" */
  label?: string;
}

/**
 * Compact number format — Vietnamese locale.
 * 0-999       → exact ("42")
 * 1000-999999 → "1.2k"
 * ≥1 000 000  → "1.2tr"  (triệu)
 */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}tr`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
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
