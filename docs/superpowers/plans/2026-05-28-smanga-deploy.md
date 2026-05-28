# SManga Deploy Phase 1 Implementation Plan (Plan 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Prerequisites:** Plan 4 (NestJS rework) and Plan 5 (search + user features) must be complete.

**Goal:** Ship SManga to the public internet on free/cheap tiers. Vite frontend on Vercel, NestJS API on Railway, Postgres on Neon, Redis on Upstash. GitHub Actions for CI (typecheck + tests + e2e). Cost target: $0/mo phase 1, scaleable to ~$10/mo before needing VPS migration.

**Architecture:** Three deployable units, each with its own env config and deploy pipeline:
- **Vercel** — static Vite build of `apps/frontend`. Custom domain (optional) `smanga.example`. Env: `VITE_API_BASE_URL`.
- **Railway** — Node service running `pnpm --filter @smanga/api start:prod`. Includes the Bull worker (same process — single dyno is fine for hobby scale). Env: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `FRONTEND_BASE_URL`.
- **Neon Postgres** — managed Postgres. Free tier 3GB. Apply migrations on deploy via Railway start command.
- **Upstash Redis** — managed Redis with REST + native protocol. Free tier 10k commands/day (Bull volumes are modest at hobby scale).

CI: GitHub Actions workflow runs typecheck, unit tests, and a smoke run against testcontainers Postgres on every PR. Production deploys are git-push-triggered (Vercel + Railway both watch the `main` branch).

**Tech Stack:** No new app dependencies. Adds GitHub Actions YAML + Dockerfile (Railway) + `vercel.json` (frontend build).

---

## File structure

```
.github/workflows/
  ci.yml                              typecheck + unit + db integration on PR
apps/api/
  Dockerfile                          Railway uses this OR Nixpacks autodetect
apps/frontend/
  vercel.json                         Vercel build/output config
docs/
  deploy.md                           Step-by-step deploy runbook
scripts/
  release-migrate.sh                  Optional manual migration runner
```

---

### Task 1: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: smanga
          POSTGRES_PASSWORD: smanga_dev
          POSTGRES_DB: smanga
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U smanga"
          --health-interval 3s --health-timeout 3s --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 3s --health-timeout 3s --health-retries 10

    env:
      DATABASE_URL: postgres://smanga:smanga_dev@localhost:5432/smanga
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: ci-test-secret-please-rotate-please-rotate

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile

      - name: Typecheck all packages
        run: pnpm typecheck

      - name: Unit + integration tests
        run: pnpm test

      - name: Build apps
        run: |
          pnpm --filter @smanga/api build
          pnpm --filter @smanga/frontend build
```

Note: requires `pnpm typecheck` and `pnpm test` scripts at the root. The root `package.json` already has both (run `pnpm -r typecheck` and `vitest run`).

- [ ] **Step 2: Verify locally first**

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm --filter @smanga/api build
pnpm --filter @smanga/frontend build
```

All must pass before pushing the workflow file. If `--frozen-lockfile` fails, regenerate the lockfile (`pnpm install`) and commit.

- [ ] **Step 3: Commit + push**

```
git add .github/workflows/ci.yml
git commit -m "ci: typecheck + tests + build matrix on PR and main push"
git push origin main
```

Watch the Actions tab on GitHub — first run should pass. If it fails, fix and push again.

---

### Task 2: API Dockerfile for Railway

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/api/.dockerignore`

Railway will autodetect via Nixpacks if no Dockerfile is present, but explicit is safer for a pnpm monorepo.

- [ ] **Step 1: `apps/api/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7

# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy lockfile + workspace manifests for cache-friendly install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json biome.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/crawler/package.json packages/crawler/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY packages/crawler packages/crawler
COPY apps/api apps/api

WORKDIR /repo/apps/api
RUN pnpm build

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

ENV NODE_ENV=production

# Re-copy only what's needed for prod runtime
COPY --from=builder /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=builder /repo/packages packages
COPY --from=builder /repo/apps/api apps/api

# Install prod deps only
RUN pnpm install --prod --frozen-lockfile --filter @smanga/api...

EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
```

- [ ] **Step 2: `apps/api/.dockerignore`**

```
node_modules
dist
.env
.env.local
.env.development
*.log
test
coverage
```

- [ ] **Step 3: Build locally**

```powershell
docker build -t smanga-api:local -f apps/api/Dockerfile .
docker run --rm -p 3001:3001 `
  -e DATABASE_URL="postgres://host.docker.internal:5432/smanga" `
  -e REDIS_URL="redis://host.docker.internal:6379" `
  -e JWT_SECRET="local-test-secret-please-rotate-please-rotate" `
  smanga-api:local
curl.exe http://localhost:3001/api/docs -I
```

Expected: container builds in ~3-5 min on first build (subsequent <1 min via cache); `/api/docs` returns 200.

- [ ] **Step 4: Commit**

```
git add apps/api/Dockerfile apps/api/.dockerignore
git commit -m "feat(api): production Dockerfile for Railway deploy"
```

---

### Task 3: Vercel frontend config

**Files:**
- Create: `apps/frontend/vercel.json`

- [ ] **Step 1: Write `apps/frontend/vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @smanga/frontend build",
  "outputDirectory": "dist",
  "installCommand": "true",
  "framework": null,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://smanga-api.up.railway.app/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Replace `smanga-api.up.railway.app` with the actual Railway-assigned domain (set after Task 4). For now leave the placeholder — Task 5 documents the update.

- [ ] **Step 2: Update `apps/frontend/src/lib/api-client.ts`** (only if Plan 4 hardcoded `/api/v1` — should be fine; rewrite handles the proxy).

If you need to switch between same-origin and explicit base URL:

```typescript
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
```

In Vercel env vars, set `VITE_API_BASE_URL=https://smanga-api.up.railway.app/api/v1` (or rely on the rewrite — pick one approach and stick with it). The rewrite approach is simpler because cookies stay first-party (no cross-domain cookie pain).

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "feat(frontend): vercel.json with API rewrite to railway"
```

---

### Task 4: Provision cloud services (manual, document the steps)

This task is mostly clicking through dashboards. It's not code; it's `docs/deploy.md`.

**Files:**
- Create: `docs/deploy.md`

- [ ] **Step 1: Write `docs/deploy.md`**

````markdown
# SManga Deploy Runbook (Phase 1)

Targets: Vercel (frontend) + Railway (API + worker) + Neon (Postgres) + Upstash (Redis).

## 1. Neon Postgres

1. Sign in at https://neon.tech.
2. Create project `smanga`. Region: choose nearest to Railway region.
3. Copy the connection string under "Connection details" → use the **pooled** URL for `DATABASE_URL` (suffix `-pooler`).
4. On first connection, install extensions (Neon allows these):
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE EXTENSION IF NOT EXISTS unaccent;
   ```
   (Or rely on the Plan 1 migrations — confirm migration `0001_*` includes the `CREATE EXTENSION` lines.)
5. Save the URL — needed by Railway and one-time local migration.

## 2. Upstash Redis

1. Sign in at https://upstash.com.
2. Create database `smanga-queue`. Region: match Railway.
3. Pick the **native Redis URL** (NOT the REST URL) — Bull uses native protocol. Format: `rediss://default:<password>@<host>:<port>`.
4. Save it — needed by Railway as `REDIS_URL`.

## 3. Railway API

