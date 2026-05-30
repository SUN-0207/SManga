# SManga VPS Migration Plan (Plan 8)

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Several tasks require an actual VPS, DNS access, and shell — they're written for human execution with the agent assisting on file generation, but you can still bookkeep progress as you go.
> **Prerequisites:** Plan 6 (deploy) and Plan 7 (catalog discovery) shipped. Cloudflare account with `smanga.shop` zone active.

**Goal:** Move SManga from the Vercel + Railway + Neon + Upstash managed stack to a single Hetzner CX22 VPS running docker-compose. Cloudflare proxies traffic + provides edge CDN + free SSL termination. Cost flips from ~$0-40/mo (depending on data growth) to a flat **~$5/mo** that scales with usage instead of with vendor quotas.

**Important user constraint:** Vercel deployment is kept as a **test/preview env**. VPS hosts the **new production** with a fresh database (no Neon → VPS data migration). The reader catalog is rebuilt on the VPS from scratch via the existing admin catalog-discover flow.

**Architecture:**

```
                ┌────────────────────────────────────────────────┐
User (browser)  │                Cloudflare edge                  │
   ─────────►   │   (CDN cache + SSL term + DDoS + Analytics)     │
                └─────────────────────┬───────────────────────────┘
                                      │ HTTPS (Full strict)
                                      ▼
                ┌────────────────────────────────────────────────┐
                │           Hetzner CX22 Singapore                │
                │  ┌──────────────────────────────────────────┐   │
                │  │  Caddy (auto Let's Encrypt + reverse-    │   │
                │  │         proxy + static FE)                │   │
                │  └─────┬─────────────────┬────────────────────┘   │
                │        │ /api/*          │ /                       │
                │        ▼                 ▼                         │
                │  ┌──────────────┐  ┌──────────────────────┐       │
                │  │  Node (API   │  │  /var/www/smanga-fe  │       │
                │  │  +Bull       │  │  (Vite build assets) │       │
                │  │  worker)     │  └──────────────────────┘       │
                │  └──┬───────┬───┘                                  │
                │     │       │                                       │
                │     ▼       ▼                                       │
                │  ┌────────┐ ┌────────┐                              │
                │  │Postgres│ │ Redis  │                              │
                │  └────────┘ └────────┘                              │
                └────────────────────────────────────────────────────┘
                                      │ nightly pg_dump
                                      ▼
                       Cloudflare R2 (10 GB free)
```

All 4 services run on one VPS via `docker-compose`. Caddy handles SSL + reverse proxy. Postgres + Redis are local sockets, no auth-over-net needed. Bull queue stays in-process with the API (single container).

**Tech Stack:** No app code changes. Adds `docker-compose.prod.yml`, `Caddyfile`, GitHub Actions SSH deploy workflow, R2 backup cron.

**Cost target:**
- Hetzner CX22 Singapore: €4.51 ≈ **$5/mo**
- Cloudflare free tier: **$0**
- Cloudflare R2 backup storage (~1 GB used of 10 GB free): **$0**
- Domain `smanga.shop`: already paid
- **Total: ~$5/mo flat**, no quota crossover risk

---

## File structure

```
deploy/
  vps/
    docker-compose.prod.yml         api + postgres + redis + caddy + watchtower
    Caddyfile                       reverse proxy + auto SSL
    .env.example                    template for prod env vars
    init-db.sh                      postgres init: enable extensions + create user
    backup.sh                       pg_dump → R2 via rclone
    crontab                         backup schedule
docs/
  vps-runbook.md                    operational runbook: SSH, restart, restore, scale
.github/workflows/
  deploy-vps.yml                    build images → SSH deploy on push to main
```

---

### Task 1: Provision Hetzner VPS

**Goal:** Get a CX22 in Singapore running with Docker + a non-root user.

- [ ] **Step 1: Create the server**
  - Sign in at <https://console.hetzner.com>
  - **Add Server** → Location: **Singapore (sin)**
  - Image: **Ubuntu 24.04**
  - Type: **CX22** (€4.51/mo, 2 vCPU, 4 GB, 40 GB NVMe)
  - SSH Key: add your public key (`~/.ssh/id_ed25519.pub`)
  - Name: `smanga-prod`
  - Backups: optional (€0.90/mo for daily snapshots — recommended for hobby)
  - Create
  - Note the public IPv4 + IPv6

- [ ] **Step 2: Initial server hardening**

