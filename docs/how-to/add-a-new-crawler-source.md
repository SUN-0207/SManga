# How to add a new crawler source

This guide walks through implementing a second source adapter (e.g. `truyentang`) from
scratch, wiring it into the registry, writing fixture-driven parser tests, and making
the API serve it.

Related docs:
- Architecture: [`docs/architecture/05-building-blocks.md`](../architecture/05-building-blocks.md)
- Business logic: [`docs/business-logic/crawling-and-discovery.md`](../business-logic/crawling-and-discovery.md)
- Local dev & ops: [`docs/operations.md`](../operations.md)

---

## 1. Understand the contract

Every source implements the `SourceAdapter` interface defined in
`packages/shared/src/adapter.ts`.  All parser methods receive **HTML strings**,
not URLs — the engine handles HTTP fetching, rate-limiting, and retries.

```ts
interface SourceAdapter {
  // Identity
  readonly id: string;           // unique slug, e.g. 'truyentang'
  readonly name: string;         // display label, e.g. 'TruyenTang'
  readonly baseUrl: string;      // canonical origin
  readonly hostnames: string[];  // all hostnames the registry routes to this adapter
  readonly requiresJs: boolean;  // true only if the page needs a JS engine
  readonly rateLimit: { rps: number };  // token-bucket rate, default 1

  // Per-story
  parseStoryFromUrl(url: string, html: string): Promise<StoryMetadata>;
  listChapters(html: string): Promise<{ chapters: ChapterRef[]; hasNextPage: boolean }>;
  fetchChapterContent(html: string): Promise<ChapterContent>;
  buildListChaptersUrl(storyUrl: string, page: number): string;

  // Catalog browsing (required)
  readonly catalogFeeds: readonly CatalogFeed[];
  buildCatalogUrl(feedId: string, page: number): string;
  parseCatalogPage(html: string, feedId: string, page: number): Promise<CatalogPage>;

  // Search (optional)
  buildSearchUrl?(query: string, page: number): string;
  parseSearchPage?(html: string, query: string, page: number): Promise<SearchPage>;
}
```

Key Zod types (also in `packages/shared/src/adapter.ts`):

| Type | Notable fields |
|---|---|
| `StoryMetadata` | `externalId`, `title`, `author`, `description`, `coverUrl`, `genres`, `status` |
| `ChapterRef` | `index` (number), `title`, `externalId`, `externalUrl` |
| `ChapterContent` | `title`, `text` |
| `CatalogFeed` | `id`, `label`, `kind` (`newest`/`hot`/`completed`/`genre`/`author`) |
| `CatalogPage` | `items: StoryListItem[]`, `page`, `hasNextPage` |

---

## 2. Create the source folder

```
packages/crawler/src/sources/<id>/
├── index.ts          ← exports a const implementing SourceAdapter
├── parsers.ts        ← pure HTML-in → domain-type-out parser functions
└── __fixtures__/
    ├── README.md     ← capture date + source URLs for each fixture
    ├── story.html
    ├── chapter-list.html
    ├── chapter.html
    └── catalog-newest-page1.html
```

Use `<id>` as a lowercase slug without spaces (e.g. `truyentang`).

### 2a. Capture fixtures

Navigate a real story in the browser and save the raw HTML for each fixture file.
Document them in `__fixtures__/README.md` (see the truyenfull example at
`packages/crawler/src/sources/truyenfull/__fixtures__/README.md`):

```markdown
# truyentang fixtures

Captured: YYYY-MM-DD

Story: <title> (<status>, N chapters, genres: …)

| File | Source URL |
|------|------------|
| story.html              | https://truyentang.example/truyen/<slug>/ |
| chapter-list.html       | https://truyentang.example/truyen/<slug>/trang-2/ |
| chapter.html            | https://truyentang.example/truyen/<slug>/chuong-1/ |
| catalog-newest-page1.html | https://truyentang.example/danh-sach/truyen-moi/ |
```

Re-capture when the live site changes and tests break.

---

## 3. Write the parsers

`parsers.ts` exports pure functions that take an HTML string and return the
domain type (or throw `ParserError` from `@smanga/shared`).

