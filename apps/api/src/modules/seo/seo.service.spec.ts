import { SeoService } from './seo.service';

describe('SeoService builders', () => {
  describe('buildSitemapIndexXml', () => {
    it('returns sitemap index referencing stories + chapters', () => {
      const svc = new SeoService({} as never);
      const xml = svc.buildSitemapIndexXml('2026-06-07T10:00:00.000Z');
      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<sitemapindex');
      expect(xml).toContain('https://smanga.shop/sitemap-stories.xml');
      expect(xml).toContain('https://smanga.shop/sitemap-chapters.xml');
      expect(xml).toContain('<lastmod>2026-06-07T10:00:00.000Z</lastmod>');
    });
  });

  describe('buildSitemapStoriesXml', () => {
    it('renders one <url> per story with lastmod', () => {
      const svc = new SeoService({} as never);
      const xml = svc.buildSitemapStoriesXml([
        { slug: 'tien-hiep', updatedAt: '2026-06-01T00:00:00Z' },
        { slug: 'ngon-tinh', updatedAt: '2026-05-30T00:00:00Z' },
      ]);
      expect(xml).toContain('<loc>https://smanga.shop/truyen/tien-hiep</loc>');
      expect(xml).toContain('<lastmod>2026-06-01T00:00:00Z</lastmod>');
      expect(xml).toContain('<loc>https://smanga.shop/truyen/ngon-tinh</loc>');
      expect(xml.match(/<url>/g)?.length).toBe(2);
    });

    it('escapes XML-unsafe characters in slugs', () => {
      const svc = new SeoService({} as never);
      const xml = svc.buildSitemapStoriesXml([
        { slug: 'co-&-the', updatedAt: '2026-06-01T00:00:00Z' },
      ]);
      expect(xml).toContain('co-&amp;-the');
      expect(xml).not.toContain('co-&-the<');
    });

    it('returns valid empty <urlset> for no stories', () => {
      const svc = new SeoService({} as never);
      const xml = svc.buildSitemapStoriesXml([]);
      expect(xml).toContain('<urlset');
      expect(xml).toContain('</urlset>');
      expect(xml).not.toContain('<url>');
    });
  });

  describe('buildSitemapChaptersXml', () => {
    it('renders <url> for each (slug, chapterIndex) pair', () => {
      const svc = new SeoService({} as never);
      const xml = svc.buildSitemapChaptersXml([
        { slug: 'tien-hiep', chapterIndex: '1', updatedAt: '2026-06-01T00:00:00Z' },
        { slug: 'tien-hiep', chapterIndex: '2', updatedAt: '2026-06-02T00:00:00Z' },
      ]);
      expect(xml).toContain('<loc>https://smanga.shop/truyen/tien-hiep/chuong/1</loc>');
      expect(xml).toContain('<loc>https://smanga.shop/truyen/tien-hiep/chuong/2</loc>');
      expect(xml.match(/<url>/g)?.length).toBe(2);
    });
  });

  describe('buildRobotsTxt', () => {
    it('disallows admin/auth/library/account/profile + links sitemap', () => {
      const svc = new SeoService({} as never);
      const txt = svc.buildRobotsTxt();
      expect(txt).toMatch(/^User-agent: \*$/m);
      expect(txt).toMatch(/^Disallow: \/admin\/$/m);
      expect(txt).toMatch(/^Disallow: \/dang-nhap$/m);
      expect(txt).toMatch(/^Disallow: \/dang-ky$/m);
      expect(txt).toMatch(/^Disallow: \/tim-kiem$/m);
      expect(txt).toMatch(/^Disallow: \/tu-sach$/m);
      expect(txt).toMatch(/^Disallow: \/tai-khoan$/m);
      expect(txt).toMatch(/^Disallow: \/ban$/m);
      expect(txt).toMatch(/^Sitemap: https:\/\/smanga\.shop\/sitemap\.xml$/m);
    });
  });
});
