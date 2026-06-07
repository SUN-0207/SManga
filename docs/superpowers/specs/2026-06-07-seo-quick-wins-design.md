# SEO Quick Wins — Design Spec

> **Status:** Draft (2026-06-07). Phases verbally approved in brainstorming; awaiting written-doc review before invoking `superpowers:writing-plans`.
>
> **Scope:** Head tags + sitemap + JSON-LD for Google indexing. SPA stays. No SSR. ~1-2 days work.

## Goal

Get SManga's public story catalog properly indexed by Google so organic search can drive growth. Today every route shares the static `index.html` head (one title, one description, no structured data, no sitemap) — Google sees the SPA but has zero per-page context.

## Non-goals (explicit)

- **No social link previews.** Zalo / Facebook / Slack bots don't execute JS; with SPA-only they'll keep showing the homepage title for every story link. Accepted tradeoff.
- **No SSR / SSG migration.** SPA stays.
- **No Cốc Cốc, Bing, or other search engine optimization** beyond what overlaps with Google.
- **No Core Web Vitals work** (LCP / CLS / INP). Performance is a separate task.
- **No i18n.** Vietnamese only.
- **No Google Search Console dashboard setup** (user task; spec just emits the verification meta tag when a token is configured).

## Audience and channels

- Target: Vietnamese readers searching Google for novel titles, authors, genres, or chapter titles.
- Production at `https://smanga.shop` via Cloudflare Tunnel → Caddy → frontend nginx / NestJS API.

## Crawl budget strategy

The catalog has ~159k chapter URLs across ~1k stories (production scale). At ~10 chapters/story indexed per day, Googlebot would take weeks to discover them all, and high-frequency story pages (the value-bearing ones) would re-crawl slowly.

**Hybrid indexing:**

- Story pages (`/truyen/:slug`) — index, full meta + JSON-LD `Book`, in sitemap.
- Chapter 1, 2, 3 of each story — index, full meta + JSON-LD `Article`, in sitemap.
- Chapter 4+ — `robots: noindex, follow`. Googlebot still crawls (so it can hit chapter→chapter `<link rel="next">` for completeness), but the page stays out of the index. Not in sitemap.
- Home, /kham-pha, /bang-xep-hang — index, in sitemap.
- /tim-kiem (legacy redirect to /kham-pha), /dang-nhap, /dang-ky, /tu-sach, /tai-khoan, /ban, /admin/\* — `robots: noindex`, blocked in `robots.txt` for defense in depth.

