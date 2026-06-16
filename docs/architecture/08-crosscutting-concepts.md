# 8. Crosscutting Concepts

> arc42 §8 — concepts that recur across building blocks. Each subsection is intentionally thin: just enough to understand the pattern and where the real code lives. For the full reference see [`docs/reference/`](../reference/configuration.md); for the decisions behind these choices see [`docs/adr/`](../adr/README.md).

These concepts are derived from the real code in `apps/api`, `packages/crawler`, and `packages/db`. Every path below is a live file.

## 8.1 Authentication & authorization (JWT cookie)

SManga uses a stateless JWT carried in an **httpOnly cookie named `jwt`** (no server-side session table for the JWT itself).

- **Login** (`apps/api/src/modules/auth/auth.controller.ts`): `POST /api/v1/auth/login` verifies the password with `bcryptjs`, signs a JWT (`{ sub, email, role }`, see `JwtPayload` in `auth.service.ts`), and sets the cookie with `httpOnly: true`, `sameSite: 'lax'`, `secure` in production, and `maxAge` of 14 days.
- **Token extraction** (`apps/api/src/modules/auth/jwt.strategy.ts`): a passport-jwt strategy reads the token first from the `jwt` cookie, then falls back to the `Authorization: Bearer` header. `secretOrKey` is `JWT_SECRET` from the env.
- **Global guards** (`apps/api/src/modules/auth/auth.module.ts`): two `APP_GUARD` providers run on every request — `OptionalJwtGuard` (populates `req.user` if a valid token is present, **never rejects** when absent) then `RolesGuard`. Endpoints that *must* be authenticated add the route-scoped `JwtAuthGuard` (`apps/api/src/common/guards/jwt.guard.ts`); admin-only endpoints add `@Roles(['admin'])` (`apps/api/src/common/decorators/roles.decorator.ts`) which `RolesGuard` enforces against `user.role`.
- **OAuth (optional)**: Google login is wired via `passport-google-oauth20` (`auth/google.strategy.ts`) and exposed only when `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are set. `GET /api/v1/auth/providers` tells the frontend whether to render the Google button; the callback signs the same cookie and redirects back to a same-origin path.
- **Rate limiting on login**: `POST /auth/login` is wrapped in `RealIpThrottlerGuard` (`apps/api/src/common/guards/real-ip-throttler.guard.ts`) with `@Throttle({ limit: 5, ttl: 60_000 })`. Because prod sits behind `cloudflared → caddy` (so `req.ip` is the shared tunnel IP), the guard keys the bucket on the `CF-Connecting-IP` header, falling back to `req.ip` for local dev. This **per-IP login throttling guard** is route-scoped on purpose — applying that custom CF-IP-keyed guard globally would share one bucket across every visitor. (The base `ThrottlerModule` itself *is* registered globally in `app.module.ts` — `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])` — with per-route `@Throttle` overrides such as login 5/60 s and recommendations 60/60 s.)

See [ADR 0002](../adr/0002-nestjs-vite-split.md) for the BE/FE split that makes a token-in-cookie model (rather than Auth.js) the right fit.

## 8.2 Background work — Bull queue, processors, priorities, retries

All crawler work runs through a single Bull queue named `crawler` (`apps/api/src/modules/queue/queue.constants.ts`, `QUEUE_CRAWLER = 'crawler'`), backed by Redis. The API process is *both* producer and worker — `@Process` handlers run in-process with the HTTP server.

**Job types** (`queue.constants.ts`):

| Job name | Constant | Purpose |
|---|---|---|
| `import-story` | `JOB_IMPORT_STORY` | Persist story metadata (Phase A) |
| `discover-chapters` | `JOB_DISCOVER_CHAPTERS` | Build the chapter list for a story (Phase B) |
| `fetch-chapter` | `JOB_FETCH_CHAPTER` | Crawl one chapter's content |
| `refresh-all-stories` | `JOB_REFRESH_ALL_STORIES` | Scheduled re-discovery (cron) |
| `discover-all-source` | `JOB_DISCOVER_ALL_SOURCE` | Fan out a whole source feed into imports |
| `retry-reconciler` | `JOB_RETRY_RECONCILER` | Dead-letter retry tick (repeatable) |
| `autocrawl-feed` | `JOB_AUTOCRAWL_FEED` | Backlog drainer tick (repeatable) |

**Priorities** (`JOB_PRIORITY`, lower number = higher priority): `FETCH_CHAPTER:1 < RETRY_RECONCILER:2 < DISCOVER_CHAPTERS:5 < DISCOVER_ALL_SOURCE:8 < IMPORT_STORY:10 < REFRESH_ALL_STORIES:20 < AUTOCRAWL_FETCH:30`. This ordering exists because of the 2026-06-09 incident, when ~48k FIFO `import-story` jobs starved `fetch-chapter` and zero chapters were crawled in 24h. Chapter content crawling (the only job that grows the visible library) now always preempts setup work, and the background auto-crawl drainer (priority 30) yields to everything manual.

**Bull configuration** (`apps/api/src/modules/queue/queue.module.ts`):

- `defaultJobOptions.attempts: 2` (one in-process retry) with `backoff: { type: 'exponential', delay: 30_000 }`. Completed jobs are retained `{ age: 7d, count: 20_000 }`; failed jobs `{ age: 24h, count: 5_000 }` — both bounded so Redis memory stays in check.
- Queue settings: `lockDuration: 120_000`, `stalledInterval: 60_000`, `maxStalledCount: 3` so a Watchtower container swap or a long cheerio parse does not mass-fail active jobs as stalled.
- `main.ts` calls `app.enableShutdownHooks()` so SIGTERM lets `@nestjs/bull` close the queue gracefully and active jobs release their locks instead of being re-failed on the next boot.

**Dead-letter + multi-generation retry**: when a `fetch-chapter` / `discover-chapters` / `import-story` job exhausts Bull's in-process attempts, `apps/api/src/modules/jobs/job-failure.listener.ts` records it in the `job_failure` table and classifies the error (see §8.8). A repeatable reconciler (`apps/api/src/modules/jobs/retry-reconciler.service.ts`) re-enqueues *transient* failures on a coarse backoff ladder — `RETRY_BACKOFF_MINUTES = [10, 30, 120, 360, 1440]` (`packages/shared/src/retry-policy.ts`), up to `MAX_RETRY_GENERATIONS = 5` before the row is marked `dead`. The reconciler honours the `app_setting.autoRetryEnabled` kill switch. Re-enqueue uses the natural dedup key from `apps/api/src/modules/jobs/dead-letter.util.ts` (e.g. `fetch-chapter:<chapterId>`), which doubles as the idempotent Bull `jobId`.

**Idempotent / chunked enqueue**: producers use `enqueueIdempotent` and `enqueueChunked` (`apps/api/src/modules/queue/enqueue.util.ts`) plus the `assertQueueCapacity` gate (`queue-capacity.ts`) so a single bulk action cannot recreate the 3.7M-job flood. See [`docs/business-logic/crawling-and-discovery.md`](../business-logic/crawling-and-discovery.md) and [ADR 0003](../adr/0003-bull-redis-over-pgboss.md).

## 8.3 Caching — Cloudflare edge + HTTP cache headers

Caching is layered: the origin sets cache headers, and a small set of Cloudflare Cache Rules makes those headers effective at the edge.

- **Covers** (`apps/api/src/modules/covers/covers.controller.ts`): `GET /api/v1/cover/:storyId` serves the bytea with `Cache-Control: public, max-age=31536000, immutable` and a SHA-1 **ETag** computed from the cover bytes; an `If-None-Match` match returns `304`. Covers are immutable per story, so a 1-year TTL is safe.
- **Chapter content** (`apps/api/src/modules/chapters/chapters.controller.ts`): `GET /api/v1/chapters/by-slug/:slug/:index` sets `Cache-Control: public, s-maxage=86400, stale-while-revalidate=3600` — crawled content is effectively immutable, so a 1-day edge TTL is fine.
- **Anonymous JSON** (stories list/detail, search, rankings): served with `s-maxage` / `stale-while-revalidate` so Cloudflare can hold the response. Cloudflare Cache Rules (documented in `deploy/CLOUDFLARE-CACHE-RULES.md`) make cover and sitemap paths cache-eligible and let public JSON "respect origin" TTL; responses carrying a `Cookie` header (logged-in/admin) are kept out of the shared cache. Measured prod edge `Cf-Cache-Status: HIT` lands around ~0.15s.

Without the dashboard Cache Rules, the extensionless `/api/v1/cover/:storyId` path is `DYNAMIC` by default — the headers alone are inert at the edge. See [§9 Quality & Risks](09-quality-and-risks.md) and the performance spec `docs/superpowers/specs/2026-06-11-performance-remediation-design.md`.

## 8.4 Chapter content storage — gzip bytea

`chapter.contentText` is a Postgres **`bytea` holding gzip-compressed UTF-8** (`packages/db/src/schema/chapter.ts`). `chapter.contentByteSize` stores the **uncompressed** length for stats.

- **Write** (`packages/crawler/src/engine.ts`): the crawler `gzip`s the parsed chapter text (async `promisify(zlib.gzip)`) before persisting, and records the uncompressed size in `contentByteSize`.
- **Read** (`apps/api/src/modules/chapters/chapters.service.ts`): `getChapterContent` does an async `gunzip` server-side (`promisify(zlib.gunzip)`) and returns plain text, with a fallback to treating the bytes as raw UTF-8 if gunzip fails. Clients never receive compressed bytes.

This is a hard-won convention — always gunzip on read, never ungzip client-side.

## 8.5 Vietnamese-friendly search

Story search is diacritic-insensitive trigram matching (`apps/api/src/modules/search/search.service.ts`).

- Migration `0001` (`packages/db/src/migrations/0001_pale_salo.sql`) enables `pg_trgm` + `unaccent` and defines an **`immutable_unaccent(text)`** wrapper. Postgres' built-in `unaccent()` is only `STABLE`, so it cannot be used directly in an index expression; the `IMMUTABLE` wrapper can.
- A GIN trigram index `story_search_idx` is built over `immutable_unaccent(lower(title || ' ' || coalesce(author, '')))` (`gin_trgm_ops`).
- Queries match with `immutable_unaccent(lower(...)) ILIKE '%' || immutable_unaccent(lower(:q)) || '%'` and rank by `similarity(...)`. So a search for `truyen` matches `Truyện`.

See [ADR 0008](../adr/0008-immutable-unaccent-search-index.md).

## 8.6 Configuration & environment loading

- **Schema-validated env** (`apps/api/src/config/env.ts`): a Zod schema (`loadEnv()`) validates `NODE_ENV`, `PORT` (default 3001), `DATABASE_URL`, `REDIS_URL`, `DB_POOL_MAX` (default 10), `JWT_SECRET` (min 16 chars), `FRONTEND_BASE_URL`, `LOG_LEVEL`, and the optional `AUTH_GOOGLE_*` trio. The process fails fast on invalid config.
- **dotenv preload** (`apps/api/src/main.ts`): the repo-root `.env` is loaded **before any module import**, because `loadEnv()` and several module decorators read `process.env` at evaluation time — well before `ConfigModule.forRoot()` runs. In Docker the env vars come from `docker-compose.prod.yml`, so a missing `.env` file is fine.
- **Runtime-tunable flags** live in the singleton `app_setting` table (`packages/db/src/schema/app-setting.ts`) — `autoRefreshEnabled`, `autoCrawlEnabled`, `autoCrawlWatermark`, `autoRetryEnabled`, etc. — editable from `/admin/settings` without a redeploy.

Full list in [`docs/reference/configuration.md`](../reference/configuration.md).

## 8.7 Theming & design tokens (frontend)

The reader UI ships with a light/dark theme toggled via a `data-theme` attribute on `:root` (`apps/frontend/src/styles.css` defines `:root[data-theme="light"]` and `:root[data-theme="dark"]` token blocks). Reader preferences (theme, font size) persist client-side in a Zustand store (`apps/frontend/src/stores/reader-prefs-store.ts`, default theme `light`).

Fonts are **self-hosted** via `@fontsource` (no Google Fonts CDN at runtime): `Inter` (UI / body, weights 400–800) and `Newsreader` (headings + reading body, weights 400/600/700 + 400 italic) — imported in `apps/frontend/src/main.tsx`, including the `vietnamese` subset for diacritics.

> Note: `design-system/smanga/MASTER.md` and the `CLAUDE.md` token block describe aspirational palettes/font pairings that have **not** been implemented; the shipped frontend uses Inter + Newsreader with the `data-theme` token system above. Treat the running code as the source of truth.

## 8.8 Error model

Crawler errors are a small typed taxonomy in `packages/shared/src/errors.ts`, all extending `CrawlerError`:

| Class | Meaning |
|---|---|
| `FetchError` | HTTP/network failure; carries an optional `statusCode` |
| `RateLimitError` | Source rate-limited us |
| `ParserError` | Adapter could not parse the HTML (e.g. empty/VIP content) |
| `AdapterNotFoundError` | No registered adapter for the URL/source |

The retry classifier (`packages/shared/src/retry-policy.ts`, `classifyCrawlerError`) maps these to `transient` vs `permanent`: `RateLimitError` → transient; `FetchError` → transient for `408`/`5xx`/network (no status), permanent for other `4xx`; `ParserError` / `AdapterNotFoundError` → permanent; anything unknown → permanent (never loop on something we don't understand). Only transient failures are auto-retried by the reconciler (§8.2). The classifier uses `instanceof` first and a `.name` string fallback in case an error crossed a module boundary.

On the HTTP side, NestJS exception filters translate thrown `HttpException`s (e.g. `BadRequestException`, `UnauthorizedException`, `ConflictException`) into JSON error responses with the appropriate status.

## 8.9 Logging

Structured logging uses **pino** via `nestjs-pino` (`apps/api/src/app.module.ts` `LoggerModule.forRoot`). In development the transport is `pino-pretty` (colorized); in production it emits raw JSON lines (no transport) for ingestion. `main.ts` sets the Nest app logger to the pino `Logger`. Log verbosity is driven by `LOG_LEVEL` (default `info`). Individual services use the Nest `Logger` (e.g. `AppSettingsService`, `AutoCrawlFeederProcessor`) which routes through the same pino pipeline.

---

**Next:** [§9 Quality Requirements & Risks](09-quality-and-risks.md) · [§10 Glossary](10-glossary.md) · back to [arc42 index](00-index.md)
