import { fetchBytes } from './fetcher.ts';
import { logger } from './logger.ts';

const MAX_COVER_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function downloadCover(
  url: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  try {
    const { bytes, contentType } = await fetchBytes(url);
    const mimeType = contentType.split(';')[0]?.trim() ?? 'application/octet-stream';
    if (!ALLOWED.has(mimeType)) {
      logger.warn({ url, mimeType }, 'cover mime not allowed, skipping');
      return null;
    }
    if (bytes.length > MAX_COVER_BYTES) {
      logger.warn({ url, size: bytes.length }, 'cover too large, skipping');
      return null;
    }
    return { bytes, mimeType };
  } catch (err) {
    logger.warn({ url, err: (err as Error).message }, 'failed to download cover');
    return null;
  }
}
