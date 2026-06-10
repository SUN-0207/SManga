import { describe, expect, it } from 'vitest';
import { CrawlerError, FetchError } from '../src/errors.js';

describe('FetchError', () => {
  it('carries an optional statusCode', () => {
    const err = new FetchError('http 404 fetching x', { statusCode: 404 });
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('http 404 fetching x');
    expect(err.name).toBe('FetchError');
    expect(err).toBeInstanceOf(CrawlerError);
  });

  it('preserves cause and leaves statusCode undefined for network errors', () => {
    const cause = new Error('ECONNRESET');
    const err = new FetchError('network error fetching x', { cause });
    expect(err.statusCode).toBeUndefined();
    expect(err.cause).toBe(cause);
  });

  it('works with no options', () => {
    const err = new FetchError('boom');
    expect(err.statusCode).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });
});
