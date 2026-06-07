# SEO Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-06-07-seo-quick-wins-design.md](../specs/2026-06-07-seo-quick-wins-design.md)

**Goal:** Get SManga's public catalog properly indexed by Google via per-route head tags, JSON-LD structured data, a dynamic sitemap, and a robots policy — without migrating off the Vite SPA.

**Architecture:** SPA stays. `react-helmet-async` mutates `<head>` per route. New NestJS `SeoModule` serves `/sitemap.xml`, `/sitemap-stories.xml`, `/sitemap-chapters.xml`, `/robots.txt` at root (NestJS global prefix excluded for these). Caddyfile gets one matcher to route those four paths to the API instead of the SPA. Chapters 1-3 indexed; 4+ noindex.

**Tech Stack:** NestJS 11 · Vite + React 19 · `react-helmet-async@2` · Drizzle ORM · Vitest · Playwright MCP.

**User constraints (NON-NEGOTIABLE):**

- **`commit-only`, never `git push`.** User pushes manually when ready.
- **Playwright MCP proof before suggesting any push** (per memory `feedback_smanga_test_with_playwright_before_push`). Visual / curl evidence per task.

---

## File map

### Created

```
apps/api/src/modules/seo/
  seo.module.ts                 NEW — registers SeoController + SeoService
  seo.controller.ts             NEW — 4 root endpoints
  seo.service.ts                NEW — XML/text builders + DB queries
  seo.service.spec.ts           NEW — unit tests for builders
  seo.controller.e2e-spec.ts    NEW — endpoint integration tests

apps/frontend/src/components/seo/
  SEO.tsx                       NEW — <SEO> React component
  builders.ts                   NEW — pure functions: schemas, truncate, absoluteUrl
  builders.spec.ts              NEW — unit tests for builders
  SEO.spec.tsx                  NEW — component test

apps/frontend/public/
  og-default.png                NEW — 1200×630 fallback OG image
```

### Modified

```
apps/api/src/
  main.ts                       prefix exclude for sitemap*.xml + robots.txt
  app.module.ts                 import SeoModule
  modules/stories/stories.service.ts   add updated_at to getBySlug SQL

apps/frontend/
  package.json                  add react-helmet-async dependency
  src/main.tsx                  wrap app in <HelmetProvider>
  src/routes/index.tsx                              integrate <SEO>
  src/routes/kham-pha.tsx                           integrate <SEO>
  src/routes/bang-xep-hang.tsx                      integrate <SEO>
  src/routes/dang-nhap.tsx                          <SEO robots="noindex">
  src/routes/dang-ky.tsx                            <SEO robots="noindex">
  src/routes/tu-sach.tsx                            <SEO robots="noindex">
  src/routes/tai-khoan.tsx                          <SEO robots="noindex">
  src/routes/ban.tsx                                <SEO robots="noindex">
  src/routes/admin/route.tsx                        <SEO robots="noindex"> in layout
  src/routes/truyen/$slug/index.tsx                 <SEO> with Book JSON-LD
  src/routes/truyen/$slug/chuong/$index.tsx         <SEO> with hybrid robots + Article + Breadcrumb

deploy/home/
  Caddyfile                     add @seo matcher before /api/* and default handlers
```

---

## Task 1: Backend — add `updatedAt` to `getBySlug`

**Why first:** Story JSON-LD needs `dateModified`. Sitemap needs `<lastmod>`. Both consume from `getBySlug` and `listStoriesForSitemap`. The current `getBySlug` SQL omits `s.updated_at` — fix once, both consumers benefit.

**Files:**
- Modify: `apps/api/src/modules/stories/stories.service.ts` (around L216-233 SELECT clause + the response mapping near L260)
- Test: `apps/api/src/modules/stories/stories.service.spec.ts` (new or extend existing)

- [ ] **Step 1: Add a failing test for `getBySlug` returning `updatedAt`**

```ts
// apps/api/src/modules/stories/stories.service.spec.ts (extend or create)
import { Test } from '@nestjs/testing';
import { StoriesService } from './stories.service';

describe('StoriesService.getBySlug', () => {
  it('returns updatedAt in the response', async () => {
    // arrange — assume a seeded story with slug 'test-story'
    const service = await buildTestStoriesService();
    const story = await service.getBySlug('test-story');
    expect(story.updatedAt).toBeDefined();
    expect(typeof story.updatedAt).toBe('string');
    // ISO-8601 timestamp
    expect(new Date(story.updatedAt).toString()).not.toBe('Invalid Date');
  });
});

async function buildTestStoriesService(): Promise<StoriesService> {
  // Reuse existing test harness — see other *.service.spec.ts in apps/api/src/modules/
  // for the pattern; do not invent a new harness here.
  throw new Error('use existing test factory from neighbor files');
}
```

If there's no existing harness for `StoriesService` tests, write the test using `supertest` against the running app instead (see Task 9 pattern). Skip the unit test and rely on the e2e check.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
pnpm --filter @smanga/api test -- stories.service
```

Expected: FAIL with `story.updatedAt` undefined.

- [ ] **Step 3: Add `s.updated_at` to the SELECT in `getBySlug`**

In `apps/api/src/modules/stories/stories.service.ts`, locate the `getBySlug` method. Find the SQL `SELECT` clause (around L216-233). Add `s.updated_at` to the column list and to the typed response. Map it onto the returned object as `updatedAt: row.updated_at`.

Concrete diff (apply to the existing query — preserve the surrounding columns and keep alphabetical/logical order with neighboring fields):

```ts
// in the SELECT:
//   s.id, s.slug, s.title, ..., s.discovered_at,
+ //   s.updated_at,
//   s.featured, ...

