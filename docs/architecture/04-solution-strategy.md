# 4. Solution strategy

← back to [architecture index](00-index.md)

This section is the bridge between the **goals/constraints** ([§01](01-introduction-and-goals.md),
[§02](02-constraints.md)) and the **structure** ([§05](05-building-blocks.md) onward). It
records the handful of fundamental technology and architecture decisions, each with a
one-line rationale and a link to its full Architecture Decision Record (ADR) in
[`docs/adr/`](../adr/README.md), where the context, alternatives, and consequences live.

## 4.1 Key decisions

| Decision | Rationale (one line) | ADR |
|----------|----------------------|-----|
| **Postgres + Drizzle ORM** (not MongoDB/Prisma) | Join-heavy relational domain (story ↔ chapter ↔ source ↔ genre) plus Vietnamese full-text search via `pg_trgm`; Drizzle is type-safe SQL with no client-codegen step. | [0001](../adr/0001-postgres-drizzle.md) |
| **NestJS API + Vite/React SPA split** (not Next.js full-stack) | BE/FE separation for clarity, independent build/deploy, and standard NestJS conventions; replaced the original Next.js stack from Plans 1–3. | [0002](../adr/0002-nestjs-vite-split.md) |
| **Bull + Redis queue** (not pg-boss) | Canonical NestJS queue (`@nestjs/bull`) with job priorities, retries/backoff, repeatable jobs, and a dead-letter path; matches the reference crawler project. Cost: one extra service (Redis). | [0003](../adr/0003-bull-redis-over-pgboss.md) |
| **Cheerio-first crawler with a `SourceAdapter` contract** | truyenfull serves static HTML, so cheerio (~50 ms/request) beats Playwright (~2 s/request, ~300 MB Chromium); the `requiresJs` flag leaves Playwright as a future per-source fallback. Adapters are pure HTML-in/data-out parsers; the engine owns fetch, rate-limit, retry, persistence. | [0004](../adr/0004-cheerio-first-crawler.md) |
| **Cover images as `bytea` in Postgres** (not object storage) | ~50 KB × ~hundreds of stories is negligible; keeps one source of truth and avoids a paid CDN/bucket. `/api/v1/cover/:storyId` serves with `Cache-Control: …, immutable` + ETag, so Cloudflare's edge absorbs the load. | [0005](../adr/0005-cover-bytea-in-postgres.md) |
| **Laptop self-host behind a Cloudflare Tunnel** (not managed cloud / VPS) | Flips cost from $5–40/mo to ~$3/mo electricity; the tunnel removes the need for a public IP or port-forwarding. Accepts residential-ISP downtime and single-point-of-failure as hobby-grade risk. Supersedes Plan 6 (Vercel/Railway/Neon/Upstash) and the never-executed Plan 8 (Hetzner VPS). | [0006](../adr/0006-laptop-self-host-cloudflare-tunnel.md) |
| **Custom webpack bundling for the NestJS app** | The default tsc builder cannot resolve the `@smanga/*` workspace packages' `.ts` schema imports; an explicit webpack config with package aliases + ts-loader does. | [0007](../adr/0007-webpack-ts-workspace-bundling.md) |
| **`immutable_unaccent` wrapper for the search index** | Postgres' built-in `unaccent()` is `STABLE`, not `IMMUTABLE`, so a GIN trigram index cannot use it directly; an `IMMUTABLE` wrapper function lets the accent-insensitive Vietnamese search index work. | [0008](../adr/0008-immutable-unaccent-search-index.md) |

## 4.2 How the decisions serve the goals

- **Read performance** (goal #1) is served by *cover-as-bytea + immutable caching* and by
  Cloudflare's edge sitting in front of the laptop — cacheable responses are answered at
  the edge, not by the home machine. Chapter text is stored gzipped to keep the DB small
  and reads cheap.
- **SEO** (goal #2) is enabled by the SPA-plus-API split exposing dedicated sitemap and
  `robots.txt` routes outside the `/api` prefix (the `seo` module).
- **Low cost** (goal #3) is the direct driver of *laptop self-host* and *cover-as-bytea*.
- **Operational simplicity** (goal #4) drives *Postgres as single source of truth* and the
  small, conventional NestJS service footprint; the price is the extra Redis service Bull
  needs and the bespoke webpack build.
- **Extensibility of sourcing** (goal #5) is the whole point of the *cheerio-first crawler
  with a `SourceAdapter` contract*: a new source is a new adapter, no engine changes.

## 4.3 Cross-cutting strategy

A few patterns apply across the whole system rather than to one decision; they are
documented in [§08 Crosscutting concepts](08-crosscutting-concepts.md):

- **Auth** — passport-jwt with the JWT carried in an httpOnly cookie (no Auth.js / Edge
  runtime constraints, since the Next.js stack was dropped).
- **Queue discipline** — job priorities, idempotent enqueue (`jobId`), retry/backoff, and a
  dead-letter table for terminal failures.
- **Config** — a Zod-validated env schema loaded once at boot, with a repo-root `.env`
  preloaded before module evaluation.
- **Runtime-tunable settings** — an `app_setting` singleton row lets the operator flip
  behaviour (e.g. `autoCrawlEnabled`, `autoCrawlWatermark`, `autoRefreshEnabled`,
  `autoRetryEnabled`) without a redeploy.

> **Sources:** the "Architectural decisions (the why)" and "Hard-won workarounds" sections
> of `CLAUDE.md`; verified against `apps/api/src/config/env.ts`,
> `apps/api/src/modules/covers/covers.controller.ts` (cover route + cache headers),
> `apps/api/src/main.ts` (SEO route exclusions), `packages/db/src/schema/app-setting.ts`
> (runtime flags), and the deploy assets under `deploy/home/`. Full context per decision
> lives in the linked ADRs (authored in `docs/adr/`).
