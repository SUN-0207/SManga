# Perf Phase 2 — Sitemap Rescue + Edge Cache + Abuse Bounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `sitemap-chapters.xml` ingestible by Google (shard ≤10k URLs/file, build once + cache, stable ETags so GSC gets 304s), put `Cache-Control` on public reader JSON + chapter content so Cloudflare can edge-cache it, and close the two anonymous DoS levers (uncapped `?limit=`, unthrottled login bcrypt) — without bricking the site behind the Cloudflare tunnel.

**Architecture:** The sitemap moves from "rebuild a 23MB string from a full chapter-table scan per request" to a story-driven `LEFT JOIN LATERAL` query, sharded into ≤10k-URL files, built once into an in-process cache keyed by `MAX(story.updated_at)` (1h TTL backstop) with version-derived ETags. Public JSON gets static `s-maxage` headers; a Cloudflare dashboard Cache Rule (operator runbook) makes them effective at the edge. Login is throttled by real client IP (`CF-Connecting-IP`) on that one route — NOT a global guard, because there is no `trust proxy` and the tunnel collapses all IPs.

**Tech Stack:** NestJS 11 + `@nestjs/throttler`, Drizzle (raw `sql`), Postgres, Express (`compression`/`helmet`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-performance-remediation-design.md` §4 — read it first. Phase 1 (DB core) already shipped. Phases 3-4 are later plans.

---

## Running tests (authoritative)

| Package | Command |
|---|---|
| `@smanga/api` | `pnpm --filter @smanga/api exec vitest run src/modules/<...>/<file>` (collection ~20s) |
| `@smanga/api` typecheck | `pnpm --filter @smanga/api typecheck` |
| all | `pnpm test` |

**Pre-commit hook** (lefthook): `biome check` on staged files + full-monorepo `pnpm typecheck`. Before each commit: `pnpm exec biome check --write <changed files>`, re-stage. Never `--no-verify`; never `git add -A` (commit only listed paths); never push without explicit user instruction.

**Verification dev note:** the SEO + public JSON routes are public (no auth). The dev API runs on `PORT=3010`. Several steps boot the api and curl it; do that yourself (controller), not in a subagent.

---

## Deviations from spec §4 (and why)

- **§4.4 "bind ThrottlerGuard via APP_GUARD globally"** → REVISED to a **route-scoped login throttle keyed by `CF-Connecting-IP`**. `main.ts` sets no `trust proxy`, and prod is behind `cloudflared → caddy → api`, so `req.ip` is the tunnel/caddy IP — identical for ALL clients. A global guard keyed by `req.ip` would throttle the entire site to one shared 120/min bucket. The genuine lever the audit found is unthrottled login bcrypt; throttling just that route by the real client IP (CF's `CF-Connecting-IP` header, always present at the origin) fixes it with zero site-wide risk. No `@SkipThrottle` needed since nothing else is guarded.
- Everything else in §4 is implemented as specced.

---

## File structure

| File | Change |
|---|---|
| `apps/api/src/modules/chapters/chapters.controller.ts` | `@Header` cache-control on the public chapter-content route |
| `apps/api/src/modules/stories/stories.controller.ts` | `@Header` cache-control on `list` / `getBySlug` / `chaptersBySlug` |
| `apps/api/src/modules/stories/dto/list-stories.dto.ts` | `@Max(100)` on `limit` |
| `apps/api/src/modules/stories/stories.service.ts` | clamp `pageSize` ≤200 in `chapterListBySlug` |
| `apps/api/src/common/guards/real-ip-throttler.guard.ts` | **new** — throttler keyed by `CF-Connecting-IP` |
| `apps/api/src/modules/auth/auth.controller.ts` | `@UseGuards` + `@Throttle` on `login` |
| `apps/api/src/modules/seo/seo.service.ts` | LATERAL chapter query, shard + build-once cache, version/ETag |
| `apps/api/src/modules/seo/seo.service.spec.ts` | **new** — shard/index/cache unit tests |
| `apps/api/src/modules/seo/seo.controller.ts` | sharded routes + 304 (If-None-Match) |
| `apps/api/src/main.ts` | add shard route to `setGlobalPrefix` exclude |
| `deploy/CLOUDFLARE-CACHE-RULES.md` | **new** — operator runbook (no code path) |

---

## Task 1: Cache-Control headers on public reader JSON + chapter content

**Files:**
- Modify: `apps/api/src/modules/stories/stories.controller.ts` (imports + 3 routes)
- Modify: `apps/api/src/modules/chapters/chapters.controller.ts` (imports + 1 route)

- [ ] **Step 1: stories controller headers**

In `apps/api/src/modules/stories/stories.controller.ts`, add `Header` to the `@nestjs/common` import (it currently imports `Body, Controller, Get, Param, Patch, Post, Query, UseGuards`):

```typescript
import { Body, Controller, Get, Header, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
```

Add `@Header(...)` to the three public read routes. `list` (line 18-19) becomes:

```typescript
  @Get()
  @Header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  list(@Query() q: ListStoriesDto) {
```

`getBySlug` (line 47-48) becomes:

```typescript
  @Get('by-slug/:slug')
  @Header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  getBySlug(@Param('slug') slug: string) {
```

`chaptersBySlug` (line 52-53) becomes:

```typescript
  @Get('by-slug/:slug/chapters')
  @Header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  chaptersBySlug(
```

Do NOT add headers to `count`/`counts`/`storage-stats`/`:id`/`:id/chapters` (admin or cookie-bearing; the CF rule bypasses cookie'd requests anyway). `s-maxage` only affects shared caches, so logged-in browsers are unaffected — but the CF rule (Task 6) gates edge caching on no-cookie regardless.

- [ ] **Step 2: chapter content header (immutable once crawled)**

In `apps/api/src/modules/chapters/chapters.controller.ts`, add `Header` to the import:

```typescript
import { Body, Controller, Get, Header, Param, Post, UseGuards } from '@nestjs/common';
```

`get` (line 13-14) becomes:

```typescript
  @Get('by-slug/:slug/:index')
  @Header('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600')
  get(@Param('slug') slug: string, @Param('index') index: string) {
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @smanga/api typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/stories/stories.controller.ts apps/api/src/modules/chapters/chapters.controller.ts
git commit -m "perf(api): Cache-Control on public reader JSON + chapter content"
```

---

## Task 2: Payload caps (limit @Max + pageSize clamp)

**Files:**
- Modify: `apps/api/src/modules/stories/dto/list-stories.dto.ts`
- Modify: `apps/api/src/modules/stories/stories.service.ts` (`chapterListBySlug`, lines 451-472)

- [ ] **Step 1: Cap `limit` in the DTO**

In `list-stories.dto.ts`, add `Max` to the `class-validator` import (currently `IsBoolean, IsIn, IsInt, IsOptional, IsString, Min`):

```typescript
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
```

and add `@Max(100)` to the `limit` field (lines 11-15):

```typescript
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 48;
```

(`ValidationPipe` with `transform:true` is already global in `main.ts`, so `?limit=100000` now 400s instead of returning 38k rows.)

- [ ] **Step 2: Clamp `pageSize` in `chapterListBySlug`**

Replace `chapterListBySlug` (lines 451-472) — clamp to a 1..200 `size` and use it everywhere `pageSize` was used:

```typescript
  async chapterListBySlug(slug: string, page = 1, pageSize = 50) {
    const size = Math.min(Math.max(pageSize, 1), 200);
    const [s] = await this.db
      .select({ id: story.id })
      .from(story)
      .where(eq(story.slug, slug))
      .limit(1);
    if (!s) throw new NotFoundException();
    const totalRows = await this.db
      .select({ value: count() })
      .from(chapter)
      .where(eq(chapter.storyId, s.id));
    const total = totalRows[0]?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const items = await this.db
      .select({ index: chapter.index, title: chapter.title, status: chapter.status })
      .from(chapter)
      .where(eq(chapter.storyId, s.id))
      .orderBy(asc(chapter.index))
      .limit(size)
      .offset((page - 1) * size);
    return { items, page, totalPages, total };
  }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @smanga/api typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/stories/dto/list-stories.dto.ts apps/api/src/modules/stories/stories.service.ts
git commit -m "perf(api): cap stories limit at 100 and clamp chapter pageSize at 200"
```

---

## Task 3: Login throttle keyed by real client IP

**Files:**
- Create: `apps/api/src/common/guards/real-ip-throttler.guard.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts` (imports + the `login` route)
- Test: `apps/api/src/common/guards/real-ip-throttler.guard.spec.ts` (Create)

`ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])` is already registered globally in `app.module.ts`; this task only adds a route-scoped guard.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/guards/real-ip-throttler.guard.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { RealIpThrottlerGuard } from './real-ip-throttler.guard';

// getTracker is protected; cast to reach it in the test.
function tracker(req: unknown): Promise<string> {
  const g = Object.create(RealIpThrottlerGuard.prototype) as {
    getTracker: (r: unknown) => Promise<string>;
  };
  return g.getTracker(req);
}

describe('RealIpThrottlerGuard.getTracker', () => {
  it('prefers CF-Connecting-IP (the real client behind the tunnel)', async () => {
    expect(await tracker({ headers: { 'cf-connecting-ip': '203.0.113.7' }, ip: '172.18.0.5' })).toBe(
      '203.0.113.7',
    );
  });

  it('falls back to req.ip when CF header is absent (local dev)', async () => {
    expect(await tracker({ headers: {}, ip: '127.0.0.1' })).toBe('127.0.0.1');
  });

  it('returns a stable string even if both are missing', async () => {
    expect(await tracker({ headers: {} })).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smanga/api exec vitest run src/common/guards/real-ip-throttler.guard.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the guard**

Create `apps/api/src/common/guards/real-ip-throttler.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Throttler keyed by the REAL client IP. Prod is behind cloudflared -> caddy,
 * and main.ts sets no `trust proxy`, so req.ip is the tunnel IP (shared by
 * every visitor). Cloudflare always sets CF-Connecting-IP at the origin, so we
 * key on that and fall back to req.ip for local dev. Used route-scoped (e.g.
 * on /auth/login) — never as a global guard, which would share one bucket.
 */
@Injectable()
export class RealIpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: { headers?: Record<string, unknown>; ip?: string }): Promise<string> {
    const cf = req.headers?.['cf-connecting-ip'];
    const ip = (typeof cf === 'string' && cf) || req.ip || 'unknown';
    return Promise.resolve(ip);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @smanga/api exec vitest run src/common/guards/real-ip-throttler.guard.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Apply to the login route**

In `apps/api/src/modules/auth/auth.controller.ts`, add to the `@nestjs/common` import the `UseGuards` (already imported) and add `Throttle`/guard imports:

```typescript
import { Throttle } from '@nestjs/throttler';
import { RealIpThrottlerGuard } from '@/common/guards/real-ip-throttler.guard';
```

Decorate the `login` route (line 38-40) — add the two decorators above `async login`:

```typescript
  @Post('login')
  @HttpCode(200)
  @UseGuards(RealIpThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
```

(`UseGuards` is already in the auth.controller import list. `@Throttle` with 5/min/IP: a brute-forcer gets 429 after 5 tries/min while bcrypt stops burning CPU.)

- [ ] **Step 6: Typecheck + the guard test**

Run: `pnpm --filter @smanga/api typecheck` → PASS.
Run: `pnpm --filter @smanga/api exec vitest run src/common/guards/real-ip-throttler.guard.spec.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common/guards/real-ip-throttler.guard.ts apps/api/src/common/guards/real-ip-throttler.guard.spec.ts apps/api/src/modules/auth/auth.controller.ts
git commit -m "perf(api): throttle login by real client IP (CF-Connecting-IP), 5/min"
```

---

## Task 4: Sitemap service — LATERAL query, sharding, build-once cache

**Files:**
- Modify: `apps/api/src/modules/seo/seo.service.ts`
- Test: `apps/api/src/modules/seo/seo.service.spec.ts` (Create)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/seo/seo.service.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { SeoService } from './seo.service';

// db.execute is called as: currentVersion, listStories, listChapters (in rebuild order).
function mockDb(version: string, storyRows: unknown[], chapterRows: unknown[]) {
  const execute = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ v: version }] }) // currentVersion
    .mockResolvedValueOnce({ rows: storyRows }) // listStoriesForSitemap
    .mockResolvedValueOnce({ rows: chapterRows }); // listChaptersForSitemap
  return { db: { execute } as never, execute };
}

function chapterRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    slug: `s${i}`,
    index: '1',
    updated_at: '2026-06-01T00:00:00.000Z',
  }));
}

describe('SeoService sitemap sharding + cache', () => {
  it('shards chapters at 10k/file and lists each shard in the index', async () => {
    // 25,001 chapter URLs -> 3 shards (10k, 10k, 5k001)
    const { db } = mockDb('2026-06-11T10:00:00.000Z', [{ slug: 'a', updated_at: '2026-06-01T00:00:00.000Z' }], chapterRows(25_001));
    const svc = new SeoService(db);

    const index = await svc.getSitemap('index');
    expect(index).not.toBeNull();
    expect(index?.body).toContain('/sitemap-chapters-1.xml');
    expect(index?.body).toContain('/sitemap-chapters-3.xml');
    expect(index?.body).not.toContain('/sitemap-chapters-4.xml');
    expect(index?.body).toContain('/sitemap-stories.xml');

    const shard3 = await svc.getSitemap('chapters-3');
    expect(shard3?.body.match(/<url>/g)?.length).toBe(5_001);
    const shard1 = await svc.getSitemap('chapters-1');
    expect(shard1?.body.match(/<url>/g)?.length).toBe(10_000);
    expect(await svc.getSitemap('chapters-4')).toBeNull();
  });

  it('always exposes chapters-1 even with zero chapters', async () => {
    const { db } = mockDb('2026-06-11T10:00:00.000Z', [], []);
    const svc = new SeoService(db);
    const shard1 = await svc.getSitemap('chapters-1');
    expect(shard1).not.toBeNull();
    expect(shard1?.body).toContain('<urlset');
    expect((await svc.getSitemap('index'))?.body).toContain('/sitemap-chapters-1.xml');
  });

  it('builds once: a second getSitemap within TTL makes no new db calls', async () => {
    const { db, execute } = mockDb('2026-06-11T10:00:00.000Z', [], chapterRows(1));
    const svc = new SeoService(db);
    await svc.getSitemap('index');
    const callsAfterBuild = execute.mock.calls.length; // 3 (version + stories + chapters)
    await svc.getSitemap('stories');
    await svc.getSitemap('chapters-1');
    expect(execute.mock.calls.length).toBe(callsAfterBuild);
  });

  it('derives a stable ETag from the version (304-friendly)', async () => {
    const { db } = mockDb('2026-06-11T10:00:00.000Z', [], chapterRows(1));
    const svc = new SeoService(db);
    const a = await svc.getSitemap('stories');
    const b = await svc.getSitemap('stories');
    expect(a?.etag).toBe(b?.etag);
    expect(a?.etag).toMatch(/^"[0-9a-f]{40}"$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smanga/api exec vitest run src/modules/seo/seo.service.spec.ts`
Expected: FAIL — `svc.getSitemap is not a function`.

- [ ] **Step 3: Rework the service**

Edit `apps/api/src/modules/seo/seo.service.ts`. Add at the top, after the existing imports:

```typescript
import { createHash } from 'node:crypto';
```

After the `escapeXml` function (before the `@Injectable()` class), add:

```typescript
const SHARD_SIZE = 10_000; // sitemap protocol caps a file at 50k URLs; 10k keeps each file small + fast.
const SITEMAP_TTL_MS = 60 * 60_000; // 1h staleness cap; ETag stays stable across rebuilds while version is unchanged.

export interface SitemapEntry {
  body: string;
  etag: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
```

Inside the class, after the constructor, add the cache state + the public/private cache methods:

```typescript
  private cache: Map<string, SitemapEntry> | null = null;
  private cacheExpiresAt = 0;

  /**
   * Cached sitemap for `key` ('index' | 'stories' | 'chapters-<n>'), or null
   * if the key doesn't exist (e.g. an out-of-range shard). Rebuilds the whole
   * set once per TTL; ETags are derived from MAX(story.updated_at) so GSC gets
   * 304s while nothing changed.
   */
  async getSitemap(key: string): Promise<SitemapEntry | null> {
    const now = Date.now();
    if (!this.cache || this.cacheExpiresAt <= now) {
      const version = await this.currentVersion();
      await this.rebuild(version);
      this.cacheExpiresAt = now + SITEMAP_TTL_MS;
    }
    return this.cache?.get(key) ?? null;
  }

  private async currentVersion(): Promise<string> {
    const r = await this.db.execute<{ v: string | null }>(sql`
      SELECT MAX(updated_at) AS v FROM story WHERE discovery_status = 'complete'
    `);
    const v = rowsOf<{ v: string | null }>(r)[0]?.v;
    return v ? new Date(v).toISOString() : 'empty';
  }

  private async rebuild(version: string): Promise<void> {
    const stories = await this.listStoriesForSitemap();
    const chapters = await this.listChaptersForSitemap();
    const shards = chunk(chapters, SHARD_SIZE);
    const shardCount = Math.max(shards.length, 1); // always advertise at least chapters-1
    const cache = new Map<string, SitemapEntry>();
    const put = (key: string, body: string) =>
      cache.set(key, { body, etag: `"${createHash('sha1').update(`${version}:${key}`).digest('hex')}"` });

    put('stories', this.buildSitemapStoriesXml(stories));
    for (let i = 0; i < shardCount; i++) {
      put(`chapters-${i + 1}`, this.buildSitemapChaptersXml(shards[i] ?? []));
    }
    put('index', this.buildSitemapIndexXml(version === 'empty' ? new Date(0).toISOString() : version, shardCount));

    this.cache = cache;
  }
```

Replace `listChaptersForSitemap` (lines 43-63) with the story-driven LATERAL version (probes `chapter_story_index_uniq` per story instead of scanning the whole chapter table; same chapter set + URL format as before):

```typescript
  // First 3 chapters per story via a per-story lateral probe (no full chapter
  // scan). Joined on discovery_status='complete' so we never advertise
  // chapters whose parent is still a stub. URL index format preserved as the
  // integer text (e.g. "1") to match the reader's /chuong/:index route.
  async listChaptersForSitemap(): Promise<
    Array<{ slug: string; chapterIndex: string; updatedAt: string }>
  > {
    const r = await this.db.execute<{
      slug: string;
      index: string;
      updated_at: string;
    }>(sql`
      SELECT s.slug, (sub.index::int)::text AS index,
             COALESCE(sub.crawled_at, s.updated_at) AS updated_at
      FROM story s
      JOIN LATERAL (
        SELECT ch.index, ch.crawled_at
        FROM chapter ch
        WHERE ch.story_id = s.id AND ch.index IN (1, 2, 3)
        ORDER BY ch.index ASC
      ) sub ON true
      WHERE s.discovery_status = 'complete'
      ORDER BY s.updated_at DESC, s.slug, sub.index ASC
    `);
    return rowsOf<{ slug: string; index: string; updated_at: string }>(r).map((row) => ({
      slug: row.slug,
      chapterIndex: row.index,
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }
```

Replace `buildSitemapIndexXml` (lines 65-78) to take a shard count and list every shard:

```typescript
  buildSitemapIndexXml(lastmod: string, chapterShardCount: number): string {
    const shardEntries = Array.from(
      { length: chapterShardCount },
      (_, i) =>
        `  <sitemap>\n    <loc>${BASE}/sitemap-chapters-${i + 1}.xml</loc>\n    <lastmod>${escapeXml(lastmod)}</lastmod>\n  </sitemap>`,
    ).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${BASE}/sitemap-stories.xml</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
  </sitemap>
${shardEntries}
</sitemapindex>
`;
  }
```

(Leave `buildSitemapStoriesXml`, `buildSitemapChaptersXml`, `buildRobotsTxt`, and `listStoriesForSitemap` unchanged — the build methods are reused by `rebuild`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @smanga/api exec vitest run src/modules/seo/seo.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @smanga/api typecheck`
Expected: PASS. (The controller still calls the old method names until Task 5 — typecheck may flag `buildSitemapIndexXml`'s new arity in the controller. If so, that's expected; Task 5 fixes the controller. To keep this commit's hook green, do Task 5's controller edit in the SAME working session before committing — see Task 5 note. If you must commit Task 4 alone, the controller's `buildSitemapIndexXml(new Date().toISOString())` call will be a typecheck error; therefore commit Tasks 4 and 5 together OR stub the controller call now. Cleanest: proceed to Task 5 and commit them as one unit.)**Commit Task 4 together with Task 5** (the service signature change and its only caller must land together for the full-monorepo typecheck hook to pass).

---

## Task 5: Sitemap controller — sharded routes + 304, and the main.ts exclude fix

**Files:**
- Modify: `apps/api/src/modules/seo/seo.controller.ts`
- Modify: `apps/api/src/main.ts` (`setGlobalPrefix` exclude)

- [ ] **Step 1: Rewrite the controller**

Replace the entire `apps/api/src/modules/seo/seo.controller.ts` with:

```typescript
import { Controller, Get, Param, Req, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { SeoService } from './seo.service';

const CACHE_24H = 'public, max-age=86400, stale-while-revalidate=3600';
const XML = 'application/xml; charset=utf-8';

@ApiTags('seo')
// VERSION_NEUTRAL + main.ts setGlobalPrefix exclude keep these at the root
// (/sitemap.xml, not /api/v1/sitemap.xml) as crawlers expect.
@Controller({ version: VERSION_NEUTRAL })
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get('sitemap.xml')
  sitemapIndex(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.serve(req, res, 'index');
  }

  @Get('sitemap-stories.xml')
  sitemapStories(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.serve(req, res, 'stories');
  }

  // Sharded chapter sitemaps (the index lists each). chapters-1 doubles as the
  // backcompat target for the old monolithic /sitemap-chapters.xml URL.
  @Get('sitemap-chapters-:n.xml')
  sitemapChapterShard(
    @Param('n') n: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const num = Number(n);
    if (!Number.isInteger(num) || num < 1) {
      res.status(404).send('not found');
      return Promise.resolve();
    }
    return this.serve(req, res, `chapters-${num}`);
  }

  @Get('sitemap-chapters.xml')
  sitemapChaptersLegacy(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.serve(req, res, 'chapters-1');
  }

  @Get('robots.txt')
  robots(@Res() res: Response): void {
    const body = this.seo.buildRobotsTxt();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', CACHE_24H);
    res.send(body);
  }

  private async serve(req: Request, res: Response, key: string): Promise<void> {
    const entry = await this.seo.getSitemap(key);
    if (!entry) {
      res.status(404).send('not found');
      return;
    }
    res.setHeader('Content-Type', XML);
    res.setHeader('Cache-Control', CACHE_24H);
    res.setHeader('ETag', entry.etag);
    if (req.headers['if-none-match'] === entry.etag) {
      res.status(304).end();
      return;
    }
    res.send(entry.body);
  }
}
```

- [ ] **Step 2: Add the shard route to the global-prefix exclude**

In `apps/api/src/main.ts`, the `setGlobalPrefix` exclude (line 32-34) currently lists the 4 static SEO paths. Add the param shard route so it stays at root (not `/api/sitemap-chapters-1.xml`):

```typescript
  app.setGlobalPrefix('api', {
    exclude: [
      'sitemap.xml',
      'sitemap-stories.xml',
      'sitemap-chapters.xml',
      'sitemap-chapters-:n.xml',
      'robots.txt',
    ],
  });
```

- [ ] **Step 3: Typecheck + service tests**

Run: `pnpm --filter @smanga/api typecheck` → PASS (controller now matches the new service signatures).
Run: `pnpm --filter @smanga/api exec vitest run src/modules/seo/seo.service.spec.ts` → PASS.

- [ ] **Step 4: Boot + verify routes are at root and 304 works (controller does this on dev :3010)**

Boot the api on dev (`PORT=3010`, dev DATABASE_URL/REDIS_URL). Then:

```powershell
# index lists shards (at ROOT, not /api):
curl.exe -s "http://localhost:3010/sitemap.xml" | head -20
# a shard is at root and is small:
curl.exe -s -o /dev/null -w "shard1: %{http_code} size=%{size_download}B\n" "http://localhost:3010/sitemap-chapters-1.xml"
# NOT under /api:
curl.exe -s -o /dev/null -w "api-prefixed (want 404): %{http_code}\n" "http://localhost:3010/api/v1/sitemap-chapters-1.xml"
# 304 on matching ETag:
ETAG=$(curl.exe -s -I "http://localhost:3010/sitemap-stories.xml" | tr -d '\r' | awk -F': ' 'tolower($1)=="etag"{print $2}')
curl.exe -s -o /dev/null -w "if-none-match: %{http_code} (want 304)\n" -H "If-None-Match: $ETAG" "http://localhost:3010/sitemap-stories.xml"
# out-of-range shard 404s:
curl.exe -s -o /dev/null -w "shard 999 (want 404): %{http_code}\n" "http://localhost:3010/sitemap-chapters-999.xml"
```
Expected: `sitemap.xml` lists `/sitemap-chapters-1.xml`; shard1 is at root with 200 + a modest size; the `/api/v1/...` variant is 404 (route is root-only — confirms the exclude worked); If-None-Match returns 304; shard 999 returns 404.

If the `/api/v1/sitemap-chapters-1.xml` returns 200 (i.e. the param-route exclude did NOT take effect), the exclude needs a different form — fall back to registering the route as `sitemap-chapters(.*).xml` style or add an explicit `RequestMethod`-qualified exclude; re-verify until the shard is root-only.

- [ ] **Step 5: Commit (Tasks 4 + 5 together)**

```bash
git add apps/api/src/modules/seo/seo.service.ts apps/api/src/modules/seo/seo.service.spec.ts apps/api/src/modules/seo/seo.controller.ts apps/api/src/main.ts
git commit -m "perf(api): shard + cache sitemaps (lateral query, <=10k/file, 304 ETags)"
```

---

## Task 6: Cloudflare Cache Rules operator runbook

**Files:**
- Create: `deploy/CLOUDFLARE-CACHE-RULES.md`

This is a documentation/runbook task — no code path. The Cache Rules can only be created in the Cloudflare dashboard (no repo/API automation here), so the deliverable is an exact click-by-click runbook the operator follows once.

- [ ] **Step 1: Write the runbook**

Create `deploy/CLOUDFLARE-CACHE-RULES.md`:

```markdown
# Cloudflare Cache Rules — smanga.shop (operator runbook)

The `s-maxage` headers shipped in Phase 2 are inert at the edge until these
Cache Rules exist: Cloudflare only edge-caches by default based on file
extension, so extensionless `/api/v1/cover/:id` and `.xml` sitemaps were
measured as `Cf-Cache-Status: DYNAMIC` (every request hit the laptop through
the ~50KB/s tunnel). Create these once in the dashboard.

**Where:** Cloudflare dashboard → select `smanga.shop` → Caching → Cache Rules
→ Create rule. Create them in this order (first match wins, so the bypass is
last):

1. **Covers — cache 1 year**
   - When incoming requests match: `URI Path` `starts with` `/api/v1/cover/`
   - Then: Eligible for cache; Edge TTL: Override to `1 year`; Browser TTL: respect origin.

2. **Sitemaps — cache 24h**
   - `URI Path` `matches regex` `^/sitemap.*\.xml$`
   - Then: Eligible for cache; Edge TTL: Override to `1 day`.

3. **Public reader JSON (no cookie) — respect origin s-maxage**
   - `URI Path` `starts with` `/api/v1/stories` OR `starts with` `/api/v1/chapters/by-slug`
     OR `starts with` `/api/v1/rankings` OR `starts with` `/api/v1/search`
   - AND `Cookie` `does not contain` `jwt`
   - Then: Eligible for cache; Edge TTL: respect origin (uses the `s-maxage`
     the API now sends). The no-`jwt`-cookie condition keeps logged-in/admin
     responses out of the shared edge cache.

4. **Rest of the API — bypass**
   - `URI Path` `starts with` `/api/`
   - Then: Bypass cache.

**Verify (after saving):**
```
curl -sI https://smanga.shop/api/v1/cover/<any-story-id> | grep -i cf-cache-status   # 2nd call -> HIT
curl -sI https://smanga.shop/sitemap-chapters-1.xml      | grep -i cf-cache-status   # 2nd call -> HIT
curl -sI "https://smanga.shop/api/v1/stories?limit=24"   | grep -i cf-cache-status   # 2nd anon call -> HIT
curl -sI "https://smanga.shop/api/v1/stories?limit=24" -H "Cookie: jwt=x" | grep -i cf-cache-status  # -> DYNAMIC/BYPASS
```

**GSC:** after deploy, in Google Search Console → Sitemaps, remove the old
failing `sitemap-chapters.xml` submission and (re)submit `sitemap.xml` — it now
lists the sharded `sitemap-chapters-N.xml` files (each ≤10k URLs, well under
the 50k protocol cap), so GSC can finally ingest the chapter URLs.
```

- [ ] **Step 2: Commit**

```bash
git add deploy/CLOUDFLARE-CACHE-RULES.md
git commit -m "docs(deploy): Cloudflare Cache Rules runbook for edge caching covers/sitemaps/JSON"
```

---

## Task 7: Verify end-to-end + finish

- [ ] **Step 1: Full suite**

Run: `pnpm test`
Expected: all packages green (api gains the seo.service spec (4) + real-ip guard spec (3); 142 → ~149 total).

- [ ] **Step 2: Live verify on dev (api :3010)**

- Sitemap: `/sitemap.xml` lists `sitemap-stories.xml` + `sitemap-chapters-N.xml`; each shard is at root (not `/api`), ≤10k `<url>` entries; a repeat fetch with the returned `If-None-Match` ETag returns **304** (and logs show no rebuild — the in-memory cache served it).
- Headers: `curl -sI http://localhost:3010/api/v1/stories?limit=24` shows `Cache-Control: public, s-maxage=300, ...`; chapter content shows `s-maxage=86400`.
- Abuse: `curl "http://localhost:3010/api/v1/stories?limit=100000"` returns **400** (validation); POST `/auth/login` 6× fast from the same IP returns **429** on the 6th (send a `CF-Connecting-IP` header to simulate; locally without it, it keys on 127.0.0.1).

- [ ] **Step 3: Finish + deploy + measure**

Use `superpowers:finishing-a-development-branch` (commit-only; push only on the user's say-so — push auto-deploys via CI→Watchtower). **Then the operator must do Task 6's dashboard Cache Rules + GSC resubmit** (code deploy alone does not create CF rules). After push + Watchtower swap + CF rules, measure:

```powershell
# sitemap now fetchable fast + small per shard (was ~10min/23MB monolith):
curl.exe -s -o /dev/null -w "sitemap.xml  : %{http_code} total=%{time_total}s\n" "https://smanga.shop/sitemap.xml"
curl.exe -s -o /dev/null -w "chapters-1   : %{http_code} total=%{time_total}s size=%{size_download}B\n" "https://smanga.shop/sitemap-chapters-1.xml"
# edge cache HIT on repeat:
curl.exe -s -I "https://smanga.shop/sitemap-chapters-1.xml" | tr -d '\r' | grep -i cf-cache-status
curl.exe -s -I "https://smanga.shop/api/v1/cover/$(curl.exe -s 'https://smanga.shop/api/v1/stories?limit=1' | node -e "console.log(JSON.parse(require('fs').readFileSync(0))[0].id)")" | tr -d '\r' | grep -i cf-cache-status
```
Record the deltas against spec §1 (sitemap was 4.37s TTFB / 60s+ for 1.9MB of 23MB; covers/JSON were `DYNAMIC`). These gate Phase 3 planning.

---

## Self-review (author's checklist — completed)

**Spec coverage (§4):** §4.1 shard + LATERAL → Task 4; §4.2 build-once cache keyed by MAX(updated_at) + ETag → Task 4; §4.3 cache headers on public JSON + chapter content → Task 1; §4.4 throttling (revised — see Deviations) + limit/pageSize caps → Tasks 2-3; §4.5 CF Cache Rules runbook + GSC resubmit → Task 6. Verification (sitemap fetchable, edge HIT, 304, 400/429) → Tasks 5+7. No gaps.

**Placeholder scan:** every code step has full code; `<any-story-id>` / `<n>` in the runbook are operator-supplied runtime values, not code placeholders.

**Type consistency:** `getSitemap(key): Promise<SitemapEntry | null>` and `SitemapEntry {body, etag}` are defined in Task 4 and consumed identically in Task 5's `serve()`. `buildSitemapIndexXml(lastmod, chapterShardCount)` new 2-arg signature (Task 4) matches its only caller `rebuild` (Task 4) — the controller no longer calls it directly (Task 5 calls `getSitemap('index')`), which is why Tasks 4+5 commit together. `listChaptersForSitemap` keeps its return shape `{slug, chapterIndex, updatedAt}` (consumed by the unchanged `buildSitemapChaptersXml`). `RealIpThrottlerGuard` (Task 3) is referenced by the same path in the auth controller. Cache key strings (`'index'`, `'stories'`, `'chapters-<n>'`) match between service `rebuild`/`getSitemap` and controller `serve` calls.
```