```ts
// packages/crawler/src/sources/truyentang/parsers.ts
import { ParserError, type StoryMetadata, type ChapterContent,
         type ChapterRef, type CatalogPage } from '@smanga/shared';
import * as cheerio from 'cheerio';

export function parseStoryHtml(html: string, url: string): StoryMetadata {
  const $ = cheerio.load(html);
  const title = $('h1.story-title').first().text().trim();
  if (!title) throw new ParserError('could not locate story title');
  // ... extract author, description, coverUrl, genres, status, externalId
  return { externalId, title, author, description, coverUrl, genres, status };
}

export function parseChapterListHtml(html: string, storyUrl: string)
    : { chapters: ChapterRef[]; hasNextPage: boolean } {
  // NOTE: derive chapter index from the URL slug (e.g. /chuong-42/), NOT from
  // the title text — title text is not reliably numeric. See the truyenfull
  // parser at packages/crawler/src/sources/truyenfull/parsers.ts for the
  // slugRe = /chuong-(\d+(?:-\d+)?)/i pattern.
  // NOTE: detect hasNextPage via a "next" glyph/link, NOT via href.includes('/trang-')
  // — previous-page links also contain '/trang-' and trigger false positives.
}

export function parseChapterContentHtml(html: string): ChapterContent {
  // chapter title: use the source's specific selector (e.g. 'a.chapter-title')
  // content: remove script/style/ins/iframe then extract text with \n\n between blocks
  // throw ParserError('chapter content empty after parse') when nothing is found
}

export function parseCatalogListingHtml(html: string, baseUrl: string, page: number)
    : CatalogPage {
  // items array + hasNextPage + page
}
```

**Truyenfull-specific quirks to be aware of (do not copy blindly):**
- `externalId` = the first path segment of the story URL, extracted by `extractSlug(url)`.
- Chapter index extracted from the URL slug `/chuong-N/` using
  `/chuong-(\d+(?:-\d+)?)/i`, converted with `Number(m[1].replace('-', '.'))`.
- `hasNextPage` detected via `.glyphicon-menu-right` icon or Vietnamese text `sau`/`tiếp`,
  not by `/trang-N/` substring.
- Chapter title selector is `a.chapter-title`, not `.chapter-title`.

These are source-specific; inspect the HTML of your new source and match its DOM.

---

## 4. Wire the adapter in `index.ts`

```ts
// packages/crawler/src/sources/truyentang/index.ts
import type { CatalogFeed, SourceAdapter } from '@smanga/shared';
import { parseCatalogListingHtml, parseChapterContentHtml,
         parseChapterListHtml, parseStoryHtml } from './parsers.ts';
// ↑ Use .ts extension here (inside the sources/ folder) — see CLAUDE.md §1

const BASE = 'https://truyentang.example';

const CATALOG_FEEDS: readonly CatalogFeed[] = [
  { id: 'newest', label: 'Mới cập nhật', kind: 'newest' },
  { id: 'hot',    label: 'Truyện hot',   kind: 'hot' },
];

export const truyentangAdapter: SourceAdapter = {
  id: 'truyentang',
  name: 'TruyenTang',
  baseUrl: BASE,
  hostnames: ['truyentang.example'],
  requiresJs: false,
  rateLimit: { rps: 1 },          // 1 request/s default; lower only if the source 503s

  catalogFeeds: CATALOG_FEEDS,

  async parseStoryFromUrl(url, html) { return parseStoryHtml(html, url); },
  async listChapters(html)           { return parseChapterListHtml(html, `${BASE}/`); },
  async fetchChapterContent(html)    { return parseChapterContentHtml(html); },
  buildListChaptersUrl(storyUrl, page) {
    if (page <= 1) return storyUrl;
    // build the paginated URL for your source
  },
  buildCatalogUrl(feedId, page) { /* … */ },
  async parseCatalogPage(html, feedId, page) {
    return parseCatalogListingHtml(html, BASE, page);
  },
};
```

---

## 5. Register the adapter

Open `packages/crawler/src/index.ts` and add one `registerAdapter` call:

