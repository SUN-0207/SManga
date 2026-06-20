import { describe, expect, it } from 'vitest';
import { resolveFetchConcurrency } from './fetch-chapter.processor';

describe('resolveFetchConcurrency', () => {
  it('defaults to 6 when unset or unparseable', () => {
    expect(resolveFetchConcurrency(undefined)).toBe(6);
    expect(resolveFetchConcurrency('abc')).toBe(6);
    expect(resolveFetchConcurrency('')).toBe(6);
  });
  it('uses the env value within bounds', () => {
    expect(resolveFetchConcurrency('10')).toBe(10);
    expect(resolveFetchConcurrency('1')).toBe(1);
  });
  it('clamps to [1, 32]', () => {
    expect(resolveFetchConcurrency('0')).toBe(1);
    expect(resolveFetchConcurrency('-5')).toBe(1);
    expect(resolveFetchConcurrency('999')).toBe(32);
  });
});
