import { describe, expect, it } from 'vitest';
import { countWords, scrollPercent } from './reader-progress';

describe('countWords', () => {
  it('counts whitespace-separated tokens', () => {
    expect(countWords('mot hai ba')).toBe(3);
    expect(countWords('  spaced   out \n words ')).toBe(3);
  });
  it('returns 0 for empty / undefined', () => {
    expect(countWords('')).toBe(0);
    expect(countWords(undefined)).toBe(0);
  });
});

describe('scrollPercent', () => {
  it('is 0 at top and 100 at bottom', () => {
    expect(scrollPercent(0, 2000, 800)).toBe(0); // max = 1200
    expect(scrollPercent(1200, 2000, 800)).toBe(100);
  });
  it('clamps to 100 and never divides by zero', () => {
    expect(scrollPercent(5000, 2000, 800)).toBe(100);
    expect(scrollPercent(100, 800, 800)).toBe(0); // max = 0 → 0, no NaN
    expect(scrollPercent(100, 700, 800)).toBe(0); // negative max → 0
  });
  it('interpolates linearly', () => {
    expect(scrollPercent(600, 2000, 800)).toBe(50); // 600 / 1200
  });
});