```ts
// packages/crawler/src/index.ts  (current content shown for context)
import { registerAdapter } from './registry.ts';
import { truyenfullAdapter } from './sources/truyenfull/index.ts';
import { truyentangAdapter } from './sources/truyentang/index.ts';  // ← add

registerAdapter(truyenfullAdapter);
registerAdapter(truyentangAdapter);                                  // ← add

export * from './registry.ts';
export * from './fetcher.ts';
export * from './engine.ts';
export { truyenfullAdapter, truyentangAdapter };                     // ← add export
```

The `registerAdapter` function (`packages/crawler/src/registry.ts`) stores the
adapter by `id` and indexes all entries in `hostnames` so the engine can route
a URL to the right adapter with `resolveAdapterForUrl(url)`.

---

## 6. Write fixture-driven parser tests

Create `packages/crawler/tests/truyentang-parsers.test.ts` following the same
pattern as `packages/crawler/tests/truyenfull-parsers.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseCatalogListingHtml,
  parseChapterContentHtml,
  parseChapterListHtml,
  parseStoryHtml,
} from '../src/sources/truyentang/parsers.js';
// ↑ Tests import via .js extension (standard ESM), not .ts

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', 'src', 'sources', 'truyentang', '__fixtures__',
);

const storyHtml         = readFileSync(join(fixturesDir, 'story.html'),                 'utf-8');
const chapterListHtml   = readFileSync(join(fixturesDir, 'chapter-list.html'),           'utf-8');
const chapterHtml       = readFileSync(join(fixturesDir, 'chapter.html'),               'utf-8');
const catalogNewestHtml = readFileSync(join(fixturesDir, 'catalog-newest-page1.html'),  'utf-8');

describe('truyentang parseStoryHtml', () => {
  it('extracts non-empty title', () => {
    const md = parseStoryHtml(storyHtml, 'https://truyentang.example/<slug>/');
    expect(md.title.length).toBeGreaterThan(0);
  });
  it('extracts externalId from the URL slug', () => {
    const md = parseStoryHtml(storyHtml, 'https://truyentang.example/example-slug/');
    expect(md.externalId).toBe('example-slug');
  });
  // … add genre, cover, status, etc. assertions
});

describe('truyentang parseChapterContentHtml', () => {
  it('extracts non-empty text', () => {
    const c = parseChapterContentHtml(chapterHtml);
    expect(c.text.length).toBeGreaterThan(100);
  });
  it('emits \\n\\n between adjacent paragraphs', () => {
    const html = '<div id="chapter-c"><p>A.</p><p>B.</p></div>';
    const result = parseChapterContentHtml(html);
    expect(result.text.split('\n\n')).toHaveLength(2);
  });
});
// … chapter list + catalog tests
```

Run all crawler tests:

```powershell
pnpm --filter @smanga/crawler test
```

---

## 7. Surface the source in the API

The NestJS API (`apps/api`) loads the crawler package which self-registers adapters
on import. No API code changes are needed for the engine to use the new adapter.

To allow operators to create a **source record** in the database and kick off a
browse/discover workflow, add a row via the API or psql:

```sql
INSERT INTO source (id, name, base_url)
VALUES ('truyentang', 'TruyenTang', 'https://truyentang.example')
ON CONFLICT DO NOTHING;
```

The `sources` module (`apps/api/src/modules/sources/`) exposes
`POST /api/v1/sources` for this (admin-only).  Once the source row exists, the
admin UI's catalog-browse panel will include it in the source dropdown.

---

## 8. Checklist

- [ ] `packages/crawler/src/sources/<id>/parsers.ts` — all four parser functions implemented
- [ ] `packages/crawler/src/sources/<id>/index.ts` — `SourceAdapter` exported
- [ ] `packages/crawler/src/sources/<id>/__fixtures__/README.md` + HTML files captured
- [ ] `packages/crawler/src/index.ts` — `registerAdapter` call added
- [ ] `packages/crawler/tests/<id>-parsers.test.ts` — fixture-driven tests pass
- [ ] `pnpm --filter @smanga/crawler test` — green
- [ ] `pnpm typecheck` — green
- [ ] Source row inserted in the database
