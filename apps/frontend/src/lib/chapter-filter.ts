export interface ChapterListItem {
  index: number;
  title: string;
  isCrawled: boolean;
}

export type ChapterSort = 'newest' | 'oldest';

export interface FilterSortOptions {
  query: string;
  sort: ChapterSort;
  readUpToIndex: number | null;
  filterRead: boolean;
}

/**
 * Lowercase + strip Vietnamese diacritics (combining marks AND đ→d) so chapter
 * search is accent-insensitive: "hoi sinh" matches "Hồi Sinh".
 */
export function normalizeForSearch(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '') // strip combining diacritical marks (NFD)
    .replace(/đ/g, 'd');
}

/**
 * Pure filter+sort over the full chapter list (client-side browsing).
 * - filterRead: keep only chapters with index <= readUpToIndex (empty when null).
 * - query: keep chapters whose normalized title contains the query OR whose
 *   index string contains the query's digits.
 * - sort: 'newest' = index desc, 'oldest' = index asc.
 */
export function filterSortChapters(
  chapters: ChapterListItem[],
  { query, sort, readUpToIndex, filterRead }: FilterSortOptions,
): ChapterListItem[] {
  let result = chapters;

  if (filterRead) {
    result = readUpToIndex == null ? [] : result.filter((c) => c.index <= readUpToIndex);
  }

  const trimmed = query.trim();
  if (trimmed) {
    const nq = normalizeForSearch(trimmed);
    const digits = trimmed.replace(/\D/g, '');
    result = result.filter((c) => {
      if (normalizeForSearch(c.title).includes(nq)) return true;
      return digits.length > 0 && String(c.index).includes(digits);
    });
  }

  return [...result].sort((a, b) => (sort === 'newest' ? b.index - a.index : a.index - b.index));
}
