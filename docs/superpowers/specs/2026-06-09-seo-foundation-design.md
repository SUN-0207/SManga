# SEO Foundation (Phase 1 of L3 program) — Design Spec

**Status:** Approved 2026-06-09
**Author:** son.cu@opswat.com (brainstormed with Claude)
**Parent program:** L3 SEO uplift — Foundation (this spec) → Content (Phase 2 spec, later) → Brand authority (Phase 3, off-code).

---

## Goal

Re-target SManga's title, schema, and on-page surfaces so Google understands the site is a Vietnamese novel reader (not a literary magazine), and so every existing story/chapter/genre URL ranks for its own long-tail keyword. Visible outcome 2-4 weeks after deploy:

- Branded query "SManga" → SManga site appears with a sitelinks search box and a 4-deep breadcrumb on at least story-detail results.
- Long-tail query "{Story Title}" (exact match) → SManga page 1 result.
- "Tạp chí truyện chữ Việt" AI Overview no longer surfaces literary-journal sites as the primary interpretation when SManga is the matching result.

This spec is **Phase 1 of 3**. Phase 2 (genre / author / editorial landing pages) and Phase 3 (off-code brand authority — outreach, backlinks, social) get their own specs after Phase 1 ships and metrics arrive.

## Non-goals (explicit)

- **WebP image variants.** Cover bytea served with Cache-Control immutable + Cloudflare edge cache absorbs load; not the bottleneck.
- **Route code-splitting.** Bundle is 643 KB / gzip 184 KB — acceptable for the audience. Defer until LCP shows up as a Search Console issue.
- **Hreflang.** SManga is single-language vi-VN.
- **Genre / author / editorial landing pages.** Phase 2.
- **Backlink outreach, social posting, forum seeding.** Phase 3, off-code.
- **Adding new MCP-style integrations or rewriting routing.** Stay on existing stack.

## Audience and channels

Same audience as today: Vietnamese readers searching for novels, mostly mobile, ~70-80% logged-out (per current GA assumption). Channels we're optimizing for, in order: organic Google Search (primary), branded direct (small but steady), referral from VN novel-reader forums (Phase 3).

## Architecture

Three concentric layers, each independent and shippable on its own:

1. **Tagline rebrand** — pure string changes in 3 files (index.html, AuthShell, home hero). Zero behavioral or routing impact. Ships in one commit.
2. **Technical perfection** — additive schema + title-pattern + internal-link changes. Existing routes keep working; only their rendered metadata + JSON-LD evolve. Splits into 4 commits along clean seams (schema, titles, internal links, descriptions).
3. **GSC verification + monitoring** — one `<meta>` tag in index.html + a manual-process doc the operator follows once in the GSC dashboard.

Each layer can ship independently. They are sequenced (1 → 2 → 3) only so the operator can submit the sitemap after the rebrand stabilizes — there's no code dependency between them.

---

## Section 1 — Tagline rebrand

**New tagline:** `SManga — Đọc truyện chữ Việt online miễn phí`

This title pattern serves two functions: it's the homepage `<title>` and the descriptor that flows into per-page meta descriptions (`"<page-specific> — Đọc truyện chữ Việt online miễn phí"`).

**Why this exact wording, not the alternatives:**
- Targets four high-volume Vietnamese search keywords in one phrase: `đọc truyện chữ`, `truyện chữ việt`, `truyện online`, `miễn phí`.
- Drops "Tạp chí" (magazine) — the word that Google AI Overview misinterprets as a literary journal. Search results for the old tagline pulled Báo Văn Nghệ and Tạp chí Văn nghệ Quân đội as primary entities, with SManga relegated to a secondary mention.
- Stays under 60 characters so Google doesn't truncate the title in SERP.
- Reads as a natural sentence to the reader, not keyword-stuffed.

**Files to change:**

| File | Current | New |
|---|---|---|
| `apps/frontend/index.html:14` | `<title>SManga — Tạp chí truyện chữ Việt</title>` | `<title>SManga — Đọc truyện chữ Việt online miễn phí</title>` |
| `apps/frontend/src/components/auth/AuthShell.tsx:15` | `eyebrow = 'TẠP CHÍ TRUYỆN CHỮ VIỆT'` | `eyebrow = 'ĐỌC TRUYỆN CHỮ VIỆT'` (shorter eyebrow — full tagline lives in title) |
| `apps/frontend/src/routes/index.tsx:94` | hero kicker `TẠP CHÍ TRUYỆN CHỮ VIỆT` | `ĐỌC TRUYỆN CHỮ VIỆT` |

CLAUDE.md + README.md tagline mentions: leave for now — internal docs, not indexed.

