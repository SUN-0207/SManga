import { gunzipSync } from 'node:zlib';

/**
 * The crawler stores chapter content as gzipped UTF-8 bytes in `chapter.content_text`.
 * This helper is server-only — keep it out of any client component import graph.
 */
export function decompressChapterContent(bytes: Buffer | null): string | null {
  if (!bytes || bytes.length === 0) return null;
  try {
    return gunzipSync(bytes).toString('utf-8');
  } catch {
    // If a row was somehow written without gzip (shouldn't happen post-Plan-1), fall back.
    return bytes.toString('utf-8');
  }
}