// in the type parameter to db.execute<{...}>:
+ //   updated_at: string;

// in the rowsOf<{...}> type:
+ //   updated_at: string;

// in the final return mapping (around L260):
return {
  // ...existing fields...
+ updatedAt: row.updated_at,
  // ...rest...
};
```

- [ ] **Step 4: Re-run the test**

```bash
pnpm --filter @smanga/api test -- stories.service
```

Expected: PASS.

- [ ] **Step 5: Typecheck the whole monorepo**

```bash
pnpm typecheck
```

Expected: all packages PASS. (The frontend `StoryDetail` interface already extends `StorySummary` which has `updatedAt`, so no FE change is needed.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/stories/stories.service.ts apps/api/src/modules/stories/stories.service.spec.ts
git commit -m "feat(stories/get-by-slug): include updatedAt for SEO consumers"
```

---

## Task 2: Backend — SeoService XML builders + DB queries

**Why:** Pure functions and DB queries together — easier to unit test as one module since the queries are thin.

**Files:**
- Create: `apps/api/src/modules/seo/seo.service.ts`
- Create: `apps/api/src/modules/seo/seo.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/modules/seo/seo.service.spec.ts
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
pnpm --filter @smanga/api test -- seo.service.spec
```

Expected: FAIL with `Cannot find module './seo.service'`.

- [ ] **Step 3: Implement `SeoService`**

