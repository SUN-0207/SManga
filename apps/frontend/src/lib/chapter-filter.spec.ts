import { describe, expect, it } from 'vitest';
import { type ChapterListItem, filterSortChapters, normalizeForSearch } from './chapter-filter';

const chapters: ChapterListItem[] = [
  { index: 1, title: 'Mở đầu', isCrawled: true },
  { index: 2, title: 'Hồi Sinh', isCrawled: true },
  { index: 3, title: 'Đại Chiến', isCrawled: true },
  { index: 12, title: 'Kết thúc', isCrawled: false },
];

describe('normalizeForSearch', () => {
  it('strips Vietnamese diacritics and lowercases', () => {
    expect(normalizeForSearch('Hồi Sinh')).toBe('hoi sinh');
  });
  it('maps đ/Đ to d', () => {
    expect(normalizeForSearch('Đại')).toBe('dai');
  });
});

describe('filterSortChapters', () => {
  const base = { query: '', sort: 'oldest' as const, readUpToIndex: null, filterRead: false };

  it('returns all chapters ascending by default (oldest)', () => {
    const r = filterSortChapters(chapters, base);
    expect(r.map((c) => c.index)).toEqual([1, 2, 3, 12]);
  });

  it('sorts descending when sort=newest', () => {
    const r = filterSortChapters(chapters, { ...base, sort: 'newest' });
    expect(r.map((c) => c.index)).toEqual([12, 3, 2, 1]);
  });

  it('matches title diacritics-insensitively', () => {
    const r = filterSortChapters(chapters, { ...base, query: 'hoi' });
    expect(r.map((c) => c.index)).toEqual([2]);
  });

  it('matches by chapter number', () => {
    const r = filterSortChapters(chapters, { ...base, query: '12' });
    expect(r.map((c) => c.index)).toEqual([12]);
  });

  it('filters to read chapters (index <= readUpToIndex)', () => {
    const r = filterSortChapters(chapters, { ...base, readUpToIndex: 2, filterRead: true });
    expect(r.map((c) => c.index)).toEqual([1, 2]);
  });

  it('returns empty when filterRead is on but readUpToIndex is null', () => {
    const r = filterSortChapters(chapters, { ...base, filterRead: true });
    expect(r).toEqual([]);
  });

  it('returns empty when nothing matches the query', () => {
    const r = filterSortChapters(chapters, { ...base, query: 'zzz' });
    expect(r).toEqual([]);
  });
});
