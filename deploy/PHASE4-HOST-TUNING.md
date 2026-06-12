# Phase 4 — Laptop host tuning (operator apply)

The compose tuning (Postgres/Redis flags, mem_limits, NODE_OPTIONS, DB_POOL_MAX=25,
stop_grace_period) is committed in `deploy/home/docker-compose.prod.yml`. Apply on
the laptop (`sunny-server`):

1. **Pre-check RAM** — values assume ≥ 8 GB:
   ```bash
   free -h
   ```
   If total RAM < 8 GB, HALVE the values first (edit the compose on the laptop or
   via a follow-up commit): `shared_buffers=512MB`, `effective_cache_size=1536MB`,
   `maintenance_work_mem=128MB`, postgres `mem_limit: 1g`; redis `--maxmemory 384mb`
   + `mem_limit: 1g`; api `--max-old-space-size=512` + `mem_limit: 1g`. Keep each
   `mem_limit` ≥ ~2.5× the service's memory target — a too-tight limit OOM-loops it.

2. **Apply** — bring Redis up first so it finishes loading its AOF before the API
   boots. (The API also now retries through Redis `LOADING` on boot — fixed
   2026-06-12 — so a co-restart can no longer crash-loop it; this ordering is just
   belt-and-suspenders. **Make sure the API image carrying that fix is deployed
   before re-applying.**)
   ```bash
   cd ~/smanga
   git pull
   C="docker compose -f deploy/home/docker-compose.prod.yml"
   $C up -d redis     # recreate Redis with the new flags; let it load its AOF
   sleep 25
   $C up -d           # bring up the rest; the API boots with Redis already loaded
   ```
   `up -d` recreates only services whose config changed. Postgres keeps its
   `postgres-data` volume; Redis keeps `redis-data`.

3. **Verify after restart:**
   ```bash
   COMPOSE="docker compose -f deploy/home/docker-compose.prod.yml"
   $COMPOSE ps                                                       # all healthy
   $COMPOSE exec postgres psql -U smanga -d smanga -c 'SHOW shared_buffers;'   # 1GB
   $COMPOSE exec redis redis-cli CONFIG GET maxmemory-policy                   # noeviction
   curl -sI https://smanga.shop/api/v1/health                                  # 200
   ```

4. **Rollback:** `git revert` the compose commit + `docker compose up -d` (volumes
   are untouched, so this is safe).
