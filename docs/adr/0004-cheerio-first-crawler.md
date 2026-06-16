# ADR 0004 — Cheerio-first crawler with a Playwright escape hatch

- **Status:** Accepted
- **Date:** 2026-05-28 (Plan 1 foundation)
- **Sources:** `CLAUDE.md` § "Architectural decisions (the why)" and § "Crawler conventions"; `packages/crawler/src/fetcher.ts`; `packages/crawler/src/sources/truyenfull/parsers.ts`; `packages/shared/src/adapter.ts` (the `requiresJs` flag).

## Context

SManga crawls Vietnamese novels from `truyenfull.today` and is built to add more sources via the `SourceAdapter` contract. The crawler fetches a page, parses HTML into structured data (story metadata, chapter list, chapter content), and persists it. Throughput matters because catalogs are large (tens of thousands of pending chapters in prod).

`truyenfull.today` serves **static, server-rendered HTML** — the content a reader sees is present in the initial response, with no client-side JS rendering required.

## Decision

Parse with **cheerio** (a server-side jQuery-like HTML parser). The fetcher (`packages/crawler/src/fetcher.ts`) pulls HTML over `undici` with a real Chrome user-agent; the adapter's parse methods take **HTML strings** (not URLs) and run cheerio (`cheerio.load(html)`).

Keep a **Playwright escape hatch** for future JS-rendered sources via the `SourceAdapter.requiresJs: boolean` flag (`packages/shared/src/adapter.ts`). truyenfull sets `requiresJs: false`. No source currently needs Playwright, so it is not a runtime dependency of the default path.

## Consequences

**Easier**

- Cheerio parses in ~50 ms/request vs ~2 s/request for a headless Chromium, and avoids the ~300 MB Chromium footprint — critical for the laptop host and for draining a large backlog.
- Adapters are HTML-in/structured-out, which makes them **fixture-driven testable**: HTML is committed under `__fixtures__/` and re-captured when the live site breaks tests.
- The fetcher centralises rate-limiting, retries, UA, and timeout handling so adapters stay pure parsing logic.

**Harder / trade-offs**

- Sites that render content with JavaScript will return empty HTML to cheerio; those require a `requiresJs: true` adapter and a Playwright-backed fetch path that **does not yet exist** — it is a designed-for-but-unimplemented extension point.
- Parsers are coupled to the source's DOM; selector drift breaks them and requires re-capturing fixtures. truyenfull has documented selector quirks (`CLAUDE.md` § "Crawler conventions"): chapter index from the URL slug (`/chuong-N/`), `hasNextPage` via the `.glyphicon-menu-right` icon, chapter title via `a.chapter-title`.

## Alternatives considered

- **Playwright for everything** — rejected as the default: 40× slower per request and a heavy Chromium dependency, with no benefit for a static-HTML source. Retained only as a per-source opt-in via `requiresJs`.
- **Regex / string scraping** — rejected; brittle and unreadable compared to cheerio selectors.

## Related

- How to add a source: [`../how-to/add-a-new-crawler-source.md`](../how-to/add-a-new-crawler-source.md)
- Crawling business rules: [`../business-logic/crawling-and-discovery.md`](../business-logic/crawling-and-discovery.md)
