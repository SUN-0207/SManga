# Configuration Reference

Configuration comes from two sources:

1. **Environment variables** — loaded at startup by `apps/api/src/config/env.ts` (via Zod validation) and referenced in `deploy/home/docker-compose.prod.yml`.
2. **Runtime `app_setting` table** — a single-row Postgres table editable from `/admin/settings` without a redeploy.

---

## Environment variables

Source: `apps/api/src/config/env.ts`, `deploy/home/.env.example`, `deploy/home/docker-compose.prod.yml`.

All variables are parsed and validated with Zod on API boot. The API process exits immediately if any required variable is missing or invalid.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Postgres connection string. Format: `postgres://user:pass@host:port/db`. Example: `postgres://smanga:smanga_dev@localhost:5432/smanga`. |
| `REDIS_URL` | Yes | — | Redis connection string. Example: `redis://localhost:6379`. Used by Bull queue (`@nestjs/bull`) and `ioredis`. |
| `JWT_SECRET` | Yes | — | Signing secret for JWT cookies. Minimum 16 characters. Generate with `openssl rand -base64 32`. |
| `PORT` | No | `3001` | HTTP port the NestJS API listens on. **Local dev on OPSWAT machines: set to `3010`** because OPSWAT software holds `:3001`. |
| `NODE_ENV` | No | `development` | One of `development`, `test`, `production`. Controls cookie `secure` flag and logging format. |
| `DB_POOL_MAX` | No | `10` | Maximum Postgres connection pool size. Prod compose sets this to `25`. |
| `FRONTEND_BASE_URL` | No | `http://localhost:3000` | Used for CORS and Google OAuth redirect. Prod value: `https://smanga.shop`. |
| `LOG_LEVEL` | No | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`). |
| `AUTH_GOOGLE_ID` | No | — | Google OAuth client ID. If both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set, the Google login button is enabled. |
| `AUTH_GOOGLE_SECRET` | No | — | Google OAuth client secret. |
| `AUTH_GOOGLE_CALLBACK_URL` | No | — | Google OAuth redirect URI registered in Google Cloud Console. Prod: `https://smanga.shop/api/v1/auth/google/callback`. |
| `NODE_OPTIONS` | No | — | V8/Node runtime flags. Prod compose sets `--max-old-space-size=1024` to cap the V8 heap at 1 GB. |
| `GHCR_OWNER` | Prod only | — | GitHub username / org owning the container images (e.g. `sun-0207`). Used in `docker-compose.prod.yml` image references. |
| `POSTGRES_PASSWORD` | Prod only | — | Postgres superuser password injected into the `postgres` compose service and the `DATABASE_URL` template. |

### Local development `.env` example

```bash
DATABASE_URL=postgres://smanga:smanga_dev@localhost:5432/smanga
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev_secret_replace_me
PORT=3010
FRONTEND_BASE_URL=http://localhost:3000
```

---

## Production compose environment

The production `deploy/home/docker-compose.prod.yml` sets these variables on the `api` service:

```yaml
NODE_ENV: production
PORT: "3001"
NODE_OPTIONS: "--max-old-space-size=1024"
DB_POOL_MAX: "25"
DATABASE_URL: postgres://smanga:${POSTGRES_PASSWORD}@postgres:5432/smanga
REDIS_URL: redis://redis:6379
JWT_SECRET: ${JWT_SECRET}
FRONTEND_BASE_URL: https://smanga.shop
AUTH_GOOGLE_ID: ${AUTH_GOOGLE_ID}
AUTH_GOOGLE_SECRET: ${AUTH_GOOGLE_SECRET}
AUTH_GOOGLE_CALLBACK_URL: https://smanga.shop/api/v1/auth/google/callback
```

`POSTGRES_PASSWORD`, `JWT_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` are read from the host `.env` file adjacent to the compose file. See `deploy/home/.env.example` for the template.

---

## Runtime settings (`app_setting` table)

Source: `packages/db/src/schema/app-setting.ts`.

These settings are tunable at runtime from `/admin/settings` (no deploy needed). They are stored in the single-row `app_setting` table (id = 1, enforced by a CHECK constraint).

| Setting column | Type | Default | API endpoint | Purpose |
|---|---|---|---|---|
| `auto_refresh_enabled` | boolean | `false` | `PATCH /api/v1/admin/settings/auto-refresh` | Enable scheduled chapter refresh. When `true`, the cron job (`auto_refresh_cron`) triggers re-crawl of stories with pending/failed chapters. |
| `auto_refresh_cron` | text | `0 2 * * *` | Same | Cron expression for the auto-refresh schedule (runs at 02:00 by default). |
| `auto_refresh_scope` | text | `ongoing` | Same | `ongoing` = only stories with `status = 'ongoing'`; `all` = every story with completed discovery. |
| `auto_refresh_concurrency` | integer | `5` | Same | Maximum parallel crawl jobs during a refresh run. |
| `auto_retry_enabled` | boolean | `true` | `PATCH /api/v1/admin/settings/auto-retry` | Enable the dead-letter reconciler. Flip to `false` during an incident to instantly stop auto-retries. |
| `auto_crawl_enabled` | boolean | `false` | `PATCH /api/v1/admin/settings/auto-crawl` | Enable the smart backlog drainer (opt-in). When `true`, a Bull repeatable job (every 1 min) tops up the fetch-chapter queue to the watermark with newest-first pending chapters. |
| `auto_crawl_watermark` | integer | `500` | Same | Target number of queued fetch-chapter jobs. Clamped to [50, 2000] by the DTO. The feeder stops enqueueing new jobs once the queue depth meets this value. |
| `last_run_at` | timestamptz | null | Read-only | Timestamp of the last auto-refresh execution. |
| `last_run_count` | integer | null | Read-only | Number of stories processed in the last auto-refresh run. |

### Activating the auto-crawl drainer

After deploy, the drainer is **OFF** by default. Enable it from the admin UI or via:

```bash
curl -X PATCH https://smanga.shop/api/v1/admin/settings/auto-crawl \
  -H "Content-Type: application/json" \
  -b "jwt=<token>" \
  -d '{"enabled": true, "watermark": 500}'
```

---

## Docker Compose services and their configuration

Source: `deploy/home/docker-compose.prod.yml`.

| Service | Image | Key config |
|---|---|---|
| `postgres` | `postgres:17-alpine` | `shared_buffers=1GB`, `effective_cache_size=3GB`, `work_mem=32MB`, `mem_limit: 2g` |
| `redis` | `redis:7-alpine` | `maxmemory 768mb`, `maxmemory-policy noeviction`, `appendonly yes`, `mem_limit: 2g` |
| `api` | `ghcr.io/${GHCR_OWNER}/smanga-api:latest` | `mem_limit: 2g`, `NODE_OPTIONS=--max-old-space-size=1024`, runs `pnpm --filter @smanga/db migrate && node apps/api/dist/main.js` |
| `frontend` | `ghcr.io/${GHCR_OWNER}/smanga-frontend:latest` | Static Nginx/Caddy-proxied SPA |
| `caddy` | `caddy:2-alpine` | Listens on `127.0.0.1:8080:80`; Cloudflare Tunnel connects to this port |
| `watchtower` | `nickfedor/watchtower:latest` | Polls GHCR every 300 s; pulls and restarts containers with label `com.centurylinklabs.watchtower.enable: "true"` |