```ts
// apps/api/src/modules/seo/seo.service.ts
import { DRIZZLE } from '@/modules/db/db.provider';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@smanga/db';
import { sql } from 'drizzle-orm';

const BASE = 'https://smanga.shop';

const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);

// Escape characters that XML 1.0 parsers reject inside element content.
// Apostrophe and quote are not strictly required outside attribute values,
// but escaping them is cheap and avoids surprises if a slug ever lands inside
// an attribute later.
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

@Injectable()
export class SeoService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listStoriesForSitemap(): Promise<Array<{ slug: string; updatedAt: string }>> {
    const r = await this.db.execute<{ slug: string; updated_at: string }>(sql`
      SELECT slug, updated_at
      FROM story
      WHERE discovery_status = 'complete'
      ORDER BY updated_at DESC
    `);
    return rowsOf<{ slug: string; updated_at: string }>(r).map((row) => ({
      slug: row.slug,
      updatedAt: row.updated_at,
    }));
  }

  // First 3 chapters per story — joined on story.discovery_status = 'complete'
  // so we never advertise chapters whose parent is still a stub.
  async listChaptersForSitemap(): Promise<
    Array<{ slug: string; chapterIndex: string; updatedAt: string }>
  > {
    const r = await this.db.execute<{
      slug: string;
      index: string;
      updated_at: string;
    }>(sql`
      SELECT s.slug, c.index, c.updated_at
      FROM chapter c
      JOIN story s ON s.id = c.story_id
      WHERE c.index IN ('1','2','3')
        AND s.discovery_status = 'complete'
      ORDER BY s.updated_at DESC, c.index ASC
    `);
    return rowsOf<{ slug: string; index: string; updated_at: string }>(r).map((row) => ({
      slug: row.slug,
      chapterIndex: row.index,
      updatedAt: row.updated_at,
    }));
  }

  buildSitemapIndexXml(now: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${BASE}/sitemap-stories.xml</loc>
    <lastmod>${escapeXml(now)}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${BASE}/sitemap-chapters.xml</loc>
    <lastmod>${escapeXml(now)}</lastmod>
  </sitemap>
</sitemapindex>
`;
  }

  buildSitemapStoriesXml(stories: Array<{ slug: string; updatedAt: string }>): string {
    const urls = stories
      .map(
        (s) =>
          `  <url>\n    <loc>${BASE}/truyen/${escapeXml(s.slug)}</loc>\n    <lastmod>${escapeXml(s.updatedAt)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
      )
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  }

  buildSitemapChaptersXml(
    chapters: Array<{ slug: string; chapterIndex: string; updatedAt: string }>,
  ): string {
    const urls = chapters
      .map(
        (c) =>
          `  <url>\n    <loc>${BASE}/truyen/${escapeXml(c.slug)}/chuong/${escapeXml(c.chapterIndex)}</loc>\n    <lastmod>${escapeXml(c.updatedAt)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>`,
      )
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  }

  buildRobotsTxt(): string {
    return `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /dang-nhap
Disallow: /dang-ky
Disallow: /tim-kiem
Disallow: /tu-sach
Disallow: /tai-khoan
Disallow: /ban

Sitemap: ${BASE}/sitemap.xml
`;
  }
}
```

- [ ] **Step 4: Re-run the tests**

```bash
pnpm --filter @smanga/api test -- seo.service.spec
```

Expected: PASS (all four `describe` blocks).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/seo/seo.service.ts apps/api/src/modules/seo/seo.service.spec.ts
git commit -m "feat(seo): service with sitemap + robots builders"
```

---

## Task 3: Backend — SeoController + SeoModule + main.ts prefix exclude

**Files:**
- Create: `apps/api/src/modules/seo/seo.controller.ts`
- Create: `apps/api/src/modules/seo/seo.module.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Implement SeoController**

```ts
// apps/api/src/modules/seo/seo.controller.ts
import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import { SeoService } from './seo.service';

const CACHE_24H =
  'public, max-age=86400, stale-while-revalidate=3600';

function setSeoHeaders(res: Response, body: string, contentType: string): void {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', CACHE_24H);
  res.setHeader('ETag', `"${createHash('sha1').update(body).digest('hex')}"`);
}

@ApiTags('seo')
@Controller()
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get('sitemap.xml')
  async sitemapIndex(@Res() res: Response): Promise<void> {
    const body = this.seo.buildSitemapIndexXml(new Date().toISOString());
    setSeoHeaders(res, body, 'application/xml; charset=utf-8');
    res.send(body);
  }

  @Get('sitemap-stories.xml')
  async sitemapStories(@Res() res: Response): Promise<void> {
    const stories = await this.seo.listStoriesForSitemap();
    const body = this.seo.buildSitemapStoriesXml(stories);
    setSeoHeaders(res, body, 'application/xml; charset=utf-8');
    res.send(body);
  }

  @Get('sitemap-chapters.xml')
  async sitemapChapters(@Res() res: Response): Promise<void> {
    const chapters = await this.seo.listChaptersForSitemap();
    const body = this.seo.buildSitemapChaptersXml(chapters);
    setSeoHeaders(res, body, 'application/xml; charset=utf-8');
    res.send(body);
  }

  @Get('robots.txt')
  robots(@Res() res: Response): void {
    const body = this.seo.buildRobotsTxt();
    setSeoHeaders(res, body, 'text/plain; charset=utf-8');
    res.send(body);
  }
}
```

- [ ] **Step 2: Implement SeoModule**

```ts
// apps/api/src/modules/seo/seo.module.ts
import { DbModule } from '@/modules/db/db.module';
import { Module } from '@nestjs/common';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

@Module({
  imports: [DbModule],
  controllers: [SeoController],
  providers: [SeoService],
})
export class SeoModule {}
```

(Verify `DbModule` import path matches the convention used by `apps/api/src/modules/stories/stories.module.ts`. If that file imports DB differently, mirror it.)

- [ ] **Step 3: Register SeoModule in AppModule**

In `apps/api/src/app.module.ts`, find the `imports: [...]` array and add `SeoModule`:

```ts
import { SeoModule } from './modules/seo/seo.module';

// inside @Module({ imports: [..., SeoModule] })
```

- [ ] **Step 4: Exclude SEO paths from global prefix in main.ts**

In `apps/api/src/main.ts`, find `app.setGlobalPrefix('api')`. Replace with:

```ts
app.setGlobalPrefix('api', {
  exclude: ['sitemap.xml', 'sitemap-stories.xml', 'sitemap-chapters.xml', 'robots.txt'],
});
```

If NestJS 11 rejects the string-array form (it may require `{ path, method }` objects), use the verbose form:

```ts
import { RequestMethod } from '@nestjs/common';

app.setGlobalPrefix('api', {
  exclude: [
    { path: 'sitemap.xml', method: RequestMethod.GET },
    { path: 'sitemap-stories.xml', method: RequestMethod.GET },
    { path: 'sitemap-chapters.xml', method: RequestMethod.GET },
    { path: 'robots.txt', method: RequestMethod.GET },
  ],
});
```

- [ ] **Step 5: Typecheck + boot dev API to smoke-test**

```bash
pnpm --filter @smanga/api typecheck
```

Expected: PASS.

```powershell
# Terminal: ensure dev DB up
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
$env:REDIS_URL = "redis://localhost:6379"
$env:JWT_SECRET = (Get-Content .env | Select-String 'JWT_SECRET=' | ForEach-Object { $_.ToString().Split('=')[1] })
pnpm dev:api
```

Then in a second terminal:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3001/sitemap.xml
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3001/sitemap-stories.xml
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3001/sitemap-chapters.xml
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3001/robots.txt
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3001/api/v1/sources   # control — existing path still works
```

Expected: 200, 200, 200, 200, 200.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/seo apps/api/src/main.ts apps/api/src/app.module.ts
git commit -m "feat(seo): controller + module wired at root, global prefix bypassed"
```

---

## Task 4: Backend — SeoController e2e tests

**Files:**
- Create: `apps/api/test/seo.e2e-spec.ts` (or wherever neighbor `*.e2e-spec.ts` files live — confirm via `glob`)

- [ ] **Step 1: Write the failing e2e tests**

```ts
// apps/api/test/seo.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, RequestMethod } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('SEO endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: ['sitemap.xml', 'sitemap-stories.xml', 'sitemap-chapters.xml', 'robots.txt'],
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /sitemap.xml returns XML index with both sub-sitemaps', () => {
    return request(app.getHttpServer())
      .get('/sitemap.xml')
      .expect(200)
      .expect('Content-Type', /application\/xml/)
      .expect((res) => {
        expect(res.text).toContain('<sitemapindex');
        expect(res.text).toContain('sitemap-stories.xml');
        expect(res.text).toContain('sitemap-chapters.xml');
      });
  });

  it('GET /sitemap-stories.xml returns urlset', () => {
    return request(app.getHttpServer())
      .get('/sitemap-stories.xml')
      .expect(200)
      .expect('Content-Type', /application\/xml/)
      .expect((res) => {
        expect(res.text).toContain('<urlset');
      });
  });

  it('GET /sitemap-chapters.xml returns urlset', () => {
    return request(app.getHttpServer())
      .get('/sitemap-chapters.xml')
      .expect(200)
      .expect('Content-Type', /application\/xml/);
  });

  it('GET /robots.txt is text/plain and references sitemap', () => {
    return request(app.getHttpServer())
      .get('/robots.txt')
      .expect(200)
      .expect('Content-Type', /text\/plain/)
      .expect((res) => {
        expect(res.text).toMatch(/^Sitemap: https:\/\/smanga\.shop\/sitemap\.xml$/m);
      });
  });

  it('SEO paths are NOT served under /api/v1/', () => {
    return request(app.getHttpServer())
      .get('/api/v1/sitemap.xml')
      .expect(404);
  });

  it('existing /api/v1/* routes still work (control)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/sources')
      .expect((res) => {
        // sources endpoint may require auth — either 200 or 401, but NOT 404
        expect([200, 401, 403]).toContain(res.status);
      });
  });
});
```

- [ ] **Step 2: Run + confirm pass**

```bash
pnpm --filter @smanga/api test:e2e -- seo.e2e
```

Expected: PASS (6 assertions).

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/seo.e2e-spec.ts
git commit -m "test(seo): e2e for sitemap + robots endpoints"
```

---

## Task 5: Caddyfile @seo matcher

**Files:**
- Modify: `deploy/home/Caddyfile`

- [ ] **Step 1: Read current Caddyfile**

```bash
cat deploy/home/Caddyfile
```

Identify the `:8080` site block and its `handle` directives.

- [ ] **Step 2: Add `@seo` matcher BEFORE the existing `handle /api/*` and default `handle`**

The matcher MUST come before other handlers — Caddy evaluates them in order. The block to add:

```caddyfile
  @seo path /sitemap*.xml /robots.txt
  handle @seo {
    reverse_proxy api:3001
  }
```

The full site block should look like (assuming existing layout):

```caddyfile
:8080 {
  encode zstd gzip

  @seo path /sitemap*.xml /robots.txt
  handle @seo {
    reverse_proxy api:3001
  }

  handle /api/* {
    reverse_proxy api:3001
  }

  handle {
    reverse_proxy frontend:80
  }
}
```

Preserve any existing `log`, `header`, or other directives. Only add the `@seo` matcher + its `handle` block.

- [ ] **Step 3: Smoke test the Caddyfile syntax locally if possible**

```bash
# If caddy is installed on the workstation:
caddy validate --config deploy/home/Caddyfile --adapter caddyfile
```

Expected: `Valid configuration`. If `caddy` is not installed, skip — the laptop will validate on next deploy.

- [ ] **Step 4: Commit**

```bash
git add deploy/home/Caddyfile
git commit -m "fix(deploy/caddy): route /sitemap*.xml + /robots.txt to api"
```

---

## Task 6: Frontend — install react-helmet-async + wire HelmetProvider

**Files:**
- Modify: `apps/frontend/package.json`
- Modify: `apps/frontend/src/main.tsx`

- [ ] **Step 1: Install the dependency**

```powershell
pnpm --filter @smanga/frontend add react-helmet-async@^2.0.5
```

- [ ] **Step 2: Verify React 19 compat — read the resulting package.json**

```bash
cat apps/frontend/package.json | grep -A1 react-helmet-async
```

If pnpm warned about peer-dep mismatch with React 19, add to `apps/frontend/package.json`:

```json
"pnpm": {
  "overrides": {
    "react-helmet-async>react": "$react",
    "react-helmet-async>react-dom": "$react-dom"
  }
}
```

Then re-run `pnpm install` at the repo root. If `pnpm.overrides` already exists at root, merge entries instead.

- [ ] **Step 3: Wrap the app in `<HelmetProvider>`**

In `apps/frontend/src/main.tsx`, locate where the app is rendered. Wrap the existing tree:

```tsx
import { HelmetProvider } from 'react-helmet-async';

// inside ReactDOM.createRoot(...).render(...)
<StrictMode>
  <HelmetProvider>
    {/* existing tree (QueryClientProvider, RouterProvider, etc.) */}
  </HelmetProvider>
</StrictMode>
```

If `<StrictMode>` is absent, put `<HelmetProvider>` at the outermost level of the rendered tree.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @smanga/frontend typecheck
```

Expected: PASS.

- [ ] **Step 5: Boot dev frontend to confirm no runtime crash**

```bash
pnpm dev:frontend
```

Then `curl -sf http://localhost:3000/ -o /dev/null && echo OK`. Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/package.json apps/frontend/src/main.tsx pnpm-lock.yaml
git commit -m "feat(frontend/seo): install react-helmet-async + provider"
```

---

## Task 7: Frontend — SEO builders (pure functions)

**Files:**
- Create: `apps/frontend/src/components/seo/builders.ts`
- Create: `apps/frontend/src/components/seo/builders.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/frontend/src/components/seo/builders.spec.ts
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
    expect(out.length).toBeLessThanOrEqual(21); // 20 + ellipsis
    expect(out).toMatch(/…$/);
    expect(out).not.toContain('fox jum'); // not mid-word
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
      { title: 'S', slug: 'a', author: 'X', updatedAt: 'now', discoveredAt: null },
      { index: '1', title: 'Ch1', content: longBody },
    );
    expect(schema.articleBody.length).toBeLessThanOrEqual(500);
  });
});

