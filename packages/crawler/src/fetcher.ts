import { request } from 'undici';
import { FetchError, RateLimitError } from '@smanga/shared';
import { logger } from './logger.ts';

export interface FetchOptions {
  userAgent?: string;
  timeoutMs?: number;
}

const DEFAULT_UA =
  'Mozilla/5.0 (compatible; SMangaBot/0.1; +https://github.com/smanga)';

export async function fetchHtml(url: string, opts: FetchOptions = {}): Promise<string> {
  const ua = opts.userAgent ?? DEFAULT_UA;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  logger.debug({ url }, 'fetching html');

  let res;
  try {
    res = await request(url, {
      method: 'GET',
      headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml' },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
  } catch (err) {
    throw new FetchError(`network error fetching ${url}`, err);
  }

  if (res.statusCode === 429 || res.statusCode === 503) {
    throw new RateLimitError(`rate limited (${res.statusCode}) fetching ${url}`);
  }
  if (res.statusCode >= 400) {
    throw new FetchError(`http ${res.statusCode} fetching ${url}`);
  }
  return await res.body.text();
}

export async function fetchBytes(url: string, opts: FetchOptions = {}): Promise<{ bytes: Buffer; contentType: string }> {
  const ua = opts.userAgent ?? DEFAULT_UA;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let res;
  try {
    res = await request(url, {
      method: 'GET',
      headers: { 'user-agent': ua },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
  } catch (err) {
    throw new FetchError(`network error fetching ${url}`, err);
  }
  if (res.statusCode >= 400) {
    throw new FetchError(`http ${res.statusCode} fetching ${url}`);
  }
  const buf = Buffer.from(await res.body.arrayBuffer());
  const contentType = String(res.headers['content-type'] ?? 'application/octet-stream');
  return { bytes: buf, contentType };
}
