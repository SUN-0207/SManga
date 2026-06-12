/** Word count for reading-time estimate — whitespace-separated tokens. */
export function countWords(text: string | undefined | null): number {
  return (text?.match(/\S+/g) ?? []).length;
}

/** Scroll position as a 0–100 percentage, clamped, divide-by-zero safe. */
export function scrollPercent(scrollY: number, scrollHeight: number, innerHeight: number): number {
  const max = scrollHeight - innerHeight;
  if (max <= 0) return 0;
  return Math.min(100, (scrollY / max) * 100);
}