describe('buildBreadcrumbSchema', () => {
  it('builds itemListElement with positions', () => {
    const schema = buildBreadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Story', url: '/truyen/abc' },
      { name: 'Ch 1' },
    ]);
    expect(schema.itemListElement).toHaveLength(3);
    expect(schema.itemListElement[0].position).toBe(1);
    expect(schema.itemListElement[2].item).toBeUndefined(); // last item: no `item` URL
  });
});

describe('buildWebSiteSchema', () => {
  it('emits WebSite + SearchAction', () => {
    const schema = buildWebSiteSchema();
    expect(schema['@type']).toBe('WebSite');
    expect(schema.potentialAction).toBeDefined();
  });
});
```

- [ ] **Step 2: Run + confirm fail**

```bash
pnpm --filter @smanga/frontend test -- builders.spec
```

Expected: FAIL with `Cannot find module './builders'`.

- [ ] **Step 3: Implement builders**

```ts
// apps/frontend/src/components/seo/builders.ts
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
  // Cut at last whitespace before `max` to avoid mid-word truncation.
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
    dateModified: story.updatedAt,
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
    datePublished: story.discoveredAt ?? story.updatedAt,
    dateModified: story.updatedAt,
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
```

- [ ] **Step 4: Re-run tests**

```bash
pnpm --filter @smanga/frontend test -- builders.spec
```

Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/seo/builders.ts apps/frontend/src/components/seo/builders.spec.ts
git commit -m "feat(frontend/seo): pure builders for JSON-LD + truncate + URL"
```

