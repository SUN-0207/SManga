# SEO Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-target SManga's title, schema, and on-page surfaces so Google understands the site is a Vietnamese novel reader (not a literary magazine), and so every existing story/chapter URL ranks for its own long-tail keyword.

**Architecture:** Three additive layers, all on the existing Vite + React + NestJS stack — (1) tagline string swap across 3 files, (2) JSON-LD + title/description/internal-link enrichment on existing routes, (3) one verification meta tag + an operator-process doc. No new routes, no DB migration, no new packages.

**Tech Stack:** React 19 + Vite + TanStack Router + `@dr.pogodin/react-helmet` for `<head>` management + NestJS 11 + Drizzle ORM (Postgres) + Vitest (unit) + Playwright MCP (visual verification).

---

## Operating constraints (apply to every task)

- **Commit-only.** Do NOT push. The user runs `git push SManga main` manually after they've eyeballed the diff.
- **Playwright verification before suggesting push.** For any task that changes rendered output, take a Playwright MCP screenshot or DOM assertion as proof — the user has been burned by bad pushes propagating through Watchtower in 5 min.
- **English-only identifiers.** Filenames, component/function/variable/hook names stay English. Vietnamese is OK only inside JSX text children, aria labels, SEO copy strings.
- **Pre-existing dev env quirk.** Local dev API runs on `PORT=3010` (OPSWAT holds `:3001`). Before running Playwright against local: edit `apps/frontend/vite.config.ts` to proxy `/api` → `http://localhost:3010`, run verification, then revert to `:3001` before committing.
- **Container names on prod are `home-*-1`** (docker compose project name "home"), NOT `smanga-*`. Doesn't affect this plan but matters if a task ever needs prod state checks.

## File Structure

Files this plan creates or modifies:

```
apps/frontend/
  index.html                                — Task 1 (title) + Task 10 (verification meta)
  src/components/auth/AuthShell.tsx         — Task 1 (eyebrow strings)
  src/routes/index.tsx                      — Task 1 (hero kicker) + Task 2 (Organization schema wire)
  src/routes/truyen/$slug/index.tsx         — Task 3 (Breadcrumb wire) + Task 5 (title) + Task 6 (description) + Task 8 (rails)
  src/routes/truyen/$slug/chuong/$index.tsx — Task 4 (cleanTitle helper consumer) + Task 5 (title) + Task 6 (description)
  src/components/seo/builders.ts            — Task 2 (Organization builder)
  src/components/seo/builders.spec.ts       — Task 2 (Organization test)
  src/lib/chapter-title.ts (new)            — Task 4 (extract cleanTitle helper)
  src/lib/chapter-title.spec.ts (new)       — Task 4 (helper test)
  src/components/story/SimilarStoriesRail.tsx (new) — Task 8 (rail component)
  src/components/layout/FooterGenreBlock.tsx (new)  — Task 9 (footer genre links)
  src/components/layout/AppShell.tsx        — Task 9 (mount footer block)
  src/api/stories.ts                        — Task 7 (author param + RailStories type)

apps/api/src/modules/stories/
  stories.service.ts                        — Task 7 (author SQL filter)
  stories.controller.ts                     — Task 7 (author query param)

docs/
  operations.md                             — Task 10 (SEO monitoring section)
  seo-baseline-2026-06-09.md (new)          — Task 10 (operator fills after first GSC pull)
```

10 tasks total. Each task ends in one commit. No rebases, no amends.

---

### Task 1: Tagline rebrand (string swap, 3 files)

The current home `<title>` in `index.html` and the AuthShell + home hero kickers all say "Tạp chí truyện chữ Việt", which Google AI Overview classifies as a literary magazine. Swap to the keyword-direct phrasing and drop the magazine word everywhere it appears on rendered surfaces.

**Files:**
- Modify: `apps/frontend/index.html:14`
- Modify: `apps/frontend/src/components/auth/AuthShell.tsx:15`
- Modify: `apps/frontend/src/routes/index.tsx:94`

- [ ] **Step 1: Update index.html title**

Open `apps/frontend/index.html` line 14, change:

```html
<title>SManga — Tạp chí truyện chữ Việt</title>
```

to:

```html
<title>SManga — Đọc truyện chữ Việt online miễn phí</title>
```

- [ ] **Step 2: Update AuthShell eyebrow default**

Open `apps/frontend/src/components/auth/AuthShell.tsx` line 15, change:

```ts
eyebrow = 'TẠP CHÍ TRUYỆN CHỮ VIỆT',
```

to:

```ts
eyebrow = 'ĐỌC TRUYỆN CHỮ VIỆT',
```

The full keyword-rich phrasing lives in titles + meta descriptions; the eyebrow is a compact in-design label that needs to fit a single line at lg breakpoints, so keep it short.

- [ ] **Step 3: Update home hero kicker**

Open `apps/frontend/src/routes/index.tsx` line 94, change:

