# Commands Reference

This page covers every runnable command in the monorepo: pnpm workspace scripts, the standalone crawler CLI, the health-probe script, and common Postgres/ops queries.

---

## pnpm workspace scripts

Run from the repo root unless noted. Source: root `package.json` and per-package `package.json` files.

### Root scripts

| Script | Command | Purpose |
|---|---|---|
| `pnpm build` | `pnpm -r build` | Build all packages/apps recursively |
| `pnpm typecheck` | `pnpm -r typecheck` | Run `tsc --noEmit` across all packages |
| `pnpm test` | `pnpm -r --workspace-concurrency=1 test` | Run all vitest suites sequentially |
| `pnpm test:watch` | `vitest` | Watch mode (interactive, for local dev) |
| `pnpm lint` | `biome check .` | Lint and check formatting with Biome |
| `pnpm format` | `biome format --write .` | Auto-format with Biome |
| `pnpm db:migrate` | `pnpm --filter @smanga/db migrate` | Apply pending Drizzle migrations (`tsx src/migrate.ts`) |
| `pnpm db:generate` | `pnpm --filter @smanga/db generate` | Generate a new migration from schema changes (`drizzle-kit generate`) |
| `pnpm db:seed` | `pnpm --filter @smanga/db seed` | Seed development data (`tsx src/seed.ts`) |
| `pnpm crawl` | `pnpm --filter @smanga/cli crawl` | Run the standalone crawler CLI (see below) |
| `pnpm dev:db` | `docker compose -f docker-compose.dev.yml up -d postgres redis` | Start local Postgres 16 + Redis 7 containers (prod runs Postgres 17) |
| `pnpm dev:api` | `pnpm --filter @smanga/api start:dev` | Start NestJS API in watch mode (`nest start --watch`) |
| `pnpm dev:frontend` | `pnpm --filter @smanga/frontend dev` | Start Vite dev server |

### Per-package scripts

#### `@smanga/api` (`apps/api/package.json`)

| Script | Purpose |
|---|---|
| `build` | `nest build` — Webpack bundle for production |
| `start` | `nest start` — Production start (no watch) |
| `start:dev` | `nest start --watch` — Watch mode with `RunScriptWebpackPlugin` restart |
| `start:prod` | `node dist/main` — Run compiled output |
| `test` | `vitest run` |
| `typecheck` | `tsc --noEmit` |

#### `@smanga/db` (`packages/db/package.json`)

| Script | Purpose |
|---|---|
| `generate` | `drizzle-kit generate` — Diff schema and produce a new migration SQL file |
| `migrate` | `tsx src/migrate.ts` — Apply all pending migrations (idempotent; runs on every API boot in prod) |
| `seed` | `tsx src/seed.ts` — Seed initial genres and a default source |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run` |

#### `@smanga/cli` (`apps/cli/package.json`)

| Script | Purpose |
|---|---|
| `crawl` | `tsx src/crawl.ts` — Standalone crawler (see below) |
| `health-probe` | `tsx src/health-probe.ts` — CI crawler health probe |
| `typecheck` | `tsc --noEmit` |

---

## Crawler CLI

Source: `apps/cli/` (`@smanga/cli`).

```powershell
# Import story metadata + discover the chapter list (does NOT crawl chapter content)
pnpm crawl <story-url>

# Import metadata + discover chapters AND crawl chapter content
pnpm crawl <story-url> --chapters
# (--all-chapters is an accepted alias for --chapters)

# Example
pnpm crawl https://truyenfull.today/ten-truyen/ --chapters
```

Usage (from `apps/cli/src/crawl.ts`): `pnpm crawl <story-url> [--chapters]`.

The CLI imports `{ importStory, fetchAllPendingChapters }` from `@smanga/crawler`. It:
1. Calls `importStory(db, url)` — imports story metadata and discovers the chapter
   list (which internally resolves the adapter, persists the story row + cover +
   genres, and inserts the `pending` chapter rows). This does **not** crawl chapter
   content.
2. **Only when `--chapters` (or `--all-chapters`) is passed**, calls
   `fetchAllPendingChapters(db, result.storyId)` to crawl the content of every
   pending chapter.

A default run (no flag) leaves chapters at `status='pending'`.

Environment variables required when running the CLI:

```powershell
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
```

---

## Health probe

```powershell
pnpm --filter @smanga/cli health-probe
```

Used by `.github/workflows/crawler-health-probe.yml`. Checks that the crawler can reach `truyenfull.today` and parse a known-good page. Exits non-zero on failure so CI can alert on source site changes.

---

## Database commands

### Migrations

```powershell
# 1. Edit schema files under packages/db/src/schema/
# 2. Generate migration
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:generate

