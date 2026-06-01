/**
 * Shared formatting utilities.
 */

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

/**
 * Human-relative time — Vietnamese locale.
 * e.g. "vừa xong", "2 giờ trước", "3 ngày trước"
 */
const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = d.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr  = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);
  const diffWk  = Math.round(diffDay / 7);
  const diffMo  = Math.round(diffDay / 30);
  const diffYr  = Math.round(diffDay / 365);

  if (Math.abs(diffSec) < 60)  return rtf.format(diffSec, 'second');
  if (Math.abs(diffMin) < 60)  return rtf.format(diffMin, 'minute');
  if (Math.abs(diffHr)  < 24)  return rtf.format(diffHr,  'hour');
  if (Math.abs(diffDay) < 7)   return rtf.format(diffDay, 'day');
  if (Math.abs(diffWk)  < 4)   return rtf.format(diffWk,  'week');
  if (Math.abs(diffMo)  < 12)  return rtf.format(diffMo,  'month');
  return rtf.format(diffYr, 'year');
}