---

## Task 8: Frontend — `<SEO>` React component

**Files:**
- Create: `apps/frontend/src/components/seo/SEO.tsx`
- Create: `apps/frontend/src/components/seo/SEO.spec.tsx`

- [ ] **Step 1: Write the failing component test**

```tsx
// apps/frontend/src/components/seo/SEO.spec.tsx
import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { SEO } from './SEO';

function renderWithProvider(node: React.ReactNode) {
  return render(<HelmetProvider>{node}</HelmetProvider>);
}

describe('<SEO>', () => {
  it('sets document.title from props', async () => {
    renderWithProvider(
      <SEO title="Test Title" description="Test desc" canonical="/x" />,
    );
    await waitFor(() => expect(document.title).toBe('Test Title'));
  });

  it('injects meta description', async () => {
    renderWithProvider(
      <SEO title="T" description="My description here" canonical="/x" />,
    );
    await waitFor(() => {
      const meta = document.querySelector('meta[name="description"]');
      expect(meta?.getAttribute('content')).toBe('My description here');
    });
  });

  it('injects canonical link as absolute URL', async () => {
    renderWithProvider(<SEO title="T" description="D" canonical="/foo" />);
    await waitFor(() => {
      const link = document.querySelector('link[rel="canonical"]');
      expect(link?.getAttribute('href')).toBe('https://smanga.shop/foo');
    });
  });

  it('renders JSON-LD script when jsonLd prop provided', async () => {
    const ld = { '@context': 'https://schema.org', '@type': 'WebSite' };
    renderWithProvider(
      <SEO title="T" description="D" canonical="/x" jsonLd={ld} />,
    );
    await waitFor(() => {
      const script = document.querySelector('script[type="application/ld+json"]');
      expect(script).not.toBeNull();
      expect(JSON.parse(script!.textContent ?? '{}')).toEqual(ld);
    });
  });

  it('sets robots meta from prop', async () => {
    renderWithProvider(
      <SEO title="T" description="D" canonical="/x" robots="noindex" />,
    );
    await waitFor(() => {
      const meta = document.querySelector('meta[name="robots"]');
      expect(meta?.getAttribute('content')).toBe('noindex');
    });
  });

  it('defaults robots to "index" when prop omitted', async () => {
    renderWithProvider(<SEO title="T" description="D" canonical="/x" />);
    await waitFor(() => {
      const meta = document.querySelector('meta[name="robots"]');
      expect(meta?.getAttribute('content')).toBe('index');
    });
  });
});
```

- [ ] **Step 2: Run + confirm fail**

```bash
pnpm --filter @smanga/frontend test -- SEO.spec
```

Expected: FAIL with import error.

- [ ] **Step 3: Implement `<SEO>` component**

```tsx
// apps/frontend/src/components/seo/SEO.tsx
import { Helmet } from 'react-helmet-async';
import { absoluteUrl } from './builders';

export interface SEOProps {
  title: string;
  description: string;
  canonical: string;
  robots?: 'index' | 'noindex' | 'noindex, follow';
  jsonLd?: object | object[];
  ogImage?: string;
  ogType?: 'website' | 'article' | 'book';
}

export function SEO({
  title,
  description,
  canonical,
  robots = 'index',
  jsonLd,
  ogImage = '/og-default.png',
  ogType = 'website',
}: SEOProps) {
  const url = absoluteUrl(canonical);
  const image = absoluteUrl(ogImage);
  const ldArray = jsonLd == null ? [] : Array.isArray(jsonLd) ? jsonLd : [jsonLd];

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robots} />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:type" content={ogType} />
      <meta property="og:locale" content="vi_VN" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {ldArray.map((ld, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable order, length doesn't change after mount
        <script key={i} type="application/ld+json">
          {JSON.stringify(ld)}
        </script>
      ))}
    </Helmet>
  );
}
```

