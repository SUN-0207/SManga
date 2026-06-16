# 10. Glossary

> arc42 §10 — domain and technical terms used across the docs and the code. Vietnamese domain terms appear because the product and several user-facing identifiers / URL slugs are Vietnamese (English-only rule applies to code identifiers, not UI text or slugs).

## Domain terms

| Term | Definition |
|---|---|
| **adapter** (SourceAdapter) | A per-source parser implementing the `SourceAdapter` contract from `@smanga/shared` (`packages/shared/src/adapter.ts`). Methods take **HTML strings**, not URLs; the crawler engine handles fetching, rate-limiting, persistence, and cover download. New source = new folder under `packages/crawler/src/sources/<id>/`. |
| **chương** (chapter) | A single chapter of a story. Persisted in the `chapter` table; `index` is a `numeric(10,2)` (so half-indexed bonus chapters fit), and `contentText` is gzip-compressed bytea. Status enum: `pending` / `crawled` / `failed`. |
| **dead-letter** | A durable record (`job_failure` table) of a crawler job that exhausted Bull's in-process retries. The retry reconciler auto-recovers *transient* dead-letters and surfaces *permanent* ones in the `/admin/jobs` panel. |
| **discovery** | Phase B of crawling: building the chapter **list** for an imported story (not the chapter content). Tracked by `story.discoveryStatus` (`pending` → `running` → `complete` / `failed`). Content crawling is gated on `discoveryStatus = 'complete'`. |
| **frontier** | In the smart auto-crawl feeder, the bounded set of newest stories that still have a `pending` chapter — selected via a CTE so the outer scan early-stops on `story_updated_at_idx` instead of full-sorting the ~1.7M pending rows. |
| **needs-crawl / has-errors** | Mutually-exclusive admin crawl-state buckets. `needs-crawl` = discovery complete AND ≥1 `pending` chapter AND no `failed`; `has-errors` = discovery complete AND ≥1 `failed` chapter (errors take priority). |
| **stub** | A story imported with metadata only (`skipDiscovery`) — persisted with `discoveryStatus = 'pending'`, no chapter list yet. The operator (or auto-chain) discovers chapters later. |
| **tác giả** (author) | The story's author, `story.author` (nullable). Part of the search index. |
| **thể loại** (genre) | A story category. `genre` table (slug + name) joined to stories via `story_genre`. |
| **truyện** (story / novel) | The top-level work. The `story` table (slug, title, author, description, cover bytea, status, total chapters, timestamps). |
| **VIP chapter** | A source chapter behind a paywall/login whose content can't be parsed — surfaces as a `ParserError` (permanent), so it lands in the failed/dead-letter path and is never re-picked by the backlog drainer. |
| **watermark** | The maximum number of `fetch-chapter` jobs the smart auto-crawl feeder keeps queued (`app_setting.autoCrawlWatermark`, default 500, clamped [50, 2000]). The bound that keeps the background drainer non-disruptive. |

## Technical terms

| Term | Definition |
|---|---|
| **bytea** | Postgres binary column type. Used for `chapter.contentText` (gzip-compressed UTF-8) and `story.cover` (raw image bytes). |
| **edge cache** | Cloudflare's CDN cache in front of the origin. Cache Rules + origin `Cache-Control` / `s-maxage` headers let covers, sitemaps, and anonymous JSON return `Cf-Cache-Status: HIT` (~0.15s) without hitting the laptop. |
| **ETag** | A content hash (SHA-1 for covers, sitemap bodies) returned with a response; a matching `If-None-Match` request gets a `304 Not Modified` with no body or DB work. |
| **gzip / gunzip** | Compression applied to chapter content: the crawler `gzip`s on write (async `zlib.gzip`), the API `gunzip`s on read (async `zlib.gunzip`). `contentByteSize` stores the *uncompressed* length. |
| **`immutable_unaccent`** | An `IMMUTABLE` SQL wrapper (migration `0001`) around Postgres' `STABLE` `unaccent()`, so it can be used in the GIN trigram search index expression. |
| **JWT cookie** | The auth token (`{ sub, email, role }`) stored in an httpOnly cookie named `jwt`, validated by a passport-jwt strategy reading the cookie (or `Authorization: Bearer` fallback). |
| **`pg_trgm`** | Postgres trigram extension powering diacritic-insensitive `ILIKE` / `similarity()` story search over the `immutable_unaccent(lower(...))` GIN index. |
| **priority** | Bull job priority — **lower number = higher priority**. `FETCH_CHAPTER:1` … `AUTOCRAWL_FETCH:30` (lowest) so background work never preempts manual/discover work. |
| **repeatable job** | A Bull job that re-fires on a cron (installed at boot via `withRedisReadyRetry`). Used for the auto-refresh, the dead-letter retry reconciler, and the smart auto-crawl feeder (cron `*/1`, tz `Asia/Ho_Chi_Minh`). |
| **token bucket** | The per-source rate limiter (`packages/crawler/src/rate-limit.ts`). Refills `ratePerSecond` tokens; `acquire()` serializes waiters FIFO via a promise chain so concurrent callers can't stampede. Default 1 rps per source. |
| **Watchtower** | The container in the prod compose stack that polls GHCR every ~5 min and auto-pulls + restarts updated `api` / `frontend` images — the deploy mechanism (no manual SSH deploy). |

---

Back to [arc42 index](00-index.md) · related: [§8 Crosscutting Concepts](08-crosscutting-concepts.md) · [`docs/reference/data-model.md`](../reference/data-model.md)