```bash
# From your workstation
ssh root@<VPS_IP>

# Update
apt-get update && apt-get upgrade -y
apt-get install -y ufw fail2ban curl ca-certificates

# Firewall — only SSH + HTTP/S
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Non-root deploy user
adduser --disabled-password --gecos "" smanga
usermod -aG sudo smanga
mkdir -p /home/smanga/.ssh
cp /root/.ssh/authorized_keys /home/smanga/.ssh/
chown -R smanga:smanga /home/smanga/.ssh
chmod 700 /home/smanga/.ssh
chmod 600 /home/smanga/.ssh/authorized_keys

# Disable root SSH + password auth
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# Verify with a second terminal: ssh smanga@<VPS_IP>
# Only then close the root session.
```

- [ ] **Step 3: Install Docker + compose plugin**

```bash
# As smanga user
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker smanga
# Log out + back in for group to take effect

docker --version          # 27.x
docker compose version    # v2.x
```

**Acceptance criteria:**
- `ssh smanga@<VPS_IP>` works with key, root login blocked
- `ufw status` shows only 22/80/443 allowed
- `docker run --rm hello-world` succeeds

---

### Task 2: Cloudflare DNS + SSL config

**Goal:** Point `smanga.shop` at the VPS through Cloudflare proxy with Full-strict SSL.

- [ ] **Step 1: DNS records**
  - Cloudflare dashboard → `smanga.shop` zone → DNS
  - **Delete** any A/AAAA records pointing at the old unused machine
  - **Add** `A smanga.shop` → `<VPS IPv4>` — proxy status **ON (orange cloud)**
  - **Add** `AAAA smanga.shop` → `<VPS IPv6>` — orange cloud
  - **Add** `CNAME www smanga.shop` — orange cloud
  - **Set TTL low** (`Auto` is fine when proxied, or `120` if grey-cloud) for fast rollback during cutover

- [ ] **Step 2: SSL/TLS mode**
  - Cloudflare → SSL/TLS → Overview
  - Mode: **Full (strict)** — verifies the VPS cert chain; required since Caddy will use Let's Encrypt
  - Edge Certificates → **Always Use HTTPS**: ON
  - HSTS: leave OFF until smoke test passes, then enable max-age 6 months

- [ ] **Step 3: Cache Rules (3 slots free)**
  - Rules → Cache Rules → Create
  - Rule 1 — **Story covers (immutable)**:
    - Custom filter: `URI Path starts with "/api/v1/cover/"`
    - Then: Eligible for cache, Edge TTL **1 year**
  - Rule 2 — **Static FE assets** (hash-busted by Vite build):
    - Custom filter: `URI Path starts with "/assets/"`
    - Then: Eligible for cache, Edge TTL **1 year**, Browser TTL **1 year**
  - Rule 3 — **Bypass everything else** (default behavior, but explicit):
    - `URI Path starts with "/api/"` AND not the cover path above
    - Then: Bypass cache

- [ ] **Step 4: Page Rules / Redirects**
  - Optional: redirect `www.smanga.shop/*` → `https://smanga.shop/$1` (301)

**Acceptance criteria:**
- `dig smanga.shop` returns Cloudflare IPs (e.g. `104.21.x.x`), proxy active
- Browser visiting `https://smanga.shop` shows Cloudflare 522 (origin not ready) — that's expected until Task 4 lands

---

### Task 3: Docker-compose stack

**Goal:** Produce a self-contained `deploy/vps/` directory the VPS can `docker compose up -d` from.

**Files:**
- Create: `deploy/vps/docker-compose.prod.yml`
- Create: `deploy/vps/Caddyfile`
- Create: `deploy/vps/.env.example`
- Create: `deploy/vps/init-db.sh`

