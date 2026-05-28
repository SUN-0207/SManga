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