- [ ] **Step 4: Re-run tests**

```bash
pnpm --filter @smanga/frontend test -- SEO.spec
```

Expected: PASS (6 specs).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/seo/SEO.tsx apps/frontend/src/components/seo/SEO.spec.tsx
git commit -m "feat(frontend/seo): <SEO> component wrapping react-helmet-async"
```

---

## Task 9: OG default image asset

**Files:**
- Create: `apps/frontend/public/og-default.png` (1200×630 PNG)

- [ ] **Step 1: Generate the image**

Use any one of:

a) Manual: open `https://og-image.vercel.app/SManga%20%E2%80%94%20%C4%90%E1%BB%8Dc%20truy%E1%BB%87n%20ch%E1%BB%AF%20Vi%E1%BB%87t.png?theme=light&md=1&fontSize=100px` and save the result. Or use a similar OG image generator.

b) Script (Node + sharp): create a one-off generator. Skip if you don't want a dependency for one image.

c) Design system: open `design-system/smanga/MASTER.md` for tokens, then create a 1200×630 PNG with:
   - Background: pink-to-zinc subtle gradient (`from-pink-50 to-zinc-50`)
   - Headline (Newsreader font): "SManga"
   - Subhead (Roboto): "Đọc truyện chữ Việt online"
   - Small icon top-left: book glyph
   - Pink accent stripe bottom 16px

Save to `apps/frontend/public/og-default.png`. The file should be < 200 KB.

- [ ] **Step 2: Verify the file is served**

```bash
pnpm dev:frontend &
sleep 3
curl -sf -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/og-default.png
```

Expected: `HTTP 200`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/public/og-default.png
git commit -m "feat(frontend/seo): on-brand 1200x630 og-default.png"
```

---

## Task 10: Integrate `<SEO>` — home, /kham-pha, /bang-xep-hang

**Files:**
- Modify: `apps/frontend/src/routes/index.tsx`
- Modify: `apps/frontend/src/routes/kham-pha.tsx`
- Modify: `apps/frontend/src/routes/bang-xep-hang.tsx`

- [ ] **Step 1: Home — add `<SEO>` with WebSite JSON-LD**

In `apps/frontend/src/routes/index.tsx`, at the top of the `HomePage` component return, before any other markup:

```tsx
import { SEO } from '@/components/seo/SEO';
import { buildWebSiteSchema } from '@/components/seo/builders';

// inside HomePage() return:
return (
  <>
    <SEO
      title="SManga — Đọc truyện chữ Việt online miễn phí"
      description="Thư viện truyện chữ Việt biên tập như tạp chí — ngôn tình, tiên hiệp, huyền huyễn, kiếm hiệp... đọc online không quảng cáo."
      canonical="/"
      jsonLd={buildWebSiteSchema()}
    />
    {/* existing content */}
  </>
);
```

If the existing return is already wrapped in a fragment, just add `<SEO ... />` as the first child.

- [ ] **Step 2: /kham-pha**

In `apps/frontend/src/routes/kham-pha.tsx`:

```tsx
import { SEO } from '@/components/seo/SEO';

// at top of component return:
<SEO
  title="Khám phá truyện chữ | SManga"
  description="Khám phá truyện theo thể loại: ngôn tình, tiên hiệp, huyền huyễn, kiếm hiệp, đô thị, cổ đại..."
  canonical="/kham-pha"
/>
```

- [ ] **Step 3: /bang-xep-hang**

In `apps/frontend/src/routes/bang-xep-hang.tsx`:

```tsx
import { SEO } from '@/components/seo/SEO';

<SEO
  title="Bảng xếp hạng truyện hot | SManga"
  description="Truyện hot tuần, xem nhiều nhất, rating cao nhất — cập nhật mỗi ngày."
  canonical="/bang-xep-hang"
/>
```

(`ItemList` JSON-LD is omitted at this step — would need to inspect the active tab and lazy-build per data. Defer to a later enhancement; the canonical + meta tags are the SEO load-bearing parts.)

- [ ] **Step 4: Typecheck + smoke**

```bash
pnpm --filter @smanga/frontend typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/routes/index.tsx apps/frontend/src/routes/kham-pha.tsx apps/frontend/src/routes/bang-xep-hang.tsx
git commit -m "feat(frontend/seo): meta + WebSite JSON-LD on home/kham-pha/bang-xep-hang"
```

---

## Task 11: Integrate `<SEO>` — story detail (`/truyen/$slug`)

**Files:**
- Modify: `apps/frontend/src/routes/truyen/$slug/index.tsx`

- [ ] **Step 1: Add `<SEO>` with Book schema**

Locate the `StoryDetail` component. After the `useQuery` for `getStoryBySlug` resolves to `s`, render `<SEO>`:

```tsx
import { SEO } from '@/components/seo/SEO';
import { buildBookSchema, stripAndTruncate } from '@/components/seo/builders';

