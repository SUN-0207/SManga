# SManga Deploy Runbook (Phase 1) — DEPRECATED

> ⚠️ **This deploy target is retired.** The Vercel + Railway + Neon + Upstash
> stack was the live prod until 2026-06-07; SManga is now self-hosted on a
> home laptop via Cloudflare Tunnel (Plan 9). See [`home-runbook.md`](home-runbook.md)
> for the current operational guide.
>
> This doc is kept as historical reference for the managed-cloud setup.

Targets: **Vercel** (frontend) + **Railway** (API + Bull worker) + **Neon** (Postgres) + **Upstash** (Redis).

Cost target: $0/mo on free tiers, ~$5–10/mo if you outgrow them.

> Prereqs: GitHub repo connected, `main` branch is green on CI (`.github/workflows/ci.yml`).

---

## 1. Neon Postgres

1. Sign in at <https://neon.tech> → **Create project** `smanga`. Pick the region closest to Railway (us-east-1 is fine).
2. In **Connection details**, copy the **pooled** URL (suffix `-pooler.<region>.aws.neon.tech`) — that's `DATABASE_URL`.
3. In the SQL editor, install extensions (Neon allows these):
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE EXTENSION IF NOT EXISTS unaccent;
   ```
   (The Plan 1 migration `0001_*` also runs these — either way works.)
4. Save the URL to your password manager — Railway will need it, and you'll run migrations against it once.

## 2. Upstash Redis

1. Sign in at <https://upstash.com> → **Create Database** `smanga-queue`. Region: match Railway.
2. Pick **TLS native Redis URL** (NOT the REST URL — Bull uses native protocol). Format:
   ```
   rediss://default:<password>@<host>:<port>
   ```
3. Save it — Railway will need it as `REDIS_URL`.

## 3. Railway API (+ worker, same process)

1. Sign in at <https://railway.app> → **Deploy from GitHub repo** → select SManga.
2. Settings → Service Settings:
   - **Root Directory:** `/`
   - **Builder:** **Dockerfile** (path: `apps/api/Dockerfile`)
   - **Start Command:** _leave empty_ (Dockerfile's `CMD` handles it)
3. **Variables** (add all):
   ```
   DATABASE_URL=<neon-pooled-url>
   REDIS_URL=<upstash-rediss-url>
   JWT_SECRET=<64-char-hex — see below>
   FRONTEND_BASE_URL=https://<vercel-domain-from-step-5>
   PORT=3001
   NODE_ENV=production
   ```
   Generate `JWT_SECRET` locally:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Must be different from local dev `.env`.
4. **Networking** → **Generate Domain** — gives you `<slug>.up.railway.app`. Save it (e.g. `smanga-api.up.railway.app`).
5. **Health check** (recommended):
   - Path: `/api/v1/health`
   - Interval: `30s`
   - Timeout: `5s`
6. Push to `main` to trigger first deploy. Watch the build log (3–5 min).
7. Once **Active**, hit `https://<railway-domain>/api/v1/health` — expect `{"status":"ok","db":true,...}`. Also try `/api/docs` for Swagger UI.

> **Cold start note:** first request after ~5 min idle takes 3–5s on the free tier. Acceptable for a hobby site. If not, upgrade to "Replicas: 1 always-on".

## 4. Run migrations (one-time, before public traffic)

Locally pointing at Neon:

```powershell
$env:DATABASE_URL = "<neon-pooled-url>"
pnpm db:migrate
pnpm db:seed
```

Verify the seed source landed:
```powershell
psql "$env:DATABASE_URL" -c "SELECT id, name FROM source;"
# expected: one row — id=truyenfull, name=TruyenFull
```

(If `psql` isn't available locally, use Neon's web SQL editor for the verification.)

## 5. Vercel frontend

1. Sign in at <https://vercel.com> → **Add new project** → **Import Git Repository** → SManga.
2. **Framework Preset:** Other.
3. **Root Directory:** `apps/frontend`.
4. **Build/Install/Output:** leave empty — `vercel.json` controls them.
5. **Environment Variables:** none needed if you use the rewrite (recommended — keeps cookies first-party). Skip `VITE_API_BASE_URL`.
6. **Deploy.** You'll get a domain like `smanga-<random>.vercel.app`.
7. **Wire the two domains together:**
   - In `apps/frontend/vercel.json` replace `CHANGE-ME.up.railway.app` with the real Railway domain. Commit + push → Vercel auto-redeploys.
   - In Railway env vars, set `FRONTEND_BASE_URL=https://<vercel-domain>`. Restart.

