# SManga Catalog Discovery Flow Implementation Plan (Plan 7 — DRAFT)

> Status: design proposal, awaiting user sign-off on 5 decision points before implementation.
> Originating from workflow review of business flow ask: "tôi chỉ provide source URL, app detect + crawl metadata, sau đó tôi chọn truyện để crawl full."

## TL;DR

Admin gains a **2-step catalog browse**: pick stories from truyenfull's listing pages (cheap metadata-only import), then trigger chapter discovery + content crawl per story on demand. Replaces today's "paste URL → wait for full crawl" with "browse → batch-import stubs → crawl when ready."

## Flow comparison

| Today | New |
|---|---|
| Admin pastes 1 URL into `ImportStoryForm` | Admin browses `/admin/sources/$id/discover` grid (paginated, filterable by hot/new/full/genre) |
| Backend runs `importStory()` — fetches metadata + downloads cover + paginates 1-200 chapter-list pages + inserts N `chapter` rows | Multi-select stubs → bulk POST → backend runs **metadata-only** job per stub (sub-second each). Story persists with `discoveryStatus='pending'` |
| One job, minutes-long, half-committed on failure | Admin opens stub → clicks "Quét danh sách chương" → separate `discover-chapters` job paginates list → then per-chapter content fetch as today |
| `/admin/stories` table conflates "imported" with "crawled" | Stub vs full distinguished by `discoveryStatus` badge + filter chips |

## Changes required

### Backend — adapter + crawler

**`packages/shared/src/adapter.ts`** — new types: `StoryListItem`, `CatalogPage`, `CatalogFeed`, `SearchPage` schemas (Zod). Extend `SourceAdapter` interface:

- **Mandatory**: `catalogFeeds: readonly CatalogFeed[]`, `buildCatalogUrl(feedId, page)`, `parseCatalogPage(html, feedId, page)`
- **Optional**: `buildSearchUrl` / `parseSearchPage`, `buildGenresIndexUrl` / `parseGenresIndex`

Delete orphan `StorySearchResult` (no consumers).

**`packages/crawler/src/sources/truyenfull/`**:
- `parsers.ts` — add `parseCatalogListingHtml()` and `parseGenresIndexHtml()`. Single parser covers `truyen-moi/`, `truyen-hot/`, `truyen-full/`, `the-loai/*` (all share `#list-page .col-truyen-main .list-truyen > .row[itemtype="schema.org/Book"]`). Cover URLs from `div.lazyimg[data-image]` (no `<img>` tag — cheerio sees only `data-*` attrs). Pagination via `.glyphicon-menu-right` icon, same rule as chapter-list.
- `index.ts` — wire 3 mandatory feeds (`newest`, `hot`, `completed`) + search + genres-index.
- `__fixtures__/` — add `catalog-newest-page1.html`, `catalog-hot-page1.html`, `catalog-genre-tien-hiep.html`, `search-results.html`, `genres-index.html`.
- **`fetcher.ts` UA fix** — replace `SMangaBot/0.1` with a Chrome UA; current bot UA is 403'd by Cloudflare.

**`packages/crawler/src/engine.ts`** — split `importStory()` into:
- `importStoryMetadata(url)` — phase A only (story + cover + genres + `story_source`)
- `discoverChapters(storyId)` — phase B (list pages → `chapter` rows, sets `discoveryStatus`)
- Composite `importStory()` kept for `apps/cli` back-compat
- New: `browseCatalog(sourceId, feedId, page)`, `searchCatalog(sourceId, q, page)`, `listFeeds(sourceId)`

### Backend — API + queue

**DB migration `0006_*.sql`**:
```sql
CREATE TYPE story_discovery_status AS ENUM ('pending','running','complete','failed');
ALTER TABLE story ADD COLUMN discovery_status story_discovery_status NOT NULL DEFAULT 'pending';
ALTER TABLE story ADD COLUMN discovery_error text;
ALTER TABLE story ADD COLUMN discovered_at timestamptz;
UPDATE story SET discovery_status='complete' WHERE total_chapters > 0;
```
*`discoveryStatus` is the canonical "stub vs full" discriminator — no separate `kind` column.* Frontend reads `discoveryStatus === 'pending'` as stub.

**New job types** (`apps/api/src/modules/queue/queue.constants.ts`):
- `discover-chapters` — long-running phase B
- `import-story` redefined as orchestrator: runs `importStoryMetadata` then chains `discover-chapters` (preserves Plan 2 e2e behavior)
- For bulk catalog imports: enqueue `import-story` with `{ skipDiscovery: true }` flag so stubs stay as stubs

