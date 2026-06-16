# 1. Introduction and goals

← back to [architecture index](00-index.md)

## 1.1 What SManga is

SManga is a **Vietnamese online novel reader** (web đọc truyện chữ). It crawls novels and
their chapters from an external source site — currently `truyenfull.today` — persists them
in Postgres, and serves them to two audiences:

- a **public reader site** (SEO-friendly, fast, no login required to read), and
- an **admin operator** who manages crawl sources, imports stories, triggers and monitors
  crawl jobs, curates featured content, and moderates comments.

Both audiences are served by a single React single-page app (`apps/frontend`) talking to a
single NestJS API (`apps/api`); the admin surface lives under `/admin` routes, gated by an
`admin` role rather than being a separate application.

It is a **single-author hobby project** (owner `son.cu@opswat.com`), targeting on the order
of 100–1000 readers, deliberately kept cheap to run. The crawler is built to be
**multi-source-capable**: a new source is a new adapter implementing the `SourceAdapter`
contract from `@smanga/shared`, without touching the engine.

## 1.2 Quality goals

The design optimises, in priority order, for:

| # | Quality goal | What it means here | Where it is realised |
|---|--------------|--------------------|----------------------|
| 1 | **Read performance** | Reader pages and chapter content load fast for anonymous visitors, even on a home-laptop backend. | Cloudflare edge cache + `Cache-Control`/ETag on cacheable responses; covers served immutable from `/api/v1/cover/:storyId`; chapter text stored gzipped (bytea) and decompressed server-side; frontend code-splitting. See [§08](08-crosscutting-concepts.md). |
| 2 | **SEO / discoverability** | Story and chapter pages are crawlable by search engines so the catalog gets organic traffic. | Dedicated non-versioned routes `sitemap.xml`, `sitemap-stories.xml`, `sitemap-chapters.xml`, `sitemap-chapters-:n.xml`, `robots.txt` excluded from the `/api` global prefix in `apps/api/src/main.ts`; the `seo` module generates them. |
| 3 | **Low running cost** | Run for roughly the cost of a laptop's electricity (~$3/mo), no managed-cloud bills. | Self-host on a home laptop behind a free Cloudflare Tunnel (Plan 9); cover images stored as `bytea` in Postgres instead of paid object storage. See [§07](07-deployment-view.md) and [ADR 0006](../adr/0006-laptop-self-host-cloudflare-tunnel.md). |
| 4 | **Operational simplicity** | One person can understand, operate, and recover the whole stack. | Five-container Docker Compose; migrations run idempotently on every API boot; nightly `pg_dump` backups; push-to-`main` auto-deploys via GHCR + Watchtower. Postgres is the single source of truth (`bytea` covers, gzipped chapter text). |
| 5 | **Extensibility of sourcing** | Add a new crawl source without reworking the engine. | The `SourceAdapter` contract (HTML-in, parsed-data-out) + per-source folder + adapter registry. See [§05](05-building-blocks.md) and [ADR 0004](../adr/0004-cheerio-first-crawler.md). |

These goals trade against each other: cost and simplicity (goals 3–4) are why the system
runs on a single home laptop with **no staging environment** and a residential ISP as a
single point of failure — see [§02 Constraints](02-constraints.md) and
[§09 Quality and risks](09-quality-and-risks.md).

## 1.3 Stakeholders

| Role | Description | Cares about |
|------|-------------|-------------|
| **Owner / operator** (`son.cu@opswat.com`) | Sole developer and admin. Bootstraps an `admin` user, imports stories, runs and watches crawl jobs, curates and moderates, operates the laptop deployment. | Low cost, simple operation, accuracy of crawled content, not breaking prod (`smanga.shop`) on every push. |
| **Readers** | Anonymous and registered Vietnamese-novel readers using a browser. Registered users get bookmarks, reading progress, ratings, and commenting. | Fast page loads, finding stories (search, genres, rankings), uninterrupted reading. |
| **Search engines** | Crawl the public reader pages via the sitemaps and `robots.txt`. | Crawlable, stable URLs and sitemaps. |

> **Sources:** product purpose and scope from the design spec
> `docs/superpowers/specs/2026-05-28-smanga-design.md` (§1) and the current state recorded
> in `CLAUDE.md`; quality-goal mechanisms verified against `apps/api/src/main.ts`,
> `apps/api/src/modules/seo/*`, and `apps/api/src/modules/covers/*`. Note: the 2026-05-28
> spec describes the original Next.js stack; the current stack (NestJS + Vite, per Plan 4)
> and laptop self-host (Plan 9) are the authority for everything here.
