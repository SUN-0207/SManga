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
