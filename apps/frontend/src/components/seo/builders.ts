const BASE = 'https://smanga.shop';

export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith('/')) return `${BASE}${pathOrUrl}`;
  return `${BASE}/${pathOrUrl}`;
}

export function stripAndTruncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  const slice = collapsed.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${cut}…`;
}

interface StoryForBook {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  description: string;
  totalChapters: number;
  genres: Array<{ slug: string; name: string }>;
  ratingAvg: number | null;
  ratingCount: number;
  updatedAt: string;
  hasCover: boolean;
}

export function buildBookSchema(story: StoryForBook): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: story.title,
    author: {
      '@type': 'Person',
      name: story.author ?? 'Khuyết danh',
    },
    url: absoluteUrl(`/truyen/${story.slug}`),
    image: absoluteUrl(`/api/v1/cover/${story.id}`),
    inLanguage: 'vi',
    numberOfPages: story.totalChapters,
    genre: story.genres.map((g) => g.name),
    bookFormat: 'https://schema.org/EBook',
    isAccessibleForFree: true,
    dateModified: new Date(story.updatedAt).toISOString(),
  };
  if (story.ratingCount > 0 && story.ratingAvg != null) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: story.ratingAvg,
      ratingCount: story.ratingCount,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return schema;
}

interface StoryForArticle {
  title: string;
  slug: string;
  author: string | null;
  updatedAt: string;
  discoveredAt: string | null;
}

export function buildArticleSchema(
  story: StoryForArticle,
  chapter: { index: string; title: string; content: string },
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `Chương ${chapter.index}: ${chapter.title}`,
    articleBody: stripAndTruncate(chapter.content, 500).replace(/…$/, ''),
    inLanguage: 'vi',
    isPartOf: {
      '@type': 'Book',
      name: story.title,
      url: absoluteUrl(`/truyen/${story.slug}`),
    },
    author: { '@type': 'Person', name: story.author ?? 'Khuyết danh' },
    datePublished: new Date(story.discoveredAt ?? story.updatedAt).toISOString(),
    dateModified: new Date(story.updatedAt).toISOString(),
  };
}

export function buildBreadcrumbSchema(
  items: Array<{ name: string; url?: string }>,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.url ? { item: absoluteUrl(item.url) } : {}),
    })),
  };
}

export function buildWebSiteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'SManga',
    url: BASE,
    inLanguage: 'vi',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${BASE}/kham-pha?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}
