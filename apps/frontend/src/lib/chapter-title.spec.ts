import { describe, expect, it } from 'vitest';
import { cleanChapterTitle } from './chapter-title';

describe('cleanChapterTitle', () => {
  it('strips "Chương N:" prefix', () => {
    expect(cleanChapterTitle('Chương 12: Hồi sinh')).toBe('Hồi sinh');
  });

  it('strips "Chương N" (no colon)', () => {
    expect(cleanChapterTitle('Chương 12 Hồi sinh')).toBe('Hồi sinh');
  });

  it('handles fractional chapter numbers', () => {
    expect(cleanChapterTitle('Chương 12.5: Ngoại truyện')).toBe('Ngoại truyện');
  });

  it('is case-insensitive on "Chương"', () => {
    expect(cleanChapterTitle('chương 1: Mở đầu')).toBe('Mở đầu');
  });

  it('returns the input unchanged when there is no prefix', () => {
    expect(cleanChapterTitle('Hồi sinh')).toBe('Hồi sinh');
  });

  it('returns empty string when input is just the prefix', () => {
    expect(cleanChapterTitle('Chương 5:')).toBe('');
  });
});