```tsx
TẠP CHÍ TRUYỆN CHỮ VIỆT
```

to:

```tsx
ĐỌC TRUYỆN CHỮ VIỆT
```

- [ ] **Step 4: Verify build still passes**

```bash
pnpm --filter @smanga/frontend typecheck
```

Expected: no errors (these are pure string changes).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/index.html apps/frontend/src/components/auth/AuthShell.tsx apps/frontend/src/routes/index.tsx
git commit -m "seo(tagline): drop 'Tạp chí' from rendered surfaces

Google AI Overview was classifying 'Tạp chí truyện chữ Việt' as a
literary magazine entity (lined up SManga next to Báo Văn Nghệ / Tạp
chí Văn nghệ Quân đội in branded SERP). Swap the fallback title in
index.html, the AuthShell hero eyebrow, and the home hero kicker to
keyword-direct phrasing. Per docs/superpowers/specs/2026-06-09-seo-
foundation-design.md Section 1."
```

---

### Task 2: Organization schema (builder + home wire)

Google uses the Organization JSON-LD to associate the brand name + logo with a single entity. Without it, "SManga" can get tied to unrelated entities in the Knowledge Graph. Add a builder, test it, and wire it on the home route beside the existing WebSite schema (the SEO component already accepts a `jsonLd` array).

**Files:**
- Modify: `apps/frontend/src/components/seo/builders.ts` (append builder after `buildWebSiteSchema`)
- Modify: `apps/frontend/src/components/seo/builders.spec.ts` (append test)
- Modify: `apps/frontend/src/routes/index.tsx` (import + wire to `jsonLd` prop as array)

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/components/seo/builders.spec.ts`:

```ts
import {
  absoluteUrl,
  buildArticleSchema,
  buildBookSchema,
  buildBreadcrumbSchema,
  buildOrganizationSchema,
  buildWebSiteSchema,
  stripAndTruncate,
} from './builders';

// ...existing describes...

describe('buildOrganizationSchema', () => {
  it('emits Organization with name, url, and logo', () => {
    const schema = buildOrganizationSchema();
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('Organization');
    expect(schema.name).toBe('SManga');
    expect(schema.url).toBe('https://smanga.shop');
    expect(schema.logo).toBe('https://smanga.shop/favicon.svg');
  });

  it('emits sameAs as an array (empty until social accounts exist)', () => {
    const schema = buildOrganizationSchema();
    expect(Array.isArray(schema.sameAs)).toBe(true);
  });
});
```