// after the existing const s = q.data check passes:
<SEO
  title={`${s.title} - ${s.author ?? 'Khuyết danh'} | SManga`}
  description={
    stripAndTruncate(s.description, 160) ||
    `Đọc ${s.title} - ${s.author ?? 'Khuyết danh'} miễn phí tại SManga.`
  }
  canonical={`/truyen/${s.slug}`}
  ogType="book"
  ogImage={s.hasCover ? `/api/v1/cover/${s.id}` : undefined}
  jsonLd={buildBookSchema(s)}
/>
```

(Place this inside the conditional that already guards against `q.data` being undefined.)

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @smanga/frontend typecheck
```

Expected: PASS. If `buildBookSchema`'s `StoryForBook` interface doesn't accept `StoryDetail` because of extra optional fields, adjust the interface in `builders.ts` to be structurally compatible.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/routes/truyen/\$slug/index.tsx
git commit -m "feat(frontend/seo): Book JSON-LD + meta on story detail"
```

---

## Task 12: Integrate `<SEO>` — chapter route with hybrid robots

**Files:**
- Modify: `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx`

- [ ] **Step 1: Inspect the chapter route**

```bash
cat apps/frontend/src/routes/truyen/\$slug/chuong/\$index.tsx | head -60
```

Identify: where the chapter index param is read, where story metadata is fetched.

- [ ] **Step 2: Add `<SEO>` with hybrid robots + Article + Breadcrumb**

```tsx
import { SEO } from '@/components/seo/SEO';
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
} from '@/components/seo/builders';

// where the story + chapter data resolve:
const chapterNumber = Number.parseInt(params.index, 10);
const robots: 'index' | 'noindex, follow' = chapterNumber <= 3 ? 'index' : 'noindex, follow';
const canonical = `/truyen/${story.slug}/chuong/${params.index}`;

const ld =
  chapterNumber <= 3
    ? [
        buildArticleSchema(story, {
          index: params.index,
          title: chapter.title,
          content: chapter.contentText ?? '',
        }),
        buildBreadcrumbSchema([
          { name: 'Trang chủ', url: '/' },
          { name: story.title, url: `/truyen/${story.slug}` },
          { name: `Chương ${params.index}` },
        ]),
      ]
    : undefined;

<SEO
  title={`${story.title} - Chương ${params.index}: ${chapter.title} | SManga`}
  description={`Đọc chương ${params.index} truyện ${story.title} của ${story.author ?? 'Khuyết danh'} miễn phí tại SManga.`}
  canonical={canonical}
  robots={robots}
  ogType="article"
  ogImage={story.hasCover ? `/api/v1/cover/${story.id}` : undefined}
  jsonLd={ld}
/>
```

(Field names — `chapter.contentText`, `params.index`, etc. — must match what the existing chapter route already uses. Read the file first; adapt.)

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @smanga/frontend typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/routes/truyen/\$slug/chuong/\$index.tsx
git commit -m "feat(frontend/seo): chapter route with hybrid robots (1-3 index, 4+ noindex) + Article/Breadcrumb"
```

---

## Task 13: Integrate `<SEO robots="noindex">` — auth + library + admin

**Files:**
- Modify: `apps/frontend/src/routes/dang-nhap.tsx`
- Modify: `apps/frontend/src/routes/dang-ky.tsx`
- Modify: `apps/frontend/src/routes/tu-sach.tsx`
- Modify: `apps/frontend/src/routes/tai-khoan.tsx`
- Modify: `apps/frontend/src/routes/ban.tsx`
- Modify: `apps/frontend/src/routes/admin/route.tsx`

- [ ] **Step 1: For each route file, add `<SEO>` at top of return with `robots="noindex"`**

Pattern (same for each, only `title`/`canonical` change):

```tsx
import { SEO } from '@/components/seo/SEO';

// inside component return, before existing content:
<SEO
  title="Đăng nhập | SManga"           // change per route
  description=""
  canonical="/dang-nhap"                  // change per route
  robots="noindex"
/>
```

Apply with these titles + canonicals:

| File | Title | Canonical |
|---|---|---|
| `dang-nhap.tsx` | "Đăng nhập \| SManga" | `/dang-nhap` |
| `dang-ky.tsx` | "Đăng ký \| SManga" | `/dang-ky` |
| `tu-sach.tsx` | "Tủ sách \| SManga" | `/tu-sach` |
| `tai-khoan.tsx` | "Tài khoản \| SManga" | `/tai-khoan` |
| `ban.tsx` | "Bạn \| SManga" | `/ban` |
| `admin/route.tsx` (layout) | "Admin \| SManga" | `/admin` |

