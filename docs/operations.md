# SManga local ops

## Run everything (3 terminals)

```powershell
# Terminal 1: postgres
pnpm dev:db

# Terminal 2: migrations + seed + web
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
pnpm db:migrate
pnpm db:seed
pnpm --filter @smanga/web dev

# Terminal 3: worker
$env:DATABASE_URL = "postgres://smanga:smanga_dev@localhost:5432/smanga"
$env:WEB_BASE_URL = "http://localhost:3000"
$env:REVALIDATE_SECRET = "<value from .env>"
pnpm dev:worker
```

## Bootstrap an admin user

```powershell
# After web is up:
curl -X POST http://localhost:3000/api/register -H "Content-Type: application/json" `
  -d '{"email":"admin@test.com","password":"adminpassword","name":"Admin"}'

docker exec smanga-postgres psql -U smanga -d smanga -c "UPDATE \"user\" SET role='admin' WHERE email='admin@test.com';"
```

## Common queries

```powershell
# Story counts:
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT COUNT(*) FROM story;"

# Pending chapters per story:
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT story_id, COUNT(*) FROM chapter WHERE status='pending' GROUP BY story_id;"

# Job queue:
docker exec smanga-postgres psql -U smanga -d smanga -c "SELECT state, COUNT(*) FROM pgboss.job GROUP BY state;"

# Reset everything:
docker compose -f docker-compose.dev.yml down -v
```

## Smoke checklist before deploy

- [ ] `pnpm test` passes (db, shared, crawler)
- [ ] `pnpm --filter @smanga/web typecheck` passes
- [ ] `pnpm --filter @smanga/crawler-worker typecheck` passes
- [ ] `pnpm --filter @smanga/web e2e` passes (requires running web + admin user seeded)
- [ ] Manual: sign in to /admin, import a story, click "Crawl missing", refresh page, see chapters crawl in real time

## Reader sanity check

After web is up and DB has at least one story with crawled chapters:

```powershell
curl http://localhost:3000/
curl http://localhost:3000/sitemap.xml | Select-String "<url>" | Measure-Object | Select-Object Count
curl http://localhost:3000/robots.txt
```

Manual:

- Open `http://localhost:3000` — see story grid with cover images
- Click a story — see info + chapter list with pagination if > 50 chapters
- Click a chapter — see content rendered; click "Cài đặt" → switch dark mode + font size; refresh — preferences persist
- Visit a not-yet-crawled chapter — see "chưa được crawl" placeholder, no crash