## 6. Bootstrap admin user on prod

```powershell
curl.exe -X POST "https://<railway-domain>/api/v1/auth/register" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"you@example.com\",\"password\":\"<strong-password>\",\"name\":\"Admin\"}'
```

Then promote in Neon (web SQL or psql):
```sql
UPDATE "user" SET role = 'admin' WHERE email = 'you@example.com';
```

Visit `https://<vercel-domain>/dang-nhap`, sign in. You should be redirected to `/admin`.

> Email must contain a real TLD — Zod `.email()` rejects bare `admin@test`.

## 7. Smoke checklist (prod)

- [ ] `https://<vercel-domain>/` loads, hero + featured card render
- [ ] `https://<vercel-domain>/dang-nhap` accepts admin login → redirect `/admin`
- [ ] `/admin/sources` lists `truyenfull`
- [ ] `/admin/stories` → **Import truyện** → paste a real `https://truyenfull.today/<slug>/` URL → job appears under `/admin/jobs`
- [ ] After job completes, `/truyen/<slug>` shows the imported story
- [ ] Click chapter → reader page renders, prev/next nav works
- [ ] Bookmark toggle persists across reload
- [ ] `/tu-sach` shows continue-reading after 5s on a chapter
- [ ] `https://<railway-domain>/api/v1/health` returns `{"db":true,...}`

## 8. Custom domain (optional)

1. **Vercel** → Domains → Add `smanga.example`. Follow DNS instructions.
2. **Railway** → Networking → Custom Domain → `api.smanga.example`. Follow DNS.
3. Update `apps/frontend/vercel.json` rewrite target to `https://api.smanga.example`.
4. Update Railway env `FRONTEND_BASE_URL=https://smanga.example`. Restart.

## 9. Cost tracking

| Service | Free tier | Likely ceiling at hobby scale |
|---|---|---|
| Vercel | 100 GB bandwidth/mo | Far under |
| Railway | $5 starter credit/mo | API + worker fits |
| Neon | 3 GB storage, 1 project | Sufficient for ~1000 stories with gzipped chapters |
| Upstash | 10k commands/day | Bull queue at hobby load is well under |

When Neon hits 70 % capacity → migrate to self-hosted Postgres on a VPS (Hetzner CX22 ~€4/mo). Same Drizzle schema, same connection string format — no app code change.

## 10. Rollback

- **Vercel:** Dashboard → Deployments → previous → **Promote to Production**.
- **Railway:** Dashboard → Deployments → previous → **Redeploy**.
- **DB migrations** are forward-only (Drizzle convention). If a migration is wrong, write a corrective migration. Don't roll schema back manually.

## 11. CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every PR + push to main:

- `pnpm install --frozen-lockfile`
- `pnpm typecheck` (all workspaces)
- `pnpm test` (vitest, includes testcontainers Postgres + Redis services)
- `pnpm --filter @smanga/api build` (Nest webpack bundle)
- `pnpm --filter @smanga/frontend build` (Vite production build)

If CI is red, Vercel/Railway will still deploy on push to main — they don't wait for GitHub Actions. To gate prod deploys on CI: enable **Branch protection** on `main` (Require status checks → CI).

## 12. Observability follow-ups (defer to Phase 2)

- **Error reporting:** Sentry. `pnpm add @sentry/node @sentry/react` then init in `apps/api/src/main.ts` + `apps/frontend/src/main.tsx`. DSNs as env vars.
- **Uptime:** Better Stack or UptimeRobot pinging `/api/v1/health` every 5 min.
- **Logs:** Railway shows live logs and 7d retention on free tier. For longer retention pipe to Better Stack Logtail.
- **Metrics:** Add `prom-client` to the API and Railway can scrape `/metrics`. Or simpler: Postgres views over the `chapter`/`bookmark`/`reading_progress` tables for product analytics.
