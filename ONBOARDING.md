# SManga — Day 1 Onboarding

Welcome to SManga, a self-hosted Vietnamese novel reader. This guide gets you from a fresh clone to a running local environment in about 15 minutes.

## What is SManga?

SManga crawls Vietnamese web novels from [truyenfull.today](https://truyenfull.today), persists them in Postgres, and serves them to readers via a Vite/React SPA backed by a NestJS REST API. An admin operator manages sources, triggers crawl jobs, and curates featured content. The production instance runs on a home laptop behind a Cloudflare Tunnel at <https://smanga.shop>.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | >= 20 | Check with `node -v` |
| pnpm | 9.x | Install with `npm i -g pnpm` |
| Docker Desktop | any recent | Runs Postgres 17 + Redis 7 locally |

**Windows / PowerShell note:** The dev API defaults to `PORT=3001`, but OPSWAT tooling occupies that port on developer machines. Set `$env:PORT = 3010` (and update `vite.config.ts` proxy target to `http://localhost:3010`) or use the value already committed in `vite.config.ts` — the proxy target there is already `http://localhost:3010`. When you see `PORT=3001` in the ops docs, substitute `3010` on Windows dev.

## Get it running

Open four PowerShell terminals, all at the repo root.

### Terminal 1 — databases

```powershell
pnpm install          # first-time only — installs all workspace deps
pnpm dev:db           # starts postgres:17 + redis:7 via docker-compose.dev.yml
```

### Terminal 2 — migrations + seed (one-time per fresh DB)

```powershell
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:migrate       # applies all Drizzle migrations
pnpm db:seed          # seeds sources table + default app_settings
```

### Terminal 3 — NestJS API

```powershell
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
$env:REDIS_URL     = "redis://localhost:6379"
$env:JWT_SECRET    = "dev-secret-min-16-chars"   # any 16+ char string
$env:PORT          = 3010                         # avoid OPSWAT :3001 conflict
pnpm dev:api
```

The API starts on `http://localhost:3010` with hot-reload (webpack watch + `RunScriptWebpackPlugin`). Swagger UI is at `http://localhost:3010/api/docs`.

### Terminal 4 — Vite frontend

```powershell
pnpm dev:frontend     # Vite dev server on http://localhost:3000
```

The Vite proxy in `apps/frontend/vite.config.ts` forwards `/api` requests to `http://localhost:3010`.

### Bootstrap an admin user

After the API is up:

```powershell
# 1. Register the account
curl.exe -X POST http://localhost:3010/api/v1/auth/register `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"admin@test.com\",\"password\":\"adminpassword\",\"name\":\"Admin\"}'

# 2. Promote to admin in Postgres
docker exec smanga-postgres psql -U smanga -d smanga `
  -c "UPDATE \"user\" SET role='admin' WHERE email='admin@test.com';"
```

Note: the email must contain a real TLD (`admin@test.com`, not `admin@test`).

## Smoke test

| Check | URL |
|-------|-----|
| Landing page (story grid) | <http://localhost:3000> |
| Swagger UI | <http://localhost:3010/api/docs> |
| Admin dashboard | <http://localhost:3000/admin> |

Manually: click a story, click a chapter, verify content renders. Click "Cài đặt" in the chapter reader to toggle dark mode and font size — preferences should persist on refresh.

## Your first change

A good low-risk first change is tweaking a UI label in the frontend. Try editing a string in `apps/frontend/src/routes/index.tsx`. Vite's hot-module-replacement (HMR) applies the change in the browser within a second — no full page refresh needed.

The API also hot-reloads: edit any file under `apps/api/src/` and the NestJS process restarts automatically (via `RunScriptWebpackPlugin` in `apps/api/webpack.config.js`).

## Monorepo tour

```
packages/
  db/        Drizzle ORM schema, migrations, client (Postgres 17)
  shared/    Zod schemas, SourceAdapter contract, error classes, job payload types
  crawler/   Crawler engine (fetcher, rate-limiter, cover downloader) + truyenfull adapter

apps/
  api/       NestJS 11 — all REST endpoints, Bull queue processors, crawl jobs
  frontend/  Vite + React 19 — reader site + admin UI (TanStack Router + Query)
  cli/       `pnpm crawl <url>` standalone CLI; also the crawler health-probe command

deploy/
  home/      Docker Compose prod config, Caddyfile, cloudflared config, backup scripts

design-system/
  smanga/    Design tokens (MASTER.md + per-page overrides) — source of truth for UI

docs/
  architecture/      arc42 architecture documentation (§01–§10)
  business-logic/    Domain model, crawling rules, engagement, admin flows
  reference/         Data model, API surface, configuration, commands
  how-to/            Step-by-step guides for common dev tasks
  adr/               Architecture Decision Records (MADR format)
  operations.md      Local dev runbook (full detail)
  home-runbook.md    Production ops runbook (laptop deploy)
  deploy.md          Deployment overview
```

## Where to go next

| Topic | Document |
|-------|---------|
| Full local-dev runbook | [`docs/operations.md`](docs/operations.md) |
| Docs map (all docs, by type) | [`docs/README.md`](docs/README.md) |
| Architecture overview (arc42) | [`docs/architecture/00-index.md`](docs/architecture/00-index.md) |
| Domain model + business rules | [`docs/business-logic/domain-model.md`](docs/business-logic/domain-model.md) |
| REST API reference | [`docs/reference/api.md`](docs/reference/api.md) |
| Environment variables | [`docs/reference/configuration.md`](docs/reference/configuration.md) |
| Add a new crawler source | [`docs/how-to/add-a-new-crawler-source.md`](docs/how-to/add-a-new-crawler-source.md) |
| Add a DB migration | [`docs/how-to/add-a-database-migration.md`](docs/how-to/add-a-database-migration.md) |
| Testing + CI | [`docs/how-to/testing-and-ci.md`](docs/how-to/testing-and-ci.md) |
| Production ops + deployment | [`docs/home-runbook.md`](docs/home-runbook.md) |
| AI assistant context | [`CLAUDE.md`](CLAUDE.md) |
