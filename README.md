# SManga
[![CI](https://github.com/SUN-0207/SManga/actions/workflows/ci.yml/badge.svg)](https://github.com/SUN-0207/SManga/actions/workflows/ci.yml)
[![Build images](https://github.com/SUN-0207/SManga/actions/workflows/build-images.yml/badge.svg)](https://github.com/SUN-0207/SManga/actions/workflows/build-images.yml)
[![Crawler health](https://github.com/SUN-0207/SManga/actions/workflows/crawler-health-probe.yml/badge.svg)](https://github.com/SUN-0207/SManga/actions/workflows/crawler-health-probe.yml)
![Last commit](https://img.shields.io/github/last-commit/SUN-0207/SManga/main)
![Repo size](https://img.shields.io/github/repo-size/SUN-0207/SManga)

## Stack

NestJS 11 · Vite + React 19 · Drizzle + Postgres 17 · Bull + Redis 7 · Tailwind 3 · Biome 1 · pnpm workspace · Docker Compose · Cloudflare Tunnel

## Quick start

```powershell
pnpm install
pnpm dev:db          # postgres + redis via docker-compose.dev.yml
pnpm db:migrate      # apply Drizzle migrations
pnpm db:seed         # seed sources + admin
pnpm dev:api         # NestJS on http://localhost:3001 (Swagger /api/docs)
pnpm dev:frontend    # Vite on http://localhost:3000
```

Full runbook: [`docs/operations.md`](docs/operations.md).

## Layout

```
packages/
  db/         Drizzle schema + migrations + client
  shared/     Zod schemas, SourceAdapter contract, errors, job payloads
  crawler/    Engine + adapters (currently truyenfull)
apps/
  api/        NestJS — auth, sources, stories, chapters, covers, jobs, comments, etc.
  frontend/   Vite + React reader site + admin
  cli/        `pnpm crawl <url>` + `pnpm --filter @smanga/cli health-probe`
deploy/
  home/       Self-hosted laptop deploy (compose + Caddy + cloudflared + R2 backup)
design-system/
  smanga/     Token + page overrides (ui-ux-pro-max skill output)
docs/
  superpowers/specs/   Approved feature specs
  superpowers/plans/   Implementation plans
  home-runbook.md      Operational runbook for the laptop deploy
  operations.md        Local dev runbook
```

## Project context for AI assistants

[`CLAUDE.md`](CLAUDE.md) at the repo root carries every workaround, naming convention, and architectural decision an agent (or new contributor) needs before touching code.

## License

Private — not currently open source. The codebase is single-author hobby project.