The home page's `<SEO>` `title` prop is already `"SManga — Đọc truyện chữ Việt online miễn phí"` (since a prior commit), so the homepage SERP title already matches the new pattern. The fallback `<title>` in index.html is what Google sees for routes during the brief pre-hydrate window and for crawlers that don't execute JS — that's the line that ships the rebrand.

---

## Section 2 — Technical perfection

Audit-confirmed current state (NOT changes — what's already shipped):
- `buildWebSiteSchema()` on home → emits WebSite + SearchAction (sitelinks search box) ✓
- `buildBookSchema()` on `/truyen/$slug` → emits Book with aggregateRating when present ✓
- `buildArticleSchema()` + `buildBreadcrumbSchema()` on `/truyen/$slug/chuong/$index` → emits Article + BreadcrumbList ✓
- Sitemap at `/sitemap.xml` (200) + per-section sitemaps for stories + chapters ✓
- robots.txt with appropriate Disallow paths ✓

**Section 2a — Schema gaps to fill** (`apps/frontend/src/components/seo/builders.ts` + 1 route):

1. **Add `buildOrganizationSchema()`** — new builder. Includes brand name, logo URL (the BookMark SVG renders to favicon — point to `/favicon.svg`), and `sameAs: []` (empty array until Phase 3 social accounts exist; emit anyway so Google sees the entity). Inject on home page beside the existing WebSite schema (jsonLd accepts an array, or wrap both in `@graph`).

2. **Add `buildBreadcrumbSchema()` call on `/truyen/$slug`** — current page has Book schema but no breadcrumb. Add a 2-level breadcrumb: `Trang chủ → {Story Title}`. Wire via the existing `jsonLd` prop pattern (pass an array `[buildBookSchema, buildBreadcrumbSchema]`).

The chapter route already chains Article + BreadcrumbList, so no change there.

**Section 2b — Title pattern rewrite** (per-route, in the route's `<SEO title=...>` prop):

| Route | Current pattern | New pattern |
|---|---|---|
| `/` | `SManga — Đọc truyện chữ Việt online miễn phí` (already correct) | (no change) |
| `/truyen/$slug` | `{Title} - {Author} \| SManga` | `{Title} - Đọc truyện {Genre1} full \| SManga` (Genre1 = first genre name; falls back to "online" if no genres) |
| `/truyen/$slug/chuong/$index` | `{ChapterTitle} - {StoryTitle} \| SManga` | `Chương {N}: {CleanedChapterTitle} \| {StoryTitle} - SManga` (use the existing `cleanTitle` helper that strips the duplicate "Chương N:" prefix). |

Cap each at 60 chars via the existing truncation helper — Google truncates beyond that anyway, and a truncated title with the brand cut off hurts CTR.

**Section 2c — Meta description optimization** (`<SEO description=...>` per route):

- Story page: lift the first 140 chars from the story description, prepended with the rewritten title's key terms. If description is missing (rare — Plan 7 stub stories), generate `Đọc {Title} của {Author} — {totalChapters} chương, cập nhật {YYYY-MM-DD}.` so the meta is never empty.
- Chapter page: `Đọc chương {N} {ChapterTitle} truyện {StoryTitle} của {Author} online miễn phí trên SManga.` Hard cap 160 chars.

**Section 2d — Internal linking audit** (additive, not rewrites):

- **Story page bottom:** add a "Truyện cùng tác giả" rail (3-5 stories where `author === currentStory.author`, exclude self). Already partially built — verify it's wired or build if absent.
- **Story page bottom:** add a "Cùng thể loại" rail (3-5 stories sharing first genre, exclude self). Same — verify or build.
- **Chapter page:** ensure prev/next chapter links exist + a "Mục lục" link back to the story (current implementation already has these per the chapter route audit; this is a "no regression" check, not new work).
- **Footer:** add a "Khám phá theo thể loại" block with the top 8 most-populous genres as small links, each `/kham-pha?genre={slug}`. Stays small (one h4 + 8 inline links), no design impact.

The rails are real SEO juice — every story page becomes a hub that pushes link equity to related stories. Without rails, every story is an island.

---

## Section 3 — Google Search Console verification + monitoring

**Code change (one commit):**

- Add `<meta name="google-site-verification" content="REPLACE_AFTER_GSC_SETUP">` to `apps/frontend/index.html` (just below the existing `<meta name="viewport">`). The actual content value comes from GSC's "HTML tag" verification method; the operator fills it in after creating the GSC property and re-pushes. Until then, GSC verification falls back to the DNS TXT method (also documented in the operator manual section below).

**Operator manual (lives in `docs/operations.md` — new section "SEO monitoring"):**

1. Add property in [GSC](https://search.google.com/search-console). Use the Domain property type (covers all subdomains) — needs DNS TXT record at Cloudflare. Fallback: URL prefix property with HTML meta tag (use the meta added above).
2. Submit three sitemaps:
   - `https://smanga.shop/sitemap.xml`
   - `https://smanga.shop/sitemap-stories.xml`
   - `https://smanga.shop/sitemap-chapters.xml`
3. Enable email alerts: Settings → Users and permissions → Set notification preferences → "Indexing errors", "Manual actions", "Security issues".
4. **Baseline screenshot** (day 0): impressions, CTR, top 10 queries (Performance tab → last 28 days). Save to `docs/seo-baseline-2026-06-09.md` for week-by-week comparison.
5. **Weekly review cadence** (every Monday): compare impressions delta, top-query CTR, indexed page count vs prior week. Note in a single status doc.

**Success metric (4 weeks post-deploy):**
- Indexed pages count rises (Coverage tab); no validation errors.
- Branded query "SManga" SERP shows breadcrumb + sitelinks search box.
- Story-title queries that previously didn't surface SManga return SManga on page 1.

If none of those three hit by week 4, that's a signal to re-scope — but it's not a hard failure; competitive SEO is months-long for some queries.

## Components touched (summary)

```
apps/frontend/
  index.html                                — Section 1 (title) + Section 3 (verification meta)
  src/components/auth/AuthShell.tsx         — Section 1 (eyebrow)
  src/routes/index.tsx                      — Section 1 (hero kicker) + Section 2a (Organization schema)
  src/routes/truyen/$slug/index.tsx         — Section 2a (Breadcrumb on story) + 2b (title) + 2c (description) + 2d (rails)
  src/routes/truyen/$slug/chuong/$index.tsx — Section 2b (title) + 2c (description)
  src/components/seo/builders.ts            — Section 2a (Organization builder)
  src/components/layout/AppShell.tsx (footer) — Section 2d (genre footer block)

docs/
  operations.md                             — Section 3 (operator manual)
  seo-baseline-2026-06-09.md (new)          — Section 3 (baseline screenshot file)
```

No DB migration. No new packages. No new routes. ~7 files touched + 1 new doc.

## Data flow

Schema changes are purely on the rendering side. The existing `<SEO>` component already accepts `jsonLd?: Record<string, unknown> | Record<string, unknown>[]` and serializes via Helmet — `buildOrganizationSchema()` slots into the same array on the home route alongside `buildWebSiteSchema()`. No data shape changes hit the API.

Title and description pattern changes pull from the same `StorySummary` / `StoryDetail` / chapter route data already loaded — no extra queries.

The "Cùng tác giả" rail needs `listStories({ author })` which the API already supports via the existing filter mechanism. The "Cùng thể loại" rail uses the existing `listStories({ genre })` endpoint. Both are cached client-side by React Query with a generous staleTime.

## Edge cases

- **Story with no genres** (some Plan 7 stub imports): title pattern uses literal `"online"` instead of `{Genre1}`. Description generation handles missing fields with the fallback template.
- **Story with no description** (rare): description template uses the auto-generated fallback (`Đọc {Title} của {Author} — {N} chương...`). Never emit an empty description — that's worse for SERP than a generic one.
- **Single chapter / drop story**: Article schema still emits; only `aggregateRating` conditional on rating count remains conditional. Breadcrumb works regardless.
- **Story with no author / "Khuyết danh"** (~5-10% of catalog): suppress the "Cùng tác giả" rail entirely — it would either be empty (no match) or noisy (every anonymous story would link to every other anonymous story). The "Cùng thể loại" rail still renders.
- **Operator forgets to fill in google-site-verification content**: the placeholder string is harmless — Google just rejects verification with that method; DNS TXT remains an option. Lint won't catch it because it's valid HTML. Add a one-line comment in index.html reminding the operator.

## Testing

- **Unit tests** (`apps/frontend/src/components/seo/builders.spec.ts`): add a case for `buildOrganizationSchema()`. Existing builder tests cover the others.
- **Manual** (after deploy): paste the deployed page URL into [Google Rich Results Test](https://search.google.com/test/rich-results) for `/`, `/truyen/dau-pha-thuong-khung`, `/truyen/dau-pha-thuong-khung/chuong/1`. Each should parse cleanly with the schema types listed.
- **Playwright** (local pre-push): assert `document.title` matches the new tagline pattern for each route; assert at least one `<script type="application/ld+json">` per route + Organization schema present on home.
- **No new e2e**: the changes don't introduce new behavior, just metadata.

## Open questions

None. All clarifying decisions resolved during brainstorming (2026-06-09): L3 target, A tagline candidate, Section 2 scope (skip WebP/code-split/hreflang), Section 3 process.