Result: sitemap holds ~1k story URLs + ~3k chapter URLs ≈ ~4k URLs. Comfortably under Google's 50k-per-sitemap limit, but the design still uses a sitemap index format so growth past that doesn't need refactoring.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Frontend (Vite SPA + react-helmet-async)                │
│                                                          │
│ Each public route:                                       │
│   <SEO title= description= canonical=                    │
│         robots= jsonLd= ogImage= />                      │
│         │                                                │
│         │ react-helmet-async writes into <head>          │
│         ▼                                                │
│   index.html shell (static fallback for crawlers that    │
│   ignore JS-mutated head — kept minimal)                 │
│                                                          │
│ Admin / auth / search routes → robots="noindex"          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Backend (NestJS) — new SeoModule                        │
│                                                          │
│ GET /sitemap.xml         → sitemap index (refs 2 below) │
│ GET /sitemap-stories.xml → ~1k story URLs               │
│ GET /sitemap-chapters.xml→ chapter 1-3 of each (~3k)    │
│ GET /robots.txt          → policy + sitemap link        │
│                                                          │
│ NestJS main.ts:                                         │
│   setGlobalPrefix('api', { exclude: [                   │
│     'sitemap.xml', 'sitemap-stories.xml',               │
│     'sitemap-chapters.xml', 'robots.txt'                │
│   ] })                                                   │
│                                                          │
│ Cache-Control: public, max-age=86400,                   │
│                stale-while-revalidate=3600              │
│ ETag on body — Cloudflare edge absorbs the load         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Caddy (laptop, deploy/home/Caddyfile)                   │
│                                                          │
│   @seo path /sitemap*.xml /robots.txt                   │
│   handle @seo { reverse_proxy api:3001 }                │
│                                                          │
│   handle /api/* { reverse_proxy api:3001 }              │
│   handle        { reverse_proxy frontend:80 }           │
└─────────────────────────────────────────────────────────┘
```

## Components

### 1. `<SEO>` React component

Path: `apps/frontend/src/components/seo/SEO.tsx`

```tsx
interface SEOProps {
  title: string;
  description: string;
  canonical: string;          // absolute or path; component normalizes to absolute
  robots?: 'index' | 'noindex' | 'noindex, follow';
  jsonLd?: object | object[]; // serialized to <script type="application/ld+json">
  ogImage?: string;           // path or absolute
}
```

Internally wraps `react-helmet-async`'s `<Helmet>`:

- `<title>{title}</title>`
- `<meta name="description" content={description}>`
- `<meta name="robots" content={robots ?? 'index'}>`
- `<link rel="canonical" href={absoluteUrl(canonical)}>`
- `<meta property="og:title" content={title}>`
- `<meta property="og:description" content={description}>`
- `<meta property="og:url" content={absoluteUrl(canonical)}>`
- `<meta property="og:image" content={absoluteUrl(ogImage ?? '/og-default.png')}>`
- `<meta property="og:type" content="website">` (book route overrides to `book`)
- `<meta name="twitter:card" content="summary_large_image">`
- `<script type="application/ld+json">{JSON.stringify(jsonLd)}</script>` (if present)

App root wraps everything in `<HelmetProvider>` (added to `apps/frontend/src/main.tsx`).

### 2. SEO data helpers

Path: `apps/frontend/src/components/seo/builders.ts`

- `buildBookSchema(story)` — Book JSON-LD from StoryDetail.
- `buildArticleSchema(story, chapter)` — Article JSON-LD for chapter pages.
- `buildBreadcrumbSchema(items)` — BreadcrumbList JSON-LD.
- `buildWebSiteSchema()` — homepage WebSite + SearchAction.
- `stripAndTruncate(text, max=160)` — safe truncate at word boundary. Description is plain text per DB schema; still defensive-trim and escape control chars.
- `absoluteUrl(pathOrUrl)` — prepends `https://smanga.shop` when path starts with `/`.

Pure functions, no React, fully unit-testable.

### 3. Per-route SEO data

| Route | Title | Description | robots | JSON-LD |
|---|---|---|---|---|
| `/` | "SManga — Đọc truyện chữ Việt online miễn phí" | "Thư viện truyện chữ Việt biên tập như tạp chí — ngôn tình, tiên hiệp, huyền huyễn... đọc online không quảng cáo." | index | `WebSite` + SearchAction |
| `/truyen/$slug` | `${title} - ${author ?? 'Khuyết danh'} \| SManga` | First 160 chars of `description`; if empty, `"Đọc ${title} - ${author} miễn phí tại SManga."` | index | `Book` |
| `/truyen/$slug/chuong/$index` where `index <= 3` | `${storyTitle} - Chương ${index}: ${chapterTitle} \| SManga` | `"Đọc chương ${index} truyện ${storyTitle} của tác giả ${author} miễn phí tại SManga."` | index | `Article` + `BreadcrumbList` |
| `/truyen/$slug/chuong/$index` where `index > 3` | (same template) | (same template) | **noindex, follow** | (none) |
| `/kham-pha` | "Khám phá truyện chữ \| SManga" | "Khám phá truyện theo thể loại: ngôn tình, tiên hiệp, huyền huyễn, kiếm hiệp..." | index | `CollectionPage` |
| `/bang-xep-hang` | "Bảng xếp hạng truyện hot \| SManga" | "Truyện hot tuần, xem nhiều nhất, rating cao nhất trong tuần — cập nhật mỗi ngày." | index | `ItemList` (top 20 of active tab) |
| `/tim-kiem` | (redirects before render) | — | — | — |
| `/dang-nhap`, `/dang-ky` | "Đăng nhập \| SManga" / "Đăng ký \| SManga" | (skipped) | noindex | — |
| `/tu-sach`, `/tai-khoan`, `/ban` | (default per page) | (skipped) | noindex | — |
| `/admin/*` | (default) | (skipped) | noindex | — |

### 4. JSON-LD schema details

**Book (story detail):**

```json
{
  "@context": "https://schema.org",
  "@type": "Book",
  "name": "<story.title>",
  "alternativeHeadline": "<author> · <genres[0].name>",
  "author": { "@type": "Person", "name": "<author or 'Khuyết danh'>" },
  "url": "https://smanga.shop/truyen/<slug>",
  "image": "https://smanga.shop/api/v1/cover/<id>",
  "inLanguage": "vi",
  "numberOfPages": <totalChapters>,
  "genre": ["<genre.name>", ...],
  "bookFormat": "https://schema.org/EBook",
  "isAccessibleForFree": true,
  "dateModified": "<story.updatedAt>",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": <ratingAvg>,
    "ratingCount": <ratingCount>,
    "bestRating": 5,
    "worstRating": 1
  }
}
```

`aggregateRating` is omitted entirely when `ratingCount === 0` (Google rejects rich results with zero-count ratings).

**Article (chapter 1-3 only):**

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Chương <n>: <chapterTitle>",
  "articleBody": "<first 500 chars of chapter content, plaintext>",
  "inLanguage": "vi",
  "isPartOf": {
    "@type": "Book",
    "name": "<storyTitle>",
    "url": "https://smanga.shop/truyen/<slug>"
  },
  "author": { "@type": "Person", "name": "<author>" },
  "datePublished": "<story.discoveredAt>",
  "dateModified": "<story.updatedAt>"
}
```

**BreadcrumbList (chapter pages):**

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": "https://smanga.shop/" },
    { "@type": "ListItem", "position": 2, "name": "<storyTitle>", "item": "https://smanga.shop/truyen/<slug>" },
    { "@type": "ListItem", "position": 3, "name": "Chương <n>" }
  ]
}
```

### 5. NestJS SeoController + SeoModule

Path: `apps/api/src/modules/seo/`

```
seo.module.ts
seo.controller.ts        // @Controller() (no path) — relies on prefix exclude
seo.service.ts           // SQL + XML builders
```

Service queries:

- `listStoriesForSitemap()` → `SELECT slug, updated_at FROM story WHERE discovery_status = 'complete' ORDER BY updated_at DESC`
- `listChaptersForSitemap()` → first 3 chapters per story:
  ```sql
  SELECT s.slug, c.index, c.updated_at
  FROM chapter c JOIN story s ON s.id = c.story_id
  WHERE c.index IN ('1','2','3') AND s.discovery_status = 'complete'
  ORDER BY s.updated_at DESC
  ```

Controller endpoints:

- `GET /sitemap.xml` — sitemap index referencing the two below
- `GET /sitemap-stories.xml` — `<urlset>` of story URLs with `<lastmod>` = `updated_at`
- `GET /sitemap-chapters.xml` — `<urlset>` of chapter 1-3 URLs
- `GET /robots.txt` — see policy below

All responses:

- `Content-Type: application/xml` (or `text/plain` for robots.txt)
- `Cache-Control: public, max-age=86400, stale-while-revalidate=3600`
- `ETag` on body (sha1 of generated XML)

### 6. main.ts prefix exclusion

```typescript
app.setGlobalPrefix('api', {
  exclude: [
    'sitemap.xml',
    'sitemap-stories.xml',
    'sitemap-chapters.xml',
    'robots.txt',
  ],
});
```

### 7. Caddyfile addition

```
@seo path /sitemap*.xml /robots.txt
handle @seo { reverse_proxy api:3001 }
```

Placed BEFORE the existing `handle /api/*` and default `handle` blocks.

### 8. robots.txt content

```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /dang-nhap
Disallow: /dang-ky
Disallow: /tim-kiem
Disallow: /tu-sach
Disallow: /tai-khoan
Disallow: /ban

Sitemap: https://smanga.shop/sitemap.xml
```

### 9. Backend data fix: getBySlug missing `updatedAt`

The current `getBySlug` SQL in `stories.service.ts` selects everything except `s.updated_at`. Need it for JSON-LD `dateModified`.

Change:

- Add `s.updated_at` to the SELECT list.
- Add `updatedAt` to the mapped response object.
- `StoryDetail` interface in `apps/frontend/src/api/stories.ts` already extends `StorySummary` which has `updatedAt`, so no FE type change.

## Data flow

```
Story detail route mounts
  │
  ▼
useQuery(`/stories/by-slug/${slug}`) → StoryDetail
  │
  ▼
Build SEO props (pure, derived from StoryDetail):
  title = `${story.title} - ${story.author ?? 'Khuyết danh'} | SManga`
  description = stripAndTruncate(story.description, 160) || fallback
  canonical = `/truyen/${story.slug}`
  jsonLd = buildBookSchema(story)
  ogImage = story.hasCover ? `/api/v1/cover/${story.id}` : '/og-default.png'
  │
  ▼
<SEO {...props}/> — react-helmet-async writes to <head>
```

Same shape for chapter route: builds `Article` + `BreadcrumbList`, picks `robots` based on `index <= 3`.

## OG default image

A static fallback at `apps/frontend/public/og-default.png` (1200×630, on-brand pink-zinc with "SManga — Đọc truyện chữ Việt"). Used when a story has no cover. Created once as part of this task.

## Edge cases

| Case | Behavior |
|---|---|
| `description` empty/null | Fallback to `"Đọc ${title} - ${author} miễn phí tại SManga."` |
| `author` null | "Khuyết danh" |
| `ratingCount === 0` | Omit `aggregateRating` entirely (Google rejects ratings with zero count) |
| `chapter.index > totalChapters` (404) | Render 404 component with `robots: noindex` |
| Cover bytes stale in CDN after edit | Accepted — covers rarely change post-import; 1y immutable cache is the existing tradeoff (CLAUDE.md note 11) |
| URL with query params (`?ref=`, UTM) | Canonical strips query → Google consolidates signal |
| URL with trailing slash | Canonical uses no-trailing variant |
| `story.discoveryStatus !== 'complete'` | Stub stories: still set meta tags but exclude from sitemap (only `complete` stories listed) |
| Chapter title empty | description fallback uses story title only |
| Discovery still running, chapter 1-3 don't exist yet | Sitemap-chapters query naturally returns 0 rows for that story |

## Testing

### Unit tests (`packages/shared` or `apps/frontend/src/components/seo/__tests__`)

- `buildBookSchema` produces valid JSON; omits `aggregateRating` when count = 0.
- `buildArticleSchema` truncates `articleBody` to 500 chars.
- `stripAndTruncate` cuts at word boundary, handles emoji/Vietnamese diacritics.
- `absoluteUrl` handles path / full URL / `//cdn` cases.

### Integration tests (`apps/api/test/seo.e2e-spec.ts`)

- `GET /sitemap.xml` → 200, `application/xml`, valid XML, contains `<sitemapindex>` with two `<sitemap>` children.
- `GET /sitemap-stories.xml` → 200, contains every `complete`-status story slug from seed.
- `GET /sitemap-chapters.xml` → 200, contains exactly N×3 chapter URLs (where N = complete stories with ≥3 chapters).
- `GET /robots.txt` → 200, `text/plain`, contains `Sitemap:` line.
- Verify endpoints are NOT under `/api/v1/` (test direct path resolution).

### Component tests

- `<SEO title="X" ...>` mounts → `document.title === 'X'`, `<meta name="description">` content matches, JSON-LD `<script>` tag exists and parses.

### Manual verification (post-deploy)

1. **Google Rich Results Test** (`https://search.google.com/test/rich-results`) — paste a story URL, verify Book card preview appears with author + rating.
2. **Google Search Console** — submit sitemap, verify URLs discovered in 24-48h.
3. **`curl https://smanga.shop/sitemap.xml`** — verify XML response (not index.html).
4. **`curl https://smanga.shop/robots.txt`** — verify policy text.
5. **Playwright MCP** — navigate to story page; assert `document.title` contains story title, JSON-LD script element exists and parses to valid Book schema.

## Risks

1. **`react-helmet-async` compat with React 19** — needs verification. If incompatible, fall back to `@unhead/react` (modern alternative with React 19 support).
2. **Crawl-budget hybrid logic** — chapter route must inspect `index <= 3` to choose `robots`. Trivial single condition, low risk.
3. **JSON-LD data drift** — `ratingAvg` cached in React Query stale-while-revalidate may render JSON-LD with slightly outdated rating. Acceptable; eventual consistency.
4. **Sitemap performance at scale** — full-buffer XML generation works at ~4k URLs. If catalog grows past 50k chapter URLs the implementation should switch to streaming `Readable` to avoid OOM. Design accommodates this (sitemap index already in place); switch is a 1-day implementation change later.
5. **NestJS `setGlobalPrefix` exclusion** — version compatibility check: confirm NestJS 11's `exclude` option accepts the literal strings shown (vs needing `RequestMapping`-style objects). Smoke test in dev.
6. **Caddyfile order** — the `@seo` matcher must come BEFORE `handle /api/*` so it wins. Plan must lock this ordering in.

## Out of scope (recap)

- Social link preview for Zalo/FB (no bot user-agent rendering).
- SSR / SSG migration.
- Cốc Cốc / Bing / Yandex.
- Core Web Vitals (LCP / CLS / INP).
- Internationalization.
- Google Search Console dashboard configuration (operator task).
- Analytics integration (Plausible / GA / etc.) — separate concern.
- Pagination of sitemap-chapters (only first 3 per story → small; future-proof via sitemap index format).
- `<link rel="alternate" hreflang>` (Vietnamese only).