- [ ] **Step 1: docker-compose.prod.yml**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: smanga
      POSTGRES_USER: smanga
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-db.sh:/docker-entrypoint-initdb.d/init.sh:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U smanga -d smanga"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--save", "60", "1", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s

  api:
    image: ghcr.io/sun-0207/smanga-api:${API_TAG:-latest}
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3001
      DATABASE_URL: postgres://smanga:${POSTGRES_PASSWORD}@postgres:5432/smanga
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      FRONTEND_BASE_URL: https://smanga.shop
      AUTH_GOOGLE_ID: ${AUTH_GOOGLE_ID:-}
      AUTH_GOOGLE_SECRET: ${AUTH_GOOGLE_SECRET:-}
      AUTH_GOOGLE_CALLBACK_URL: https://smanga.shop/api/v1/auth/google/callback
    expose:
      - "3001"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3001/api/v1/health || exit 1"]
      interval: 30s
      timeout: 5s
      start_period: 30s

  # Pre-deploy migration runner — runs once per deploy, exits clean.
  # docker-compose `up` will block on this completing before api starts.
  migrate:
    image: ghcr.io/sun-0207/smanga-api:${API_TAG:-latest}
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://smanga:${POSTGRES_PASSWORD}@postgres:5432/smanga
    command: ["node", "--enable-source-maps", "-e", "require('child_process').execSync('cd /repo && pnpm --filter @smanga/db migrate', {stdio: 'inherit'})"]
    restart: "no"

  frontend:
    image: ghcr.io/sun-0207/smanga-frontend:${FE_TAG:-latest}
    restart: unless-stopped
    expose:
      - "80"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      - api
      - frontend
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

volumes:
  postgres-data:
  redis-data:
  caddy-data:
  caddy-config:
```

> Note: the `migrate` service is currently sketched as inline. In practice, simpler to bake `pnpm db:migrate` into the api image entrypoint that runs on container start (`if [ "$RUN_MIGRATIONS" = "1" ]; then ...; fi`). Decide during implementation.

- [ ] **Step 2: Caddyfile**

```caddy
{
  # Disable admin endpoint exposure
  admin off
  # Email for Let's Encrypt notices
  email cuthanhson27@gmail.com
}