For `admin/route.tsx`, the `<SEO>` goes in the layout root so every admin child route inherits `noindex` automatically — saves repeating in every admin/*.tsx.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @smanga/frontend typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/routes/dang-nhap.tsx apps/frontend/src/routes/dang-ky.tsx apps/frontend/src/routes/tu-sach.tsx apps/frontend/src/routes/tai-khoan.tsx apps/frontend/src/routes/ban.tsx apps/frontend/src/routes/admin/route.tsx
git commit -m "feat(frontend/seo): noindex auth + library + admin routes"
```

---

## Task 14: Playwright MCP verification

**Files:** None modified. Verification only.

- [ ] **Step 1: Ensure dev API + frontend are running**

```bash
# API:
pnpm dev:api  # in one terminal, with env vars set as in Task 3 Step 5

# Frontend:
pnpm dev:frontend  # in another terminal
```

Confirm both up:

```bash
curl -sf -o /dev/null -w "API: %{http_code}\n" http://localhost:3001/api/v1/sources
curl -sf -o /dev/null -w "FE:  %{http_code}\n" http://localhost:3000/
```

Expected: `API: 200` (or 401/403 — anything but 0), `FE: 200`.

- [ ] **Step 2: Sitemap + robots smoke (Bash + curl)**

```bash
curl -s -o /tmp/sitemap.xml -w "HTTP %{http_code}\n" http://localhost:3001/sitemap.xml
head -5 /tmp/sitemap.xml
curl -s -o /tmp/robots.txt -w "HTTP %{http_code}\n" http://localhost:3001/robots.txt
cat /tmp/robots.txt
```

Expected: `HTTP 200`, sitemap XML with `<sitemapindex>`, robots.txt with `Sitemap:` line.

- [ ] **Step 3: Playwright — verify story page head**

Use the Playwright MCP browser tools:

1. `mcp__playwright__browser_navigate` to `http://localhost:3000/truyen/<existing-slug>` (pick a slug from local seed — `pnpm db:seed` or query DB).
2. `mcp__playwright__browser_take_screenshot` — keep for evidence.
3. `mcp__playwright__browser_evaluate` with this expression:
   ```js
   ({
     title: document.title,
     description: document.querySelector('meta[name="description"]')?.content,
     canonical: document.querySelector('link[rel="canonical"]')?.href,
     robots: document.querySelector('meta[name="robots"]')?.content,
     jsonLd: JSON.parse(
       document.querySelector('script[type="application/ld+json"]')?.textContent || '{}'
     ),
   })
   ```
4. Verify:
   - `title` contains story name
   - `description` is non-empty + ≤ 200 chars
   - `canonical` is `https://smanga.shop/truyen/<slug>`
   - `robots` is `index`
   - `jsonLd['@type']` is `Book`
   - `jsonLd.name` is the story title

- [ ] **Step 4: Playwright — verify chapter 1 (indexed) vs chapter 5 (noindex)**

1. Navigate to `http://localhost:3000/truyen/<slug>/chuong/1` — `browser_evaluate` → confirm `robots === 'index'`, JSON-LD has `Article` and `BreadcrumbList`.
2. Navigate to `http://localhost:3000/truyen/<slug>/chuong/5` (find a story with ≥ 5 chapters) — `browser_evaluate` → confirm `robots === 'noindex, follow'`, no JSON-LD script.

- [ ] **Step 5: Playwright — verify admin noindex**

1. Navigate to `http://localhost:3000/dang-nhap`.
2. Login as admin (use `admin@test.com` / `adminpassword` per CLAUDE.md).
3. Navigate to `http://localhost:3000/admin`.
4. `browser_evaluate` → `document.querySelector('meta[name="robots"]')?.content` should be `noindex`.

- [ ] **Step 6: Capture screenshots into a "verification" message back to the user**

Summarize: sitemap response, story page tags, chapter 1 vs chapter 5 robots, admin noindex. The brainstorming spec § Manual Verification lists each thing to confirm.

- [ ] **Step 7: Done — no commit, this is verification only**

The user reviews the Playwright output + decides when to push.

---

## Self-review checklist (run before declaring plan complete)

After writing this plan I checked it against the spec:

**Spec coverage:**

- ✅ Per-route head tags → Tasks 8, 10-13
- ✅ Robots hybrid (chapter 1-3 index, 4+ noindex) → Task 12
- ✅ Sitemap index + stories + chapters → Tasks 2-4
- ✅ JSON-LD Book + Article + Breadcrumb + WebSite → Tasks 7, 10-12
- ✅ Canonical URL → Tasks 7, 8 (absoluteUrl + SEO component)
- ✅ robots.txt with disallows + sitemap link → Tasks 2-4
- ✅ Backend updatedAt fix → Task 1
- ✅ NestJS prefix exclude + Caddyfile @seo → Tasks 3, 5
- ✅ react-helmet-async + HelmetProvider → Task 6
- ✅ OG default image → Task 9
- ✅ Edge cases (rating=0, author=null, description empty) → Task 7 builders test cases
- ✅ Playwright verification → Task 14

**Placeholder scan:** No "TBD/TODO/handle edge cases/implement later" found.

**Type consistency:** `StoryForBook` / `StoryForArticle` interfaces are defined in builders.ts and re-used in tests + integration tasks. `<SEO>` props type is consistent across consumers.

**Risk acknowledgment:**

1. **react-helmet-async + React 19 compat** — Task 6 includes a `pnpm.overrides` fallback if peer-dep complains. If even that fails (rare), the alternative is `@unhead/react` which would require ~30 min rewrite of `<SEO>` to use its API.
2. **NestJS string-array exclude** — Task 3 Step 4 includes the `RequestMethod` verbose fallback if the simple form is rejected.
3. **Caddyfile ordering** — Task 5 explicitly states `@seo` must come BEFORE `/api/*`.
