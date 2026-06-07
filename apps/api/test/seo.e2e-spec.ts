/**
 * SEO endpoints e2e suite.
 *
 * Strategy: build a minimal NestJS test application that imports only
 * SeoModule + HealthModule and supplies a fake global DbModule that
 * provides the DRIZZLE token with an in-memory stub.
 *
 * This avoids pulling in Bull/Redis (QueueModule) or a live Postgres
 * connection — those are infrastructure concerns outside SEO's scope.
 *
 * The test exercises:
 *  - HTTP routing at the root level (NOT under /api/v1/)
 *  - Correct Content-Type headers
 *  - Response body shape (XML index, urlset, text/plain)
 *  - Absence of /api/v1/sitemap.xml (404 guard)
 *  - Control: an existing /api/v1/* route returns 200, not 404
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Global, Module, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
// supertest exports a callable default; `import * as` fails under Vite SSR
// transform because there is no __esModule flag. Use `import supertest` (default).
import supertest from 'supertest';
import { DRIZZLE } from '../src/modules/db/db.provider';
import { HealthModule } from '../src/modules/health/health.module';
import { SeoModule } from '../src/modules/seo/seo.module';

// ── stub DB ───────────────────────────────────────────────────────────────────
// SeoService.listStoriesForSitemap / listChaptersForSitemap both call
// db.execute() and process the result with rowsOf(). Returning { rows: [] }
// gives valid empty arrays — the XML builders still produce well-formed output.
// HealthController.check() also calls db.execute(); a rejection turns db:false
// which is fine — the endpoint still resolves 200.
const mockDb = {
  execute: async () => ({ rows: [] }),
};

// @Global() means child modules (SeoModule, HealthModule) can inject DRIZZLE
// without importing FakeDbModule themselves — mirrors how the real DbModule works.
@Global()
@Module({
  providers: [{ provide: DRIZZLE, useValue: mockDb }],
  exports: [DRIZZLE],
})
class FakeDbModule {}

// ─────────────────────────────────────────────────────────────────────────────

describe('SEO endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeDbModule, SeoModule, HealthModule],
    }).compile();

    app = moduleRef.createNestApplication();

    // Mirror main.ts: exclude the SEO paths from the global /api prefix.
    app.setGlobalPrefix('api', {
      exclude: ['sitemap.xml', 'sitemap-stories.xml', 'sitemap-chapters.xml', 'robots.txt'],
    });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // supertest Test chains implement .then() and are awaitable, but some linters
  // misidentify them as non-Promises. Wrapping in Promise.resolve() makes the
  // intent explicit and silences typescript:S4123 without changing behaviour.
  const req = (chain: PromiseLike<supertest.Response>) => Promise.resolve(chain);

  // ── sitemap index ──────────────────────────────────────────────────────────

  it('GET /sitemap.xml → 200 application/xml with sitemapindex', async () => {
    const res = await req(supertest(app.getHttpServer()).get('/sitemap.xml').expect(200));
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.text).toContain('<sitemapindex');
    expect(res.text).toContain('sitemap-stories.xml');
    expect(res.text).toContain('sitemap-chapters.xml');
  });

  // ── story sitemap ──────────────────────────────────────────────────────────

  it('GET /sitemap-stories.xml → 200 application/xml with urlset', async () => {
    const res = await req(supertest(app.getHttpServer()).get('/sitemap-stories.xml').expect(200));
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.text).toContain('<urlset');
  });

  // ── chapter sitemap ────────────────────────────────────────────────────────

  it('GET /sitemap-chapters.xml → 200 application/xml with urlset', async () => {
    const res = await req(supertest(app.getHttpServer()).get('/sitemap-chapters.xml').expect(200));
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.text).toContain('<urlset');
  });

  // ── robots.txt ─────────────────────────────────────────────────────────────

  it('GET /robots.txt → 200 text/plain referencing sitemap', async () => {
    const res = await req(supertest(app.getHttpServer()).get('/robots.txt').expect(200));
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/^Sitemap: https:\/\/smanga\.shop\/sitemap\.xml$/m);
  });

  // ── routing guard ──────────────────────────────────────────────────────────

  it('GET /api/v1/sitemap.xml → 404 (SEO paths are NOT served under /api/v1/)', () =>
    req(supertest(app.getHttpServer()).get('/api/v1/sitemap.xml').expect(404)));

  // ── control ────────────────────────────────────────────────────────────────

  it('GET /api/v1/health → 200 (existing /api/v1/* routes still work)', async () => {
    // HealthController uses the stubbed DRIZZLE (execute returns rows:[]) →
    // db: false / status: "degraded" in response body, but HTTP 200 resolves.
    const res = await req(supertest(app.getHttpServer()).get('/api/v1/health').expect(200));
    expect(res.body).toHaveProperty('uptime');
  });
});