# 3. Review the generated SQL in packages/db/src/migrations/
# 4. Apply
pnpm db:migrate
```

The migration journal is at `packages/db/src/migrations/meta/`. Migrations are idempotent — the API container runs `pnpm --filter @smanga/db migrate` on every boot before starting the server.

### Seed

```powershell
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:seed
```

Seeds initial genres (from `truyenfull`) and the `truyenfull` source row. Safe to re-run (uses upsert).

---

## Typecheck

```powershell
# All packages
pnpm typecheck

# Single package
pnpm --filter @smanga/api typecheck
pnpm --filter @smanga/frontend typecheck
pnpm --filter @smanga/db typecheck
```

---

## Tests

```powershell
# All suites
pnpm test

# Single package
pnpm --filter @smanga/db test
pnpm --filter @smanga/crawler test
pnpm --filter @smanga/shared test

# Watch mode (root)
pnpm test:watch
```

The test suite uses Vitest. DB tests use `@testcontainers/postgresql` (spins up a real Postgres container). Total: ~30 unit tests across `db`, `crawler`, and `shared`.

---

## Common Postgres/ops queries

Run against the development database via:

```powershell
docker exec smanga-postgres psql -U smanga -d smanga -c "<query>"
```

Or in production (SSH into the laptop, then):

```bash
docker exec home-postgres-1 psql -U smanga -d smanga -c "<query>"
```

### Story counts

```sql
-- Total stories
SELECT COUNT(*) FROM story;

-- By discovery status
SELECT discovery_status, COUNT(*) FROM story GROUP BY discovery_status;

-- Stories with pending or failed chapters (needs-crawl)
SELECT COUNT(*) FROM story
WHERE EXISTS (
  SELECT 1 FROM chapter
  WHERE chapter.story_id = story.id
    AND chapter.status IN ('pending', 'failed')
);
```

### Chapter crawl state

```sql
-- Pending chapters per story (top 20)
SELECT story_id, COUNT(*) AS pending
FROM chapter
WHERE status = 'pending'
GROUP BY story_id
ORDER BY pending DESC
LIMIT 20;

-- Failed chapters
SELECT story_id, last_error, COUNT(*)
FROM chapter
WHERE status = 'failed'
GROUP BY story_id, last_error
ORDER BY COUNT(*) DESC;
```

### Admin user bootstrap

```powershell
# 1. Register (API must be running)
curl.exe -X POST http://localhost:3001/api/v1/auth/register `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"admin@test.com\",\"password\":\"adminpassword\",\"name\":\"Admin\"}'

# 2. Grant admin role
docker exec smanga-postgres psql -U smanga -d smanga `
  -c "UPDATE \"user\" SET role='admin' WHERE email='admin@test.com';"
```

### Dead-letter queue

```sql
-- Overview by status
SELECT status, COUNT(*) FROM job_failure GROUP BY status;

-- Pending retries due soon
SELECT dedup_key, job_name, retry_generation, next_retry_at
FROM job_failure
WHERE status = 'pending' AND next_retry_at <= now()
ORDER BY next_retry_at
LIMIT 20;
```

### App settings

```sql
-- View current settings
SELECT * FROM app_setting WHERE id = 1;

-- Enable auto-crawl drainer (alternative to admin UI)
UPDATE app_setting SET auto_crawl_enabled = true WHERE id = 1;
```

### Reset local dev database

```powershell
docker compose -f docker-compose.dev.yml down -v
pnpm dev:db
# Wait for containers to be healthy, then:
pnpm db:migrate
pnpm db:seed
```

---

## Queue inspection

There is no standalone queue dashboard (no Bull Board) mounted on the API. Inspect
the Bull queue through the admin **Jobs** page at `/admin/jobs`, which is backed by
`GET /api/v1/jobs` (paginated job listing) and `GET /api/v1/jobs/stats` (active /
waiting / completed / failed counts). See `apps/api/src/modules/jobs/jobs.controller.ts`.

For low-level inspection without the UI, query the Postgres-backed dead-letter table
(`job_failure`) directly — see the "Dead-letter queue" queries below.

---

## Smoke checklist before pushing

```powershell
pnpm test           # all vitest suites pass
pnpm typecheck      # no TypeScript errors
pnpm lint           # no Biome errors
```

Manual checks (requires running dev stack):
- Sign in to `/admin`, import a story, trigger discover, check chapters crawl.
- Open a chapter in the reader — content renders without error.
- Check Swagger at `http://localhost:3001/api/docs`.

See `docs/operations.md` for the full reader sanity checklist and `docs/home-runbook.md` for production operations.
