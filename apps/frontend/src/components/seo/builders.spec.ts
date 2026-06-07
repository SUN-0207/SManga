import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  buildArticleSchema,
  buildBookSchema,
  buildBreadcrumbSchema,
  buildWebSiteSchema,
  stripAndTruncate,
} from './builders';

describe('absoluteUrl', () => {
  it('prepends base to root-relative paths', () => {
    expect(absoluteUrl('/truyen/abc')).toBe('https://smanga.shop/truyen/abc');
  });
  it('passes absolute URLs through unchanged', () => {
    expect(absoluteUrl('https://example.com/x')).toBe('https://example.com/x');
  });
});

describe('stripAndTruncate', () => {
  it('returns input unchanged if shorter than max', () => {
    expect(stripAndTruncate('short text', 50)).toBe('short text');
  });
  it('truncates at word boundary with ellipsis', () => {
    const out = stripAndTruncate('a quick brown fox jumps over the lazy dog', 20);
    expect(out.length).toBeLessThanOrEqual(21);
    expect(out).toMatch(/…$/);
    expect(out).not.toContain('fox jum');
  });
  it('handles Vietnamese diacritics safely', () => {
    const input = 'Cô gái có một con mèo đen tên là Mướp.';
    const out = stripAndTruncate(input, 20);
    expect(out.length).toBeLessThanOrEqual(21);
  });
  it('returns empty string for null / undefined', () => {
    expect(stripAndTruncate(null, 50)).toBe('');
    expect(stripAndTruncate(undefined, 50)).toBe('');
  });
});

describe('buildBookSchema', () => {
  const baseStory = {
    id: 's1',
    slug: 'tien-hiep',
    title: 'Tu Tiên',
    author: 'Mỗ Mỗ',
    description: 'Câu chuyện về tu luyện.',
    totalChapters: 100,
    genres: [{ slug: 'tien-hiep', name: 'Tiên Hiệp' }],
    ratingAvg: 4.5,
    ratingCount: 12,
    updatedAt: '2026-06-01T00:00:00Z',
    hasCover: true,
  };

  it('includes aggregateRating when ratingCount > 0', () => {
    const schema = buildBookSchema(baseStory);
    expect(schema['@type']).toBe('Book');
    expect(schema.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.5,
      ratingCount: 12,
      bestRating: 5,
      worstRating: 1,
    });
  });

  it('omits aggregateRating when ratingCount === 0', () => {
    const schema = buildBookSchema({ ...baseStory, ratingCount: 0, ratingAvg: null });
    expect(schema.aggregateRating).toBeUndefined();
  });

  it('falls back to "Khuyết danh" when author is null', () => {
    const schema = buildBookSchema({ ...baseStory, author: null });
    expect(schema.author).toEqual({ '@type': 'Person', name: 'Khuyết danh' });
  });

  it('sets numberOfPages from totalChapters', () => {
    const schema = buildBookSchema({ ...baseStory, totalChapters: 42 });
    expect(schema.numberOfPages).toBe(42);
  });

  it('emits genre as array of names', () => {
    const schema = buildBookSchema({
      ...baseStory,
      genres: [
        { slug: 'a', name: 'Tiên Hiệp' },
        { slug: 'b', name: 'Huyền Huyễn' },
      ],
    });
    expect(schema.genre).toEqual(['Tiên Hiệp', 'Huyền Huyễn']);
  });
});

describe('buildArticleSchema', () => {
  it('truncates articleBody to 500 chars', () => {
    const longBody = 'a'.repeat(1000);
    const schema = buildArticleSchema(
      { title: 'S', slug: 'a', author: 'X', updatedAt: '2026-06-01T00:00:00Z', discoveredAt: null },
      { index: '1', title: 'Ch1', content: longBody },
    );
    expect((schema.articleBody as string).length).toBeLessThanOrEqual(500);
  });
});

describe('buildBreadcrumbSchema', () => {
  it('builds itemListElement with positions', () => {
    const schema = buildBreadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Story', url: '/truyen/abc' },
      { name: 'Ch 1' },
    ]);
    const items = schema.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0]!.position).toBe(1);
    expect(items[2]!.item).toBeUndefined();
  });
});

describe('buildWebSiteSchema', () => {
  it('emits WebSite + SearchAction', () => {
    const schema = buildWebSiteSchema();
    expect(schema['@type']).toBe('WebSite');
    expect(schema.potentialAction).toBeDefined();
  });
});