**New endpoints**:
- `GET  /api/v1/sources/:id/feeds` — list `CatalogFeed[]`
- `GET  /api/v1/sources/:id/discover?feed=&page=&q=` — returns `{ candidates: [...], page, totalPages }` where each candidate has `existingStoryId` + `existingDiscoveryStatus` for dedup
- `POST /api/v1/stories/import-bulk` body `{ sourceId, urls: string[], skipDiscovery: true }` → `{ queued, skipped }` per-candidate
- `POST /api/v1/stories/:id/discover` — enqueues `discover-chapters` with `jobId='discover-chapters:${storyId}'` for dedup
- Existing `POST /chapters/crawl/:storyId` gains precondition: 400 if `discoveryStatus !== 'complete'`
- `StoriesService.getById/getBySlug/list` projects `discoveryStatus`, `discoveryError`, `discoveredAt`

### Frontend

**New route**: `/admin/sources/$id/discover` — paginated card grid (24/page, 2-5 cols responsive), sticky filter bar (`All | Hot | Mới | Full` + genre select + title search), floating multi-select action bar. URL params drive state (`?page=&feed=&genre=&q=`).

**New components**:
- `DiscoverCard.tsx` — 6 mutex states: `discoverable | selected | importing | imported_stub | imported_full | error`
- `DiscoverGrid.tsx`, `DiscoverFilters.tsx`, `DiscoverPagination.tsx`, `DiscoverActionBar.tsx`
- `StubBadge.tsx` — inline "Metadata" pill (zinc-900/10), composes with existing `STATUS_TONE` pill
- `stores/discover-import-store.ts` (Zustand) — tracks in-flight jobIds, reconciles via existing `['jobs','list']` 5s poll (no new SSE infra)
- `api/discover.ts`

**Modified routes**:
- `/admin/sources` — `Compass` icon link per row → discover page
- `/admin/stories` — filter chips `Tất cả | Đã có chapter | Chỉ metadata`, render `StubBadge` when stub, chapter-count `0` → `—` for stubs, hover-row "Crawl chapters" shortcut
- `/admin/stories/$id` — banner at top when `discoveryStatus !== 'complete'`; `ChapterCrawlPanel` gets 3rd button "Quét danh sách chương" state-gated by `discoveryStatus`
- `ImportStoryForm` demoted to `<details>` disclosure "Hoặc dán URL trực tiếp" below the new "Browse catalog" CTA

**Status flow**: `pending` (stub, just imported) → `running` (discover job in flight) → `complete` (chapter rows exist, can crawl content) → `failed` (recoverable via button click).

## Decision points (need user call)

1. **`story.discoveryStatus` enum vs `story.kind`?** Recommend `discoveryStatus` (richer states, replaces both). Collapse to one column?
2. **Stale-stub policy**: auto-delete metadata-only stories not crawled within N days, or leave forever? Recommend: leave them, surface via filter chip count.
3. **Bulk import cap**: max stubs per `POST /import-bulk` call? Recommend 50 (avoids 1rps queue starvation).
4. **Genre filter v1**: ship with hardcoded `All/Hot/Mới/Full` tabs only, OR include dynamic genre dropdown in v1? Recommend tabs-only v1, genres v1.1.
5. **Multi-source dedup**: if same story appears on truyenfull + future-source-X, merge or create separate rows? Recommend separate rows for now (we have `story_source` junction; cross-source merge is its own plan).

## Out of scope

- Cross-source `/admin/discover` union view (per-source only, until 2nd adapter lands)
- Real-time WebSocket/SSE job updates (reuse existing 5s poll)
- Public reader search/browse (this is admin-only catalog ingestion; Plan 5 owns public search via `pg_trgm`)
- Cover proxying for catalog thumbnails (remote URLs, `referrerpolicy="no-referrer"`)
- "Select all on page" affordance
- Author-feed browsing (`/tac-gia/<slug>/`) — adapter supports it, UI deferred
- Per-chapter-page split of `discover-chapters` job (kept as one serial job)

## Effort estimate

**Backend**: ~14 files (adapter + parsers + fixtures + engine + migration + jobs + endpoints)

**Frontend**: ~12 files (discover route + 6 new components + zustand store + api client + 4 modified pages)

**Time**: ~20-26 hours
- Adapter + parsers + fixtures + tests: 4-5h
- Engine split + migration + processors: 4-5h
- API endpoints + bulk job orchestration: 3-4h
- Discover page + cards + action bar + import store: 6-8h
- Stories list/detail updates + ChapterCrawlPanel state machine: 3-4h

## Implementation task breakdown (post-approval)

Suggest splitting Plan 7 into 5 tasks:

- **Task 1: Adapter contract + truyenfull catalog parsers** — `packages/shared` + `packages/crawler` (~5h)
- **Task 2: Engine split + DB migration** — `packages/db` migration + `packages/crawler/engine.ts` (~5h)
- **Task 3: API endpoints + job orchestration** — `apps/api/src/modules/{sources,stories,crawler-jobs,queue}` (~4h)
- **Task 4: Discover page + components** — `apps/frontend/src/routes/admin/sources/$id.discover.tsx` + 6 components + zustand store (~7h)
- **Task 5: Admin stories list/detail updates + e2e smoke** — modify existing admin pages, Playwright verify (~4h)
