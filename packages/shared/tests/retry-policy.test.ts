import { describe, expect, it } from 'vitest';
import { AdapterNotFoundError, FetchError, ParserError, RateLimitError } from '../src/errors.js';
import {
  MAX_RETRY_GENERATIONS,
  RETRY_BACKOFF_MINUTES,
  backoffForGeneration,
  classifyCrawlerError,
} from '../src/retry-policy.js';

describe('classifyCrawlerError', () => {
  it('treats rate-limit (429/503) as transient', () => {
    expect(classifyCrawlerError(new RateLimitError('rate limited (429)'))).toBe('transient');
  });

  it('treats network errors (no statusCode) as transient', () => {
    expect(classifyCrawlerError(new FetchError('network error', { cause: new Error('x') }))).toBe(
      'transient',
    );
  });

  it('treats HTTP 5xx and 408 as transient', () => {
    expect(classifyCrawlerError(new FetchError('http 503', { statusCode: 503 }))).toBe('transient');
    expect(classifyCrawlerError(new FetchError('http 500', { statusCode: 500 }))).toBe('transient');
    expect(classifyCrawlerError(new FetchError('http 408', { statusCode: 408 }))).toBe('transient');
  });

  it('treats HTTP 4xx (except 408) as permanent', () => {
    expect(classifyCrawlerError(new FetchError('http 404', { statusCode: 404 }))).toBe('permanent');
    expect(classifyCrawlerError(new FetchError('http 403', { statusCode: 403 }))).toBe('permanent');
    expect(classifyCrawlerError(new FetchError('http 400', { statusCode: 400 }))).toBe('permanent');
  });

  it('treats ParserError and AdapterNotFoundError as permanent', () => {
    expect(classifyCrawlerError(new ParserError('html changed'))).toBe('permanent');
    expect(classifyCrawlerError(new AdapterNotFoundError('no adapter'))).toBe('permanent');
  });

  it('treats unknown / generic errors as permanent (conservative)', () => {
    expect(classifyCrawlerError(new Error('???'))).toBe('permanent');
    expect(classifyCrawlerError('a string')).toBe('permanent');
    expect(classifyCrawlerError(undefined)).toBe('permanent');
  });

  it('falls back to error name when prototype identity is lost', () => {
    // Simulates an error that crossed a module boundary and lost instanceof.
    const fakeRateLimit = Object.assign(new Error('rate limited'), { name: 'RateLimitError' });
    expect(classifyCrawlerError(fakeRateLimit)).toBe('transient');
    const fakeParser = Object.assign(new Error('parse fail'), { name: 'ParserError' });
    expect(classifyCrawlerError(fakeParser)).toBe('permanent');
  });
});

describe('backoffForGeneration', () => {
  it('returns the documented ladder (minutes) for generations 1..5', () => {
    expect(RETRY_BACKOFF_MINUTES).toEqual([10, 30, 120, 360, 1440]);
    expect(backoffForGeneration(1)).toBe(10);
    expect(backoffForGeneration(2)).toBe(30);
    expect(backoffForGeneration(3)).toBe(120);
    expect(backoffForGeneration(4)).toBe(360);
    expect(backoffForGeneration(5)).toBe(1440);
  });

  it('clamps out-of-range generations to the nearest ladder value', () => {
    expect(backoffForGeneration(0)).toBe(10);
    expect(backoffForGeneration(-3)).toBe(10);
    expect(backoffForGeneration(6)).toBe(1440);
    expect(backoffForGeneration(99)).toBe(1440);
  });

  it('MAX_RETRY_GENERATIONS matches the ladder length', () => {
    expect(MAX_RETRY_GENERATIONS).toBe(5);
    expect(MAX_RETRY_GENERATIONS).toBe(RETRY_BACKOFF_MINUTES.length);
  });
});
