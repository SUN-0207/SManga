/**
 * Strip the "Chương N:" / "Chương N." / "Chương N" prefix from a
 * chapter title so renderers and SEO titles don't end up with a
 * double "Chương 12: Chương 12: Hồi sinh" when they wrap the title
 * with their own prefix. The chapter detail route + SEO title both
 * use this — keep them in sync via the shared regex here.
 */
export function cleanChapterTitle(raw: string): string {
  return raw.replace(/^Chương\s*\d+(?:\.\d+)?\s*:?\s*/i, '').trim();
}
