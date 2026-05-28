export const qk = {
  storiesList: (page: number, limit: number) => ['stories', { page, limit }] as const,
  storyBySlug: (slug: string) => ['stories', 'by-slug', slug] as const,
  chaptersBySlug: (slug: string, page: number) => ['chapters', slug, page] as const,
  chapterContent: (slug: string, index: string) => ['chapter', slug, index] as const,
};