1. Sign in at https://railway.app. Create project, "Deploy from GitHub repo".
2. Point at the SManga repo, branch `main`, Root Directory `/`. Railway will detect the Dockerfile at `apps/api/Dockerfile` (or use Nixpacks if Dockerfile detection fails — that's fine too).
3. **Settings → Service Settings → Custom Build Command:** leave empty (Dockerfile handles it).
4. **Settings → Service Settings → Start Command:** `node apps/api/dist/main.js`.
5. Add environment variables under **Variables**:
   ```
   DATABASE_URL=<neon-pooled-url>
   REDIS_URL=<upstash-rediss-url>
   JWT_SECRET=<64-char-hex>
   FRONTEND_BASE_URL=https://<vercel-domain>   # update after Vercel deploy
   PORT=3001
   NODE_ENV=production
   ```
6. Generate `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — Different value from local dev.
7. **Generate a public domain** — Settings → Networking → Generate Domain. Save it (e.g. `smanga-api.up.railway.app`). Update `apps/frontend/vercel.json` rewrite and `FRONTEND_BASE_URL` later.
8. Push a tiny change to `main` to trigger the first deploy. Watch the build log.
9. Once "Active", hit `https://<railway-domain>/api/docs` — Swagger UI should load.

## 4. Run migrations (one-time, after Railway domain is live)

Locally, pointing at Neon:

```powershell
$env:DATABASE_URL = "<neon-pooled-url>"
pnpm db:migrate
pnpm db:seed
```

Verify:
```powershell
psql "$env:DATABASE_URL" -c "SELECT id, name FROM source;"
# expected: truyenfull row
```

## 5. Vercel frontend

1. Sign in at https://vercel.com. "Add new project" → "Import Git Repository" → select SManga repo.
2. **Framework Preset:** Other (we override with vercel.json).
3. **Root Directory:** `apps/frontend`.
4. **Build Command, Install Command, Output Directory:** leave empty — `vercel.json` controls them.
5. Environment Variables — if using the rewrite approach (recommended): no env vars needed. If using `VITE_API_BASE_URL` directly: add `VITE_API_BASE_URL=https://<railway-domain>/api/v1`.
6. Deploy. Vercel will produce a domain like `smanga.vercel.app`.
7. **Update Railway** `FRONTEND_BASE_URL=https://<vercel-domain>`, redeploy.
8. **Update `apps/frontend/vercel.json`** with the real Railway domain in the rewrite; commit and push to trigger Vercel rebuild.

## 6. Bootstrap admin user on prod

```powershell
curl.exe -X POST https://<railway-domain>/api/v1/auth/register `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"<your-email>\",\"password\":\"<strong-password>\",\"name\":\"Admin\"}'

# Then connect to Neon to promote:
psql "<neon-pooled-url>" -c "UPDATE \"user\" SET role='admin' WHERE email='<your-email>';"
```

Visit `https://<vercel-domain>/dang-nhap` and sign in. You should reach `/admin`.

## 7. Smoke checklist (prod)

- [ ] `https://<vercel-domain>/` loads, story grid renders
- [ ] `https://<vercel-domain>/dang-nhap` accepts admin login
- [ ] `/admin/sources` lists `truyenfull`
- [ ] Import a story → `/admin/jobs` shows it completing
- [ ] Click chapter → content loads
- [ ] `/sitemap.xml` returns valid XML
- [ ] `/robots.txt` returns expected disallows

## 8. Custom domain (optional)

1. In Vercel project → Domains → Add `smanga.example` (or whatever you bought). Follow DNS instructions.
2. In Railway → Networking → Custom Domain → `api.smanga.example`. Follow DNS instructions.
3. Update Vercel env `VITE_API_BASE_URL` (if used) and `vercel.json` rewrite.
4. Update Railway env `FRONTEND_BASE_URL`.

## 9. Cost tracking

| Service | Free tier | Likely ceiling at hobby scale |
|---|---|---|
| Vercel | 100GB bandwidth/mo | Far under |
| Railway | $5 starter credit/mo | API + worker fits |
| Neon | 3 GB storage, 1 project | Sufficient for ~1000 stories with gzipped chapter content |
| Upstash | 10k commands/day | Bull queue at hobby load is well under |

When Neon hits 70% capacity → migrate to self-hosted Postgres on a VPS (Hetzner CX22 €4/mo). The architecture is portable: same Drizzle schema, same connection string format.

## 10. Rollback

- Vercel: dashboard → Deployments → previous → "Promote to Production"
- Railway: dashboard → Deployments → previous → "Redeploy"
- DB migrations are forward-only (Drizzle convention) — if a migration is wrong, write a corrective migration. Don't roll back schema.
````

- [ ] **Step 2: Commit**

```
git add docs/deploy.md
git commit -m "docs: phase 1 deploy runbook (vercel + railway + neon + upstash)"
```

---

### Task 5: First deploy — execute the runbook

This task IS the runbook execution. It produces no code; just config in cloud dashboards. Follow `docs/deploy.md` end-to-end.

- [ ] **Step 1:** Sign up + provision Neon, Upstash (Sections 1-2 of runbook).
- [ ] **Step 2:** Push current `main` to GitHub if not already there. Set up Railway project (Section 3).
- [ ] **Step 3:** Run migrations against Neon (Section 4).
- [ ] **Step 4:** Set up Vercel project, deploy (Section 5).
- [ ] **Step 5:** Update cross-references (Vercel ↔ Railway URLs) in env vars (Section 5 step 7-8).
- [ ] **Step 6:** Bootstrap admin (Section 6).
- [ ] **Step 7:** Run smoke checklist (Section 7).
- [ ] **Step 8:** Commit any config tweaks (`vercel.json` URL update, `apps/frontend/src/lib/api-client.ts` env handling, etc.):

```
git add -A
git commit -m "chore: deploy phase 1 — update vercel rewrite to live railway domain"
```

---

### Task 6: Production observability hooks

**Files:**
- Modify: `apps/api/src/main.ts` (add basic request logging)
- Create: `apps/api/src/modules/health/health.controller.ts`

- [ ] **Step 1: Health endpoint**

`apps/api/src/modules/health/health.controller.ts`:

```typescript
import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '@smanga/db';
import { DRIZZLE } from '@/modules/db/db.provider';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async check() {
    let dbOk = false;
    try {
      await this.db.execute(sql`SELECT 1`);
      dbOk = true;
    } catch {}
    return {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
```

Add `HealthModule` (`@Module({ controllers: [HealthController] })`) and register in `app.module.ts`.

- [ ] **Step 2: Configure Railway health check**

Railway dashboard → Settings → Healthcheck Path: `/api/v1/health`. Healthcheck interval 30s.

- [ ] **Step 3: Verify**

```powershell
curl.exe https://<railway-domain>/api/v1/health
# expected: {"status":"ok","db":true,"uptime":...}
```

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(api): /api/v1/health endpoint for railway healthcheck"
```

---

## Self-review

**Coverage:**
- ✅ CI on every PR — Task 1
- ✅ API containerized for Railway — Task 2
- ✅ Frontend deployable to Vercel — Task 3
- ✅ Step-by-step provisioning runbook — Task 4
- ✅ Executed first deploy — Task 5
- ✅ Health endpoint + Railway healthcheck — Task 6

**Not covered (defer to future):**
- Sentry / error reporting — plug in via `@sentry/node` when traffic justifies
- Prometheus metrics — manga-crawler reference uses `prom-client`; add when needed
- Multi-region deploys — out of scope phase 1
- Backup automation — Neon has point-in-time recovery on paid plan; phase 2 if needed
- Blue/green or canary deploys — Vercel + Railway both rollback well; not needed phase 1
- Phase 2 VPS migration (Docker Compose on Hetzner) — separate plan when Neon quota tight

**Risks:**
- The `apps/frontend/vercel.json` rewrite hardcodes the Railway domain. If Railway rotates domains (rare), update + redeploy. Custom domain (Section 8) avoids this.
- Bull on Upstash free tier: 10k commands/day. At 1 chapter crawl per second sustained, you'd hit it in ~3 hours. Real usage (admin clicks "Crawl missing" occasionally) is well under. If you hit it, Upstash paid is $0.20/100k commands.
- Cold start on Railway: first request after idle takes ~3-5s. For a hobby site that's tolerable; if not, Railway has a "Replicas: 1 always-on" setting at small extra cost.
- Migrations applied locally pointing at Neon — there's a window where API is running on the OLD schema while you apply migrations. For phase 1 hobby use, run migrations BEFORE first deploy (Section 4 happens before Section 3 final). For zero-downtime later, switch to a migration job in Railway's start command.
- `serverExternalPackages: ['bcrypt']` from legacy Next.js is removed by Plan 4. In NestJS bcryptjs (pure JS) replaces bcrypt — no native compilation issues in the Railway image.

**Estimated effort:** 6 tasks, mostly config and dashboard work. ~1 hour wall-clock if accounts and DNS are already set up.
