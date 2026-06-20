import { FetchError, RateLimitError } from '@smanga/shared';
import { Agent, request } from 'undici';
import { logger } from './logger.ts';

// Per-origin keep-alive pool: reuse TCP/TLS across requests so higher crawl
// concurrency doesn't pay a handshake per chapter. `connections` bounds the
// per-origin socket count — keep it >= CRAWLER_FETCH_CONCURRENCY.
const crawlerDispatcher = new Agent({
  connections: 16,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

export function getCrawlerDispatcher(): Agent {
  return crawlerDispatcher;
}

export interface FetchOptions {
  userAgent?: string;
  timeoutMs?: number;
}

// Pose as a recent Chrome on Windows. Several novel-source sites (incl. Cloudflare-
// fronted ones) return 403 to any UA containing "bot" or "crawler". Stick to a
// real browser fingerprint; if a site explicitly forbids scraping via robots.txt
// or terms, that's a separate operator decision, not a UA decision.
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export async function fetchHtml(url: string, opts: FetchOptions = {}): Promise<string> {
  const ua = opts.userAgent ?? DEFAULT_UA;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  logger.debug({ url }, 'fetching html');

  let res: Awaited<ReturnType<typeof request>>;
  try {
    res = await request(url, {
      dispatcher: crawlerDispatcher,
      method: 'GET',
      headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml' },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
  } catch (err) {
    throw new FetchError(`network error fetching ${url}`, { cause: err });
  }

  if (res.statusCode === 429 || res.statusCode === 503) {
    throw new RateLimitError(`rate limited (${res.statusCode}) fetching ${url}`);
  }
  if (res.statusCode >= 400) {
    throw new FetchError(`http ${res.statusCode} fetching ${url}`, { statusCode: res.statusCode });
  }
  // The body read can still time out (undici bodyTimeout) or reset AFTER
  // headers arrive — wrap it so it surfaces as a (transient) FetchError
  // rather than a raw undici error that the classifier treats as permanent.
  try {
    return await res.body.text();
  } catch (err) {
    throw new FetchError(`network error reading body for ${url}`, { cause: err });
  }
}

export async function fetchBytes(
  url: string,
  opts: FetchOptions = {},
): Promise<{ bytes: Buffer; contentType: string }> {
  const ua = opts.userAgent ?? DEFAULT_UA;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let res: Awaited<ReturnType<typeof request>>;
  try {
    res = await request(url, {
      dispatcher: crawlerDispatcher,
      method: 'GET',
      headers: { 'user-agent': ua },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
  } catch (err) {
    throw new FetchError(`network error fetching ${url}`, { cause: err });
  }
  if (res.statusCode >= 400) {
    throw new FetchError(`http ${res.statusCode} fetching ${url}`, { statusCode: res.statusCode });
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(await res.body.arrayBuffer());
  } catch (err) {
    throw new FetchError(`network error reading body for ${url}`, { cause: err });
  }
  const contentType = String(res.headers['content-type'] ?? 'application/octet-stream');
  return { bytes: buf, contentType };
}