(Replace the import line at the top of the file — don't duplicate the existing import block; insert `buildOrganizationSchema` alphabetically.)

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @smanga/frontend test src/components/seo/builders.spec.ts
```

Expected: FAIL with `buildOrganizationSchema is not exported` or similar.

- [ ] **Step 3: Implement the builder**

Append to `apps/frontend/src/components/seo/builders.ts` (after the existing `buildWebSiteSchema`):

```ts
export function buildOrganizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'SManga',
    url: BASE,
    logo: `${BASE}/favicon.svg`,
    // Empty until Phase 3 social accounts exist. Emitting now anyway
    // so Google sees the entity shape; population later is additive.
    sameAs: [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @smanga/frontend test src/components/seo/builders.spec.ts
```

Expected: PASS (all `buildOrganizationSchema` cases + prior tests still green).

- [ ] **Step 5: Wire it on the home route**

Open `apps/frontend/src/routes/index.tsx`. Find the import on line 6:

```tsx
import { buildWebSiteSchema } from '@/components/seo/builders';
```

Change to:

```tsx
import { buildOrganizationSchema, buildWebSiteSchema } from '@/components/seo/builders';
```

Find the `<SEO ... jsonLd={buildWebSiteSchema()} />` call near line 36 and change `jsonLd` to an array:

```tsx
jsonLd={[buildWebSiteSchema(), buildOrganizationSchema()]}
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @smanga/frontend typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/seo/builders.ts apps/frontend/src/components/seo/builders.spec.ts apps/frontend/src/routes/index.tsx
git commit -m "seo(schema): add Organization JSON-LD on home

Anchors the SManga brand entity for Google's Knowledge Graph with a
canonical name + URL + logo. sameAs is empty by design — Phase 3 will
populate when social accounts exist. Wired alongside the existing
WebSite schema via the array form of the <SEO> jsonLd prop."
```

---

### Task 3: BreadcrumbList on story detail page

The chapter route already chains `buildArticleSchema + buildBreadcrumbSchema`. The story detail route emits Book but no breadcrumb — Google's SERP loses the breadcrumb display path on these results.

**Files:**
- Modify: `apps/frontend/src/routes/truyen/$slug/index.tsx` (import + wire 2-level breadcrumb)

- [ ] **Step 1: Update the import**

Open `apps/frontend/src/routes/truyen/$slug/index.tsx` line 9, change:

```tsx
import { buildBookSchema, stripAndTruncate } from '@/components/seo/builders';
```

to:

```tsx
import { buildBookSchema, buildBreadcrumbSchema, stripAndTruncate } from '@/components/seo/builders';
```

- [ ] **Step 2: Change the SEO jsonLd prop to an array**

In the same file, find the `<SEO ... jsonLd={buildBookSchema(s)} />` call near line 80. Change to:

```tsx
jsonLd={[
  buildBookSchema(s),
  buildBreadcrumbSchema([
    { name: 'Trang chủ', url: '/' },
    { name: s.title },
  ]),
]}
```

(Two-level breadcrumb: home + current story. The current story is the leaf so it gets no `url`.)

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @smanga/frontend typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/routes/truyen/$slug/index.tsx
git commit -m "seo(schema): add BreadcrumbList on story detail page

Pairs with the existing Book schema. Google can render the breadcrumb
trail in SERP, which lifts CTR. The chapter route already emits
Breadcrumb — this brings the story page to parity."
```

---

### Task 4: Extract cleanTitle helper

The chapter route currently strips the `Chương N:` prefix from `chapter.title` with an inline regex (`apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx:98`). Task 5 will rewrite the chapter `<title>` pattern to put the cleaned title in a different position — both producers should share the same logic so they can't drift apart.

**Files:**
- Create: `apps/frontend/src/lib/chapter-title.ts`
- Create: `apps/frontend/src/lib/chapter-title.spec.ts`
- Modify: `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx` (replace inline regex with helper)

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/lib/chapter-title.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cleanChapterTitle } from './chapter-title';

describe('cleanChapterTitle', () => {
  it('strips "Chương N:" prefix', () => {
    expect(cleanChapterTitle('Chương 12: Hồi sinh')).toBe('Hồi sinh');
  });

  it('strips "Chương N" (no colon)', () => {
    expect(cleanChapterTitle('Chương 12 Hồi sinh')).toBe('Hồi sinh');
  });

  it('handles fractional chapter numbers', () => {
    expect(cleanChapterTitle('Chương 12.5: Ngoại truyện')).toBe('Ngoại truyện');
  });

  it('is case-insensitive on "Chương"', () => {
    expect(cleanChapterTitle('chương 1: Mở đầu')).toBe('Mở đầu');
  });

  it('returns the input unchanged when there is no prefix', () => {
    expect(cleanChapterTitle('Hồi sinh')).toBe('Hồi sinh');
  });

  it('returns empty string when input is just the prefix', () => {
    expect(cleanChapterTitle('Chương 5:')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @smanga/frontend test src/lib/chapter-title.spec.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the helper**

Create `apps/frontend/src/lib/chapter-title.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @smanga/frontend test src/lib/chapter-title.spec.ts
```

Expected: all 6 cases PASS.

- [ ] **Step 5: Replace the inline regex in the chapter route**

Open `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx`. Add the import near the top:

```tsx
import { cleanChapterTitle } from '@/lib/chapter-title';
```

Find line 98 (`const cleanTitle = chapter.title.replace(/^Chương\s*\d+(?:\.\d+)?\s*:?\s*/i, '');`) and change to:

```tsx
const cleanTitle = cleanChapterTitle(chapter.title);
```

- [ ] **Step 6: Typecheck + run tests**

```bash
pnpm --filter @smanga/frontend typecheck
pnpm --filter @smanga/frontend test
```

Expected: no errors, all tests PASS (including the new chapter-title cases).

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/lib/chapter-title.ts apps/frontend/src/lib/chapter-title.spec.ts apps/frontend/src/routes/truyen/\$slug/chuong/\$index.tsx
git commit -m "refactor(chapter): extract cleanChapterTitle helper

Pulls the inline regex out of the chapter route so Task 5's SEO title
rewrite can reuse the same stripping logic. No behavior change — the
chapter route renders the same cleanTitle as before."
```

---

### Task 5: Title pattern rewrite (story + chapter)

Stuff the highest-volume Vietnamese keywords into the `<title>` for each route. Story title now mentions genre + "full". Chapter title puts the cleaned title first so it doesn't get truncated by Google before the operator-meaningful part shows up.

**Files:**
- Modify: `apps/frontend/src/routes/truyen/$slug/index.tsx:72`
- Modify: `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx:174`

- [ ] **Step 1: Update story page title**

Open `apps/frontend/src/routes/truyen/$slug/index.tsx`. Find the `<SEO title={...}>` prop near line 72:

```tsx
title={`${s.title} - ${s.author ?? 'Khuyết danh'} | SManga`}
```

Change to:

```tsx
title={`${s.title} - Đọc truyện ${s.genres?.[0]?.name ?? 'online'} full | SManga`}
```

This swaps the author (which is rarely a search keyword) for `Đọc truyện {Genre} full` — three high-volume keywords. Falls back to literal `online` when the story has no genres (Plan 7 stub imports).

- [ ] **Step 2: Update chapter page title**

Open `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx` line 174. Current:

```tsx
title={`${story.title} - Chương ${index}: ${cleanTitle || chapter.title} | SManga`}
```

Change to:

```tsx
title={`Chương ${index}: ${cleanTitle || chapter.title} | ${story.title} - SManga`}
```

Putting `Chương N: {ChapterTitle}` first means Google's SERP truncation (≈60 chars) chops off `SManga` instead of chopping off the part the reader is actually searching for.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @smanga/frontend typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/routes/truyen/\$slug/index.tsx apps/frontend/src/routes/truyen/\$slug/chuong/\$index.tsx
git commit -m "seo(title): keyword-load story + chapter <title>

Story page swaps author (rarely a search term) for 'Đọc truyện {Genre}
full' — 3 high-volume keywords. Chapter page reorders so the chapter
identity leads, brand trails — Google truncates at ~60 chars and we'd
rather lose 'SManga' than 'Chương N: title'."
```

---

### Task 6: Meta description optimization

Empty or generic meta descriptions hurt SERP CTR. Generate keyword-rich descriptions for both story and chapter routes; never emit empty.

**Files:**
- Modify: `apps/frontend/src/routes/truyen/$slug/index.tsx` (description prop near line 73)
- Modify: `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx` (description prop near line 175)

- [ ] **Step 1: Story description**

In `apps/frontend/src/routes/truyen/$slug/index.tsx`, find the `description` prop near line 73:

```tsx
description={
  stripAndTruncate(s.description, 160) ||
  `Đọc ${s.title} - ${s.author ?? 'Khuyết danh'} miễn phí tại SManga.`
}
```

Change to:

```tsx
description={
  stripAndTruncate(s.description, 160) ||
  `Đọc ${s.title} của ${s.author ?? 'Khuyết danh'} — ${s.totalChapters} chương, cập nhật ${new Date(s.updatedAt).toISOString().slice(0, 10)}. Đọc truyện chữ Việt online miễn phí trên SManga.`
}
```

When the story has a real description (`s.description` non-empty), the existing first branch wins — only the fallback gets the keyword-loaded template. Stories with empty descriptions are rare (Plan 7 stubs) but they were emitting a thin "Đọc X - Y miễn phí" string that contained almost no information.

- [ ] **Step 2: Chapter description**

In `apps/frontend/src/routes/truyen/$slug/chuong/$index.tsx` line 175. Current:

```tsx
description={`Đọc chương ${index} truyện ${story.title} của ${story.author ?? 'Khuyết danh'} miễn phí tại SManga.`}
```

Change to:

```tsx
description={`Đọc Chương ${index}: ${cleanTitle || chapter.title} truyện ${story.title} của ${story.author ?? 'Khuyết danh'} online miễn phí trên SManga.`}
```

Adds the cleaned chapter title to the description — readers searching for a specific chapter title now match.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @smanga/frontend typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/routes/truyen/\$slug/index.tsx apps/frontend/src/routes/truyen/\$slug/chuong/\$index.tsx
git commit -m "seo(description): keyword-load story + chapter meta descriptions

Story fallback (when story has no description) now includes chapter
count + last-updated date + the 'truyện chữ Việt online miễn phí'
keyword string. Chapter description prefixes the cleaned chapter
title so per-chapter searches match."
```

---

### Task 7: Add `author` filter to listStories API

The "Cùng tác giả" rail in Task 8 needs to fetch other stories by the same author. The existing `listStories` endpoint supports a `genre` filter but no `author` filter. Add it parallel to the genre one (same SQL shape, same controller wiring, same FE client shape).

**Files:**
- Modify: `apps/api/src/modules/stories/stories.service.ts` (extend `list` SQL with author filter)
- Modify: `apps/api/src/modules/stories/stories.controller.ts` (accept `author` query param)
- Modify: `apps/frontend/src/api/stories.ts` (add `author` to `listStories` params)

- [ ] **Step 1: Read the existing genre filter pattern**

Open `apps/api/src/modules/stories/stories.service.ts` and find the `list` method (around line 102). Note the `genreSlug` parameter + the `genreJoin` SQL fragment around lines 109-112. The new author filter mirrors this exactly but is a WHERE clause, not a JOIN (author is a column on `story`).

- [ ] **Step 2: Extend the service signature**

In `stories.service.ts`, change the `list` method signature from:

```ts
async list(
  page = 1,
  limit = 48,
  genreSlug?: string,
  featuredOnly?: boolean,
  discoveryStatus?: 'complete' | 'stub',
) {
```

to:

```ts
async list(
  page = 1,
  limit = 48,
  genreSlug?: string,
  featuredOnly?: boolean,
  discoveryStatus?: 'complete' | 'stub',
  author?: string,
) {
```

Append a new SQL fragment near the existing `featuredFilter` / `discoveryFilter` definitions:

```ts
const authorFilter = author ? sql`AND s.author = ${author}` : sql``;
```

Then add `${authorFilter}` to the `WHERE` clause of the main SQL query (find `WHERE 1=1 ${featuredFilter} ${discoveryFilter}` and change to `WHERE 1=1 ${featuredFilter} ${discoveryFilter} ${authorFilter}`).

- [ ] **Step 3: Pass the param through the controller**

Open `apps/api/src/modules/stories/stories.controller.ts`. Find the `@Get()` handler that calls `this.stories.list(...)`. Add an `@Query('author') author?: string` parameter and pass it as the 6th argument to `list()`. Exact location varies — search for `this.stories.list(` and pattern-match the existing query parameters (page, limit, genre, featured, discoveryStatus).

If the handler currently looks like:

```ts
@Get()
async list(
  @Query('page') page?: string,
  @Query('limit') limit?: string,
  @Query('genre') genre?: string,
  @Query('featured') featured?: string,
  @Query('discoveryStatus') discoveryStatus?: 'complete' | 'stub',
) {
  return this.stories.list(
    Number(page) || 1,
    Number(limit) || 48,
    genre,
    featured === 'true',
    discoveryStatus,
  );
}
```

Add `@Query('author') author?: string` to the parameter list and pass `author` as the 6th argument to `this.stories.list(...)`.

- [ ] **Step 4: Extend the FE client**

Open `apps/frontend/src/api/stories.ts`. Find the `listStories` function signature (around line 25). Change:

```ts
export async function listStories(
  page = 1,
  limit = 48,
  genre?: string,
  featured?: boolean,
  discoveryStatus?: 'complete' | 'stub',
): Promise<StorySummary[]> {
  const res = await api.get<StorySummary[]>('/stories', {
    params: {
      page,
      limit,
      ...(genre ? { genre } : {}),
      ...(featured === undefined ? {} : { featured: String(featured) }),
      ...(discoveryStatus ? { discoveryStatus } : {}),
    },
  });
  return res.data;
}
```

to:

```ts
export async function listStories(
  page = 1,
  limit = 48,
  genre?: string,
  featured?: boolean,
  discoveryStatus?: 'complete' | 'stub',
  author?: string,
): Promise<StorySummary[]> {
  const res = await api.get<StorySummary[]>('/stories', {
    params: {
      page,
      limit,
      ...(genre ? { genre } : {}),
      ...(featured === undefined ? {} : { featured: String(featured) }),
      ...(discoveryStatus ? { discoveryStatus } : {}),
      ...(author ? { author } : {}),
    },
  });
  return res.data;
}
```

- [ ] **Step 5: Typecheck both apps**

```bash
pnpm --filter @smanga/api typecheck
pnpm --filter @smanga/frontend typecheck
```

Expected: no errors.

- [ ] **Step 6: Smoke-test the endpoint**

Start dev:api (per CLAUDE.md the user runs `PORT=3010 pnpm dev:api`) and hit:

```bash
curl -sS 'http://localhost:3010/api/v1/stories?author=Thi%C3%AAn%20T%C3%A0m%20Th%E1%BB%95%20%C4%90%E1%BA%ADu&limit=3' | head -c 400
```

Expected: JSON array with up to 3 stories whose `author` field equals "Thiên Tàm Thổ Đậu" (one of them, "Đấu Phá Thương Khung", is in the seed). If the array is empty, double-check the author string against the DB (`docker exec home-postgres-1 psql -U smanga -d smanga -c "SELECT DISTINCT author FROM story LIMIT 20"` — but on local dev that's a local container, not `home-postgres-1`).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/stories/stories.service.ts apps/api/src/modules/stories/stories.controller.ts apps/frontend/src/api/stories.ts
git commit -m "feat(stories): support author filter on listStories

Mirrors the existing genre filter: optional 6th param on the service,
@Query('author') on the controller, optional param on the FE client.
Enables the Task 8 'Cùng tác giả' rail on /truyen/\$slug."
```

---

### Task 8: Author + genre rails on story detail page

Two new rails below the chapter list section, before the existing `<RecommendationSection>`. Each fetches up to 6 related stories via the existing `listStories` API. Suppresses the author rail entirely when the story is anonymous (per spec edge case).

**Files:**
- Create: `apps/frontend/src/components/story/SimilarStoriesRail.tsx`
- Modify: `apps/frontend/src/routes/truyen/$slug/index.tsx` (import + mount)

- [ ] **Step 1: Create the rail component**

Create `apps/frontend/src/components/story/SimilarStoriesRail.tsx`:

```tsx
import { listStories, type StorySummary } from '@/api/stories';
import { StoryCover } from '@/components/ui/StoryCover';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

interface SimilarStoriesRailProps {
  /** Page heading text. e.g. "Cùng tác giả" or "Cùng thể loại". */
  title: string;
  /** Filter type. */
  by: 'author' | 'genre';
  /** The author name or genre slug to filter on. */
  value: string;
  /** Story id to exclude (the page we're currently on). */
  excludeId: string;
}

const LIMIT = 6;

/**
 * Bottom-of-story-page rail showing up to 6 related stories by author
 * or genre. Hides itself silently if the fetch returns 0 stories
 * (e.g. only-story-by-this-author edge case). The grid layout mirrors
 * the home grid card sizing so the bottom of the story page feels
 * consistent with the rest of the site.
 */
export function SimilarStoriesRail({ title, by, value, excludeId }: SimilarStoriesRailProps) {
  const query = useQuery({
    queryKey: ['similar-stories', by, value] as const,
    // listStories signature: (page, limit, genre?, featured?, discoveryStatus?, author?)
    queryFn: () =>
      by === 'author'
        ? listStories(1, LIMIT + 1, undefined, undefined, undefined, value)
        : listStories(1, LIMIT + 1, value),
    staleTime: 10 * 60_000,
  });

  const items: StorySummary[] = (query.data ?? []).filter((s) => s.id !== excludeId).slice(0, LIMIT);

  if (query.isLoading) return null;
  if (items.length === 0) return null;

  return (
    <section className="container py-10 border-t border-border">
      <h2 className="text-heading-lg font-prose font-semibold mb-5">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {items.map((s) => (
          <Link
            key={s.id}
            to="/truyen/$slug"
            params={{ slug: s.slug }}
            search={{ page: 1, commentsPage: 1 }}
            className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
          >
            <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-bg-subtle">
              <StoryCover storyId={s.id} title={s.title} hasCover={s.hasCover} decorative />
            </div>
            <h3 className="mt-2 text-body-sm font-medium line-clamp-2 group-hover:text-accent transition-colors duration-fast">
              {s.title}
            </h3>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

(`LIMIT + 1` and the post-fetch `excludeId` filter handles the case where the current story would be in the result set — we ask for one extra and drop the self-match.)

- [ ] **Step 2: Mount both rails on the story page**

Open `apps/frontend/src/routes/truyen/$slug/index.tsx`. Add the import near the top:

```tsx
import { SimilarStoriesRail } from '@/components/story/SimilarStoriesRail';
```

Find the `<RecommendationSection kind="similar" storyId={s.id} />` call near line 180. Add the two rails above it:

```tsx
{s.author && s.author !== 'Khuyết danh' && (
  <SimilarStoriesRail
    title="Cùng tác giả"
    by="author"
    value={s.author}
    excludeId={s.id}
  />
)}
{s.genres?.[0]?.slug && (
  <SimilarStoriesRail
    title="Cùng thể loại"
    by="genre"
    value={s.genres[0].slug}
    excludeId={s.id}
  />
)}
<RecommendationSection kind="similar" storyId={s.id} />
```

The `s.author && s.author !== 'Khuyết danh'` guard implements the spec edge case: anonymous stories suppress the author rail entirely (would either be empty or link every anonymous story to every other).

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @smanga/frontend typecheck
```

Expected: no errors.

- [ ] **Step 4: Verify locally with Playwright MCP**

Pre-verification: edit `apps/frontend/vite.config.ts` to proxy `/api` to `http://localhost:3010` (existing local-dev quirk). Start `PORT=3010 pnpm dev:api` and `pnpm dev:frontend` in two background terminals.

Then navigate to `http://localhost:3000/truyen/dau-pha-thuong-khung` with Playwright MCP and assert:

```js
() => {
  const h2s = Array.from(document.querySelectorAll('h2')).map(h => h.textContent?.trim());
  return {
    hasCungTacGia: h2s.some(h => h?.includes('Cùng tác giả')),
    hasCungTheLoai: h2s.some(h => h?.includes('Cùng thể loại')),
  };
}
```

Expected: at least one of `hasCungTacGia` / `hasCungTheLoai` is `true` (the Đấu Phá Thương Khung seed has the author Thiên Tàm Thổ Đậu + genres, so both should be true on dev with real data).

After verification, revert vite.config.ts back to `:3001`.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/story/SimilarStoriesRail.tsx apps/frontend/src/routes/truyen/\$slug/index.tsx
git commit -m "feat(story): Cùng tác giả + Cùng thể loại rails

Two related-story rails below the chapter list, before the existing
RecommendationSection. Each fetches 6 stories via listStories (author
or genre filter) and dedupes the current story. Author rail
suppresses when the story is anonymous — spec edge case to avoid
linking every Khuyết danh story to every other."
```

---

### Task 9: Footer genre block on AppShell

Push link equity to genre pages from every site page via the footer. The existing `AppShell` footer is one line ("SManga · Đọc truyện chữ"); replace with a small grid that includes the genre block.

**Files:**
- Create: `apps/frontend/src/components/layout/FooterGenreBlock.tsx`
- Modify: `apps/frontend/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Create the genre block component**

Create `apps/frontend/src/components/layout/FooterGenreBlock.tsx`:

```tsx
import { listGenres } from '@/api/genres';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

const TOP_N = 8;

/**
 * Footer block listing the top-N genres by story count. Renders on
 * every page via AppShell so each indexed page pushes a small amount
 * of link equity to /kham-pha?genre=*. Hides silently if the genre
 * list is empty (Plan 1 cold start) so the footer doesn't render an
 * empty section.
 */
export function FooterGenreBlock() {
  const genresQ = useQuery({
    queryKey: ['genres'],
    queryFn: listGenres,
    staleTime: 60 * 60_000,
  });
  const top = (genresQ.data ?? []).filter((g) => g.storyCount > 0).slice(0, TOP_N);
  if (top.length === 0) return null;

  return (
    <div className="text-body-sm">
      <h4 className="text-label text-fg-muted uppercase mb-3">Khám phá theo thể loại</h4>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 list-none p-0">
        {top.map((g) => (
          <li key={g.slug}>
            <Link
              to="/kham-pha"
              search={{ q: '', page: 1, genre: g.slug }}
              className="text-fg-muted hover:text-fg transition-colors duration-fast"
            >
              {g.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Mount in AppShell footer**

Open `apps/frontend/src/components/layout/AppShell.tsx`. Find the existing footer (around the bottom of the component, currently `<footer className="hidden lg:block border-t border-border py-6 text-body-sm text-fg-muted text-center">SManga · Đọc truyện chữ</footer>`). Replace with:

```tsx
<footer className="hidden lg:block border-t border-border py-8">
  <div className="container space-y-6">
    <FooterGenreBlock />
    <p className="text-body-sm text-fg-muted text-center">SManga · Đọc truyện chữ Việt</p>
  </div>
</footer>
```

Add the import at the top of the file:

```tsx
import { FooterGenreBlock } from './FooterGenreBlock';
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @smanga/frontend typecheck
```

Expected: no errors.

- [ ] **Step 4: Verify locally with Playwright MCP**

After restarting dev:frontend, navigate to `http://localhost:3000/` and assert:

```js
() => {
  const footerLinks = Array.from(document.querySelectorAll('footer a'));
  const hrefs = footerLinks.map(a => a.getAttribute('href'));
  return {
    footerLinkCount: footerLinks.length,
    sampleHrefs: hrefs.slice(0, 5),
  };
}
```

Expected: `footerLinkCount` ≥ 1 (likely 4-8 depending on seeded genre count); `sampleHrefs` contain `/kham-pha?genre=...` URLs.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/layout/FooterGenreBlock.tsx apps/frontend/src/components/layout/AppShell.tsx
git commit -m "feat(layout): footer genre block for site-wide link equity

Replaces the single-line desktop footer with a small grid that lists
the top-8 genres as links to /kham-pha?genre=*. Each indexed page
now pushes a small amount of link equity to genre pages — important
for Phase 2 when /the-loai/\$slug landing pages land."
```

---

### Task 10: GSC verification meta + operator manual + baseline doc

The code piece is a one-line `<meta>` tag the operator updates after creating the GSC property. The bulk of this task is the operator manual under `docs/operations.md` plus a baseline-metrics doc the operator will fill after first GSC pull.

**Files:**
- Modify: `apps/frontend/index.html` (add verification meta tag)
- Modify: `docs/operations.md` (add "SEO monitoring" section)
- Create: `docs/seo-baseline-2026-06-09.md`

- [ ] **Step 1: Add the verification meta tag**

Open `apps/frontend/index.html`. Just below the existing `<meta name="viewport" ...>` line (around line 5), add:

```html
<!-- Google Search Console verification.
     OPERATOR: replace REPLACE_AFTER_GSC_SETUP with the content value from
     Search Console → Settings → Ownership verification → HTML tag.
     Leave the meta in place even after DNS-TXT verification works — Google
     accepts both and the fallback is cheap. -->
<meta name="google-site-verification" content="REPLACE_AFTER_GSC_SETUP" />
```

- [ ] **Step 2: Add the SEO monitoring section to operations.md**

Open `docs/operations.md`. If the file doesn't exist or doesn't have an obvious bottom section, append at the end. The new section:

```markdown
## SEO monitoring (Google Search Console)

One-time setup (operator, ~10 min):

1. Go to https://search.google.com/search-console and add property.
   Prefer the Domain property type (covers all subdomains).
   - Domain verification: Cloudflare DNS → add TXT record per Google's instructions.
   - Fallback if DNS doesn't work: URL prefix property + HTML tag method
     (`apps/frontend/index.html` already carries the meta tag — replace
     `REPLACE_AFTER_GSC_SETUP` with the content value Google gives you,
     commit, push, then click Verify).

2. Submit three sitemaps under Sitemaps:
   - `https://smanga.shop/sitemap.xml`
   - `https://smanga.shop/sitemap-stories.xml`
   - `https://smanga.shop/sitemap-chapters.xml`

3. Settings → Users and permissions → Notification preferences:
   enable "Indexing errors", "Manual actions", "Security issues".

4. Save the day-0 baseline metrics to `docs/seo-baseline-2026-06-09.md`
   (template file already exists). Re-export every Monday for a month
   then monthly — compare deltas in the same file.

Ongoing cadence (operator, Mondays):

- Performance tab → last 7 days. Note impressions delta vs prior week,
  top 10 queries, CTR delta. Drop new entries into the baseline doc
  with the date.
- Coverage tab → check for new indexing errors.
- Skip weeks where nothing changed.

Success signal (4 weeks post-deploy):

- Indexed page count climbing.
- Branded "SManga" query shows sitelinks search box + breadcrumb.
- Story-title queries return SManga page 1.

If none of those hit by week 4, the spec deck (Phase 2 content +
Phase 3 brand outreach) is the next lever — Phase 1 alone won't
move competitive head queries like "truyện chữ".
```

- [ ] **Step 3: Create the baseline doc**

Create `docs/seo-baseline-2026-06-09.md`:

```markdown
# SEO Baseline — 2026-06-09

Snapshot of Google Search Console metrics on the day SEO Foundation
shipped. Compare against this when reviewing weekly progress.

## Day 0 (fill after first GSC pull — usually 24-48h after sitemap submit)

- Total impressions (last 28 days): [TBD]
- Total clicks (last 28 days): [TBD]
- Average CTR: [TBD]
- Average position: [TBD]
- Indexed pages: [TBD]
- Top 10 queries by impressions:
  1. [TBD]
  2. ...

## Weekly snapshots

| Date       | Impressions | Clicks | CTR | Avg Pos | Indexed pages | Notes |
|------------|-------------|--------|-----|---------|---------------|-------|
| 2026-06-09 | 0 (baseline) | 0    | —   | —       | —             | Spec ship day |
| 2026-06-16 | [TBD]       | ...    |     |         |               |       |

## Top queries trend (top 10 each week)

(Operator: list queries here. Look for new long-tail entries that mention
specific story titles — those are the long-tail wins from Section 2b.)
```

The `[TBD]` placeholders in this file are intentional — the operator fills them. This is the one exception to the "no placeholders" rule for plans: it's a template doc, not code.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/index.html docs/operations.md docs/seo-baseline-2026-06-09.md
git commit -m "seo(gsc): verification meta tag + operator manual + baseline doc

Adds the <meta name=google-site-verification> placeholder to
index.html (operator fills after creating the GSC property) plus the
operations.md monitoring runbook and the baseline metrics doc. The
GSC setup itself is operator work outside this commit."
```

---

## Final task: full-suite verification before suggesting push

After Task 10, the operator should:

- [ ] **Step 1: Run the full test suite**

```bash
pnpm -r --workspace-concurrency=1 test
```

Expected: all tests PASS (existing + new `buildOrganizationSchema` + new `cleanChapterTitle`).

- [ ] **Step 2: Typecheck everything**

```bash
pnpm -r typecheck
```

Expected: all packages clean.

- [ ] **Step 3: Production build**

```bash
pnpm --filter @smanga/frontend build
```

Expected: build succeeds, no new chunk-size warnings.

- [ ] **Step 4: Playwright snapshot of home + story page**

With the local dev env running (per Task 8 step 4 instructions), navigate Playwright MCP to:

- `http://localhost:3000/` — assert document.title contains "Đọc truyện chữ Việt online miễn phí", at least 2 `<script type="application/ld+json">` tags present (WebSite + Organization).
- `http://localhost:3000/truyen/dau-pha-thuong-khung` — assert document.title contains "Đọc truyện ... full | SManga", at least 2 JSON-LD scripts (Book + Breadcrumb), "Cùng tác giả" h2 visible (story has a known author).
- `http://localhost:3000/truyen/dau-pha-thuong-khung/chuong/1` — assert document.title starts with "Chương 1:" not "Đấu Phá Thương Khung -".

- [ ] **Step 5: Confirm vite.config.ts is on :3001**

```bash
grep -nE '(3001|3010)' apps/frontend/vite.config.ts
```

Expected: all matches are `:3001` (canonical). If any `:3010` remains, revert before suggesting push.

- [ ] **Step 6: Suggest push to the user**

Report all 10 commits and the verification results. The user runs `git push SManga main` themselves.

---

## Out of scope (do not implement)

These are explicit non-goals per the spec — agentic workers should NOT pull them in even if they look related:

- WebP image variants for covers
- Route code-splitting / dynamic imports
- Hreflang / multi-language tags
- Genre / author / editorial landing pages (Phase 2 spec)
- Backlink outreach, social posting, forum seeding (Phase 3, off-code)
- Renaming things in CLAUDE.md / README.md (internal docs, not indexed)
- BullMQ migration, queue refactors, or anything off this SEO scope