smanga.shop {
  encode zstd gzip

  # API → NestJS container
  handle /api/* {
    reverse_proxy api:3001
  }

  # FE — frontend container serves the built Vite assets
  handle {
    reverse_proxy frontend:80
  }

  # Trust Cloudflare's proxy headers (for real client IP in logs)
  servers {
    trusted_proxies cloudflare
  }

  log {
    output file /var/log/caddy/access.log {
      roll_size 100mb
      roll_keep 5
    }
    format json
  }
}
```

Note: `trusted_proxies cloudflare` is a Caddy plugin. Either use the [Caddy image with the cloudflare module](https://hub.docker.com/r/caddy/caddy) or drop that line and rely on Cloudflare's `CF-Connecting-IP` header without verification (fine for hobby).

- [ ] **Step 3: .env.example**

```env
# Postgres (auto-set in compose, used by api/migrate)
POSTGRES_PASSWORD=<strong random 32+ chars>

# API
JWT_SECRET=<strong random 32+ chars>

# Google OAuth (optional — leave empty to disable Google login)
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Image tags (set by GitHub Actions on deploy)
API_TAG=latest
FE_TAG=latest
```

- [ ] **Step 4: init-db.sh**

```bash
#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS unaccent;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EOSQL
```

(`migrations/0001` creates `immutable_unaccent` — but the extensions themselves must be enabled first by superuser, which the init script handles.)

**Acceptance criteria:**
- Locally: `cd deploy/vps && docker compose -f docker-compose.prod.yml --env-file .env.example config` parses without error
- Compose mounts a fresh `init-db.sh` on first postgres boot

---

### Task 4: Build + publish images to GHCR

**Goal:** Two images on GitHub Container Registry: `ghcr.io/sun-0207/smanga-api` and `smanga-frontend`. Built by GitHub Actions on push to `main`.

- [ ] **Step 1: Frontend Dockerfile**

Create `apps/frontend/Dockerfile`:

```Dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS builder
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/frontend/package.json apps/frontend/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/frontend apps/frontend
WORKDIR /repo/apps/frontend
ENV VITE_API_BASE_URL=/api/v1
RUN pnpm build  # → apps/frontend/dist

FROM nginx:alpine AS runtime
COPY --from=builder /repo/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

Create `apps/frontend/nginx.conf` (SPA fallback):

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
  }
  location / {
    try_files $uri /index.html;
  }
}
```

- [ ] **Step 2: Update apps/api/Dockerfile**

Existing Dockerfile already works; just make sure the runtime stage includes everything `pnpm db:migrate` needs (it does after the `tsx`-in-deps fix from commit `bb19529`).

- [ ] **Step 3: GitHub Actions build workflow**

Create `.github/workflows/build-images.yml`:

```yaml
name: Build & Push Images

on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

jobs:
  api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/api/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/smanga-api:latest
            ghcr.io/${{ github.repository_owner }}/smanga-api:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/frontend/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/smanga-frontend:latest
            ghcr.io/${{ github.repository_owner }}/smanga-frontend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 4: Make GHCR packages public** (or grant the VPS read access)
  - After first push, go to <https://github.com/users/sun-0207/packages>
  - For each package → Package settings → Change visibility to **Public** (simplest), or
  - Generate a PAT with `read:packages` and `docker login ghcr.io` on the VPS

**Acceptance criteria:**
- A push to `main` produces two new images on `ghcr.io/sun-0207/smanga-{api,frontend}:latest`
- `docker pull ghcr.io/sun-0207/smanga-api:latest` works on the VPS

---

### Task 5: First boot on the VPS

**Goal:** Bring the stack up manually once. Confirm everything is wired before automating deploys.

- [ ] **Step 1: Copy deploy files**

```bash
# From workstation
scp -r deploy/vps smanga@<VPS_IP>:/home/smanga/smanga
ssh smanga@<VPS_IP>
cd ~/smanga
```

- [ ] **Step 2: Create production .env**

```bash
cp .env.example .env
# Edit .env with real secrets
nano .env
# Generate strong passwords:
openssl rand -base64 32   # for POSTGRES_PASSWORD
openssl rand -base64 32   # for JWT_SECRET
```

Paste Google OAuth creds (same as Railway env now) — add new Authorized redirect URI in Google Console: `https://smanga.shop/api/v1/auth/google/callback`.

- [ ] **Step 3: Pull + start**

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f api
# Wait for "Nest application successfully started"
```

- [ ] **Step 4: Bootstrap admin user**

```bash
curl -X POST http://localhost/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"cuthanhson27@gmail.com","password":"<strong-pass>","name":"Sunny"}'

docker compose -f docker-compose.prod.yml exec postgres \
  psql -U smanga -d smanga -c "UPDATE \"user\" SET role='admin' WHERE email='cuthanhson27@gmail.com';"
```

- [ ] **Step 5: Browser smoke test**
  - Visit `https://smanga.shop` — landing page renders (cold cache from Cloudflare)
  - Login as admin → `/admin` accessible
  - Add a source if needed → discover → import a story → wait for crawl
  - Reader path: visit a story slug, open a chapter

**Acceptance criteria:**
- Cloudflare → Caddy → all 3 services responding healthy
- Admin can import + crawl + read end-to-end
- SSL padlock shows valid cert (Let's Encrypt issued by Caddy, served via CF edge)

---

### Task 6: SSH deploy automation

**Goal:** A `git push origin main` rebuilds images + pulls them on the VPS + restarts the stack.

- [ ] **Step 1: Generate deploy SSH key**

```bash
# On workstation
ssh-keygen -t ed25519 -f ~/.ssh/smanga-deploy -N ""
# Add the public key to the VPS smanga user
ssh-copy-id -i ~/.ssh/smanga-deploy.pub smanga@<VPS_IP>
```

- [ ] **Step 2: Add GitHub secrets**

Repo settings → Secrets and variables → Actions → New repository secret:
- `VPS_HOST` = `<VPS_IP>` (or `smanga.shop` once DNS resolves to origin)
- `VPS_USER` = `smanga`
- `VPS_SSH_KEY` = paste private key contents of `~/.ssh/smanga-deploy`

- [ ] **Step 3: Deploy workflow**

Create `.github/workflows/deploy-vps.yml`:

```yaml
name: Deploy to VPS

on:
  workflow_run:
    workflows: ["Build & Push Images"]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    steps:
      - name: SSH deploy
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -e
            cd ~/smanga
            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d
            docker image prune -af --filter "until=72h"
            # Smoke
            sleep 10
            curl -fsS http://localhost/api/v1/health > /dev/null
            echo "Deploy OK"
```

- [ ] **Step 4: Trigger first auto-deploy**

```bash
git commit --allow-empty -m "chore: trigger VPS deploy"
git push
```

Watch both workflows on GitHub Actions. Verify the api container has the new image tag.

**Acceptance criteria:**
- Push to main → both workflows pass within ~5-7 min
- Stack restarts with new image, healthcheck passes
- Zero-touch for hobby commits

---

### Task 7: Nightly backups to Cloudflare R2

**Goal:** Daily `pg_dump` shipped to R2 with 14-day retention. ~$0 storage cost.

- [ ] **Step 1: Create R2 bucket**
  - Cloudflare dashboard → R2 → Create bucket → `smanga-backups` → location auto
  - R2 → Manage API Tokens → Create API Token → Object Read & Write → restrict to `smanga-backups`
  - Save: `Access Key ID`, `Secret Access Key`, `S3 endpoint URL`

- [ ] **Step 2: rclone config on VPS**

```bash
# As smanga user
sudo apt-get install -y rclone
rclone config
# Choose: n (new) → name: r2 → storage: s3 → provider: Cloudflare → env_auth: false
# → access_key_id + secret_access_key from step 1
# → region: auto → endpoint: <your R2 endpoint URL>
# → leave rest default

rclone lsd r2:smanga-backups   # should not error
```

- [ ] **Step 3: backup script**

Create `/home/smanga/smanga/backup.sh`:

```bash
#!/bin/bash
set -euo pipefail

STAMP=$(date +%Y-%m-%d_%H%M%S)
DUMP_FILE="/tmp/smanga-${STAMP}.sql.gz"

cd /home/smanga/smanga
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U smanga -d smanga --format=plain --no-owner --no-acl \
  | gzip -9 > "$DUMP_FILE"

rclone copy "$DUMP_FILE" r2:smanga-backups/ --quiet
rm -f "$DUMP_FILE"

# Prune R2 keep last 14 days
rclone delete r2:smanga-backups/ --min-age 14d --quiet

echo "[$(date)] backup ok: smanga-${STAMP}.sql.gz"
```

```bash
chmod +x /home/smanga/smanga/backup.sh
```

- [ ] **Step 4: Cron**

```bash
crontab -e
# Add: nightly at 02:30 VN time
30 2 * * * /home/smanga/smanga/backup.sh >> /home/smanga/smanga/backup.log 2>&1
```

- [ ] **Step 5: Verify**

```bash
# Run once manually to confirm
./backup.sh
rclone ls r2:smanga-backups/
```

**Acceptance criteria:**
- One backup uploaded to R2 visible in Cloudflare dashboard
- Cron entry installed, `backup.log` rotates naturally (or add logrotate later)
- A test restore works locally: `rclone copy r2:smanga-backups/<file>.sql.gz . && gunzip <file>.sql.gz && psql ... < <file>.sql`

---

### Task 8: Cutover

**Goal:** Switch real users from Vercel to VPS. Keep Vercel pointing at Railway as a fallback test env.

- [ ] **Step 1: Pre-cutover checklist**
  - VPS stack healthy for 24+ hours: `docker compose ps` all healthy
  - Backup ran at least once
  - Smoke test passes end-to-end (login, search, read a chapter, admin crawl)
  - Cloudflare cache rules verified hit/miss in CF Analytics → Cache

- [ ] **Step 2: DNS cutover**
  - Cloudflare DNS → `smanga.shop` A record already points at VPS IP from Task 2 → nothing to change here for the new domain
  - For users currently on `s-manga-frontend.vercel.app` — those URLs keep working but won't see new content (Vercel keeps pointing at Railway). Either:
    - **Option A (recommended):** post an announcement; let `smanga.shop` be the official URL
    - **Option B:** add a Vercel redirect in `vercel.json` → `https://smanga.shop/$1` so old bookmarks 301 to the new home

- [ ] **Step 3: Update Google OAuth Console**
  - Remove `https://s-manga-frontend.vercel.app/api/v1/auth/google/callback` from Authorized redirect URIs (keep localhost + smanga.shop)
  - Or keep all 3 if you still want the Vercel test env functional

- [ ] **Step 4: Disable scheduled refresh on Vercel/Railway**
  - Open Railway env → set `AUTH_GOOGLE_ID=` (empty) to stop OAuth from working there, OR
  - Open old `/admin/settings` on Vercel test env → toggle Auto-refresh OFF so the old Bull queue stops doing redundant work against Neon

- [ ] **Step 5: Cancel paid services** (only after 2+ weeks of clean VPS operation)
  - Railway: keep on free tier ($5 credit) or fully delete the service
  - Neon: downgrade to free tier or delete
  - Upstash: free tier OK to leave

**Acceptance criteria:**
- `https://smanga.shop` served entirely from VPS
- Old Vercel URL still loads (redirect or unchanged) without HTTP 5xx
- No double-crawling between Railway worker and VPS worker

---

### Task 9: Operational runbook

**Goal:** A `docs/vps-runbook.md` that future-you can follow in 5 minutes when something breaks.

- [ ] **Step 1: Write the runbook covering:**
  - SSH access & first-boot survival guide
  - Where logs live: `docker compose logs <service>`
  - Restart procedures: single service, full stack, after VPS reboot
  - Restore from R2 backup (full DB restore):
    ```bash
    rclone copy r2:smanga-backups/smanga-YYYY-MM-DD.sql.gz .
    gunzip smanga-YYYY-MM-DD.sql.gz
    docker compose exec -T postgres psql -U smanga -d smanga < smanga-YYYY-MM-DD.sql
    ```
  - How to scale up (CX22 → CX32 = €8/mo, 4 vCPU, 8 GB): Hetzner UI → server → "Rescale" → choose type → reboot
  - How to add a second VPS (read replica Postgres + load-balanced Caddy) — defer until hobby outgrows
  - Cloudflare cache purge:
    - Dashboard → Caching → Configuration → Purge Everything (or selective by URL)
  - Common failures:
    - 522 → origin down → check `docker compose ps`, restart with `up -d`
    - 502/504 → api container unhealthy → `docker compose logs api`
    - Disk full → `docker system prune -af`
    - Postgres OOM (CX22 has 4 GB shared) → tune `shared_buffers`, add swap, or rescale

**Acceptance criteria:**
- Runbook lives at `docs/vps-runbook.md`
- Each section is a single copy-paste command or short paragraph

---

## Workarounds you'll hit (record in CLAUDE.md when implementing)

- **Caddy + Cloudflare proxy double-encoding:** Caddy's `encode gzip` + Cloudflare's gzip can sometimes cascade. Use `encode zstd gzip` and let CF decide. Already in the Caddyfile above.
- **First Let's Encrypt issuance:** if Caddy can't reach port 80 from the internet (because Cloudflare proxy intercepts HTTP-01 challenge), set CF SSL mode to **Full** (not strict) for first issue, then flip to strict after the cert is in `/data/caddy/certificates/`. Alternative: use DNS-01 challenge via the [caddy-dns/cloudflare](https://github.com/caddy-dns/cloudflare) plugin + CF API token.
- **GHCR rate limits for anon pulls:** if you keep packages private, the VPS needs `docker login ghcr.io -u sun-0207 -p <PAT>` before `compose pull`. Public packages have unlimited anon pulls — recommended for hobby.
- **Postgres extensions on first boot only:** `init-db.sh` runs once when the data volume is empty. If you ever `docker volume rm postgres-data`, extensions get recreated; otherwise it's a no-op.
- **Bull queue and TLS:** local Redis on same compose network uses `redis://` (plain TCP) — no TLS needed. The TLS workaround from `f7e6c43` only applied to Upstash `rediss://`.
- **PORT mismatch:** the api Dockerfile defaults `PORT=3001`; compose env overrides if needed. Caddy reverse_proxy points at `api:3001`.

---

## Rollback plan

If the VPS deploy goes sideways:

1. **DNS:** Cloudflare → DNS → change `A smanga.shop` from VPS IP back to Railway's Vercel CNAME (or Vercel directly). TTL clears in ~120s (CF Auto).
2. **Vercel test env still alive:** original `s-manga-frontend.vercel.app` keeps pointing at Railway, so users can still reach the app while you debug the VPS.
3. **Restore from R2 backup if Postgres was corrupted:** see runbook restore step.
4. **Last resort:** `docker compose down -v` (deletes ALL VPS data) → restore from last R2 snapshot → rebuild.

The fact that we're starting with a **fresh DB on VPS** (per user constraint) means rollback is cheap during cutover — Vercel + Railway + Neon still have the old data intact.

---

## Cost recap

| Item | Monthly |
|---|---|
| Hetzner CX22 Singapore | €4.51 (~$5) |
| Hetzner snapshot backups | €0.90 (~$1) — optional |
| Cloudflare proxy + CDN + SSL | $0 |
| Cloudflare R2 (1 GB used / 10 GB free) | $0 |
| GitHub Actions (public repo) | $0 |
| GHCR (public images) | $0 |
| Domain `smanga.shop` (already owned) | $0 |
| **Total** | **~$5-6/mo** |

vs current managed track at 200+ stories: **$25-40/mo**. Break-even at hobby scale: VPS wins from day 1.
