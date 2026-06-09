# SManga local ops

## Run everything (4 terminals)

```powershell
# Terminal 1: postgres + redis
pnpm dev:db

# Terminal 2: migrations + seed (one-time per fresh DB)
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:migrate
pnpm db:seed

# Terminal 3: NestJS API (http://localhost:3001/api/docs for Swagger)
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
$env:REDIS_URL = "redis://localhost:6379"
$env:JWT_SECRET = "<value from .env>"
pnpm dev:api

# Terminal 4: Vite frontend (http://localhost:3000)
pnpm dev:frontend
```

## Bootstrap an admin user

```powershell
# After API is up (port 3001), register via the Vite proxy (port 3000):
curl.exe -X POST http://localhost:3001/api/v1/auth/register -H "Content-Type: application/json" `
  -d '{\"email\":\"admin@test.com\",\"password\":\"adminpassword\",\"name\":\"Admin\"}'

docker exec smanga-postgres psql -U smanga -d smanga -c "UPDATE \"user\" SET role='admin' WHERE email='admin@test.com';"
```

## Common queries

```powershell
# Story counts:
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT COUNT(*) FROM story;"

# Pending chapters per story:
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT story_id, COUNT(*) FROM chapter WHERE status='pending' GROUP BY story_id;"

# Bull queue (Redis-backed — use Swagger UI or Bull Board at /api/queues):
# GET http://localhost:3001/api/queues  (Bull Board dashboard)

# Reset everything:
docker compose -f docker-compose.dev.yml down -v
```

## Smoke checklist before deploy

- [ ] `pnpm test` passes (db, shared, crawler)
- [ ] `pnpm --filter @smanga/api typecheck` passes
- [ ] `pnpm --filter @smanga/frontend typecheck` passes
- [ ] `pnpm --filter @smanga/frontend e2e` passes (future work — Plan 5+, not yet wired)
- [ ] Manual: sign in to /admin, import a story, click "Crawl missing", refresh page, see chapters crawl in real time
- [ ] Worker is now embedded in the NestJS API process — no separate `dev:worker` needed

## Reader sanity check

After API (port 3001) and frontend (port 3000) are up, and DB has at least one story with crawled chapters:

```powershell
curl.exe -s -o $null -w "/ %{http_code}`n" http://localhost:3000/
curl.exe -s -o $null -w "/truyen/<slug> %{http_code}`n" http://localhost:3000/truyen/<slug>
curl.exe -s -o $null -w "/truyen/<slug>/chuong-1 %{http_code}`n" http://localhost:3000/truyen/<slug>/chuong-1
```

Manual:

- Open `http://localhost:3000` — see story grid with cover images
- Click a story — see info + chapter list with pagination if > 50 chapters
- Click a chapter — see content rendered; click "Cài đặt" → switch dark mode + font size; refresh — preferences persist
- Visit a not-yet-crawled chapter — see "chưa được crawl" placeholder, no crash
- Open `http://localhost:3001/api/docs` — Swagger UI for API exploration

## SEO monitoring (Google Search Console)

One-time setup (operator, ~10 min):

1. Go to https://search.google.com/search-console and add property.
   Prefer the Domain property type (covers all subdomains).
   - Domain verification: Cloudflare DNS → add TXT record per Google's instructions.
   - Fallback if DNS doesn't work: URL prefix property + HTML tag method
     (`apps/frontend/index.html` already carries the meta tag — replace
     `REPLACE_AFTER_GSC_SETUP` with the content value Google gives you,
     commit, push, then click Verify).

2. Submit three sitemaps under Sitemaps:
   - `https://smanga.shop/sitemap.xml`
   - `https://smanga.shop/sitemap-stories.xml`
   - `https://smanga.shop/sitemap-chapters.xml`

3. Settings → Users and permissions → Notification preferences:
   enable "Indexing errors", "Manual actions", "Security issues".

4. Save the day-0 baseline metrics to `docs/seo-baseline-2026-06-09.md`
   (template file already exists). Re-export every Monday for a month
   then monthly — compare deltas in the same file.

Ongoing cadence (operator, Mondays):

- Performance tab → last 7 days. Note impressions delta vs prior week,
  top 10 queries, CTR delta. Drop new entries into the baseline doc
  with the date.
- Coverage tab → check for new indexing errors.
- Skip weeks where nothing changed.

Success signal (4 weeks post-deploy):

- Indexed page count climbing.
- Branded "SManga" query shows sitelinks search box + breadcrumb.
- Story-title queries return SManga page 1.

If none of those hit by week 4, the spec deck (Phase 2 content +
Phase 3 brand outreach) is the next lever — Phase 1 alone won't
move competitive head queries like "truyện chữ".
