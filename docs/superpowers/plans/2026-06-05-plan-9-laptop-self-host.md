# Plan 9 — Self-host SManga prod on home laptop (implementation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-06-05-plan-9-laptop-self-host-design.md](../specs/2026-06-05-plan-9-laptop-self-host-design.md)

**Goal:** Move SManga production from the managed Vercel + Railway + Neon + Upstash stack onto a home laptop with Cloudflare Tunnel ingress. Vercel becomes the staging environment at `<deployment>.vercel.app`.

**Architecture:** Ubuntu Desktop 24.04 + autologin laptop runs `docker compose` (postgres + redis + api + frontend + caddy + watchtower) on its SSD, with `/mnt/hdd/backups/` taking nightly `pg_dump` snapshots. Native `cloudflared` systemd daemon exposes `smanga.shop` via outbound tunnel — no port-forwarding. Watchtower polls GHCR every 5 min for zero-touch deploys when GitHub Actions pushes new images on `main`.

**Tech Stack:** Ubuntu 24.04 · Docker Compose v2 · Caddy 2 · Watchtower · cloudflared · Postgres 17 · Redis 7 · NestJS 11 · nginx · rclone (R2 backup) · systemd timers.

**User constraints (NON-NEGOTIABLE):**

- **`commit-only`, never `git push`.** The user pushes manually when ready.
- **Tasks tagged `[HUMAN]`** require physical access or external dashboards (BIOS, SSH local LAN, Cloudflare DNS, Google OAuth Console, R2 token, laptop hardware). An agent cannot perform these remotely — the agent's job is to produce exact commands the human runs.
- **Tasks tagged `[AGENT]`** are pure repo-file work runnable by a subagent with no laptop access.
- **Tasks tagged `[HYBRID]`** mix: agent generates artifacts, human executes on laptop.
- **Reuse Plan 8 file patterns verbatim** for `deploy/home/docker-compose.prod.yml`, `Caddyfile`, `init-db.sh`, `.github/workflows/build-images.yml`, frontend Dockerfile. Adapt only the laptop-specific bits called out in the spec (no port 80/443, cloudflared not in compose, label-based Watchtower filtering).

---

## File map

### Created by this plan

```
apps/frontend/
  Dockerfile                                NEW — multi-stage builder + nginx runtime
  nginx.conf                                NEW — SPA fallback + asset cache headers

.github/workflows/
  build-images.yml                          NEW — GHCR build on push to main

deploy/home/
  docker-compose.prod.yml                   NEW — postgres + redis + api + frontend + caddy + watchtower
  Caddyfile                                 NEW — reverse-proxy localhost:8080 only
  init-db.sh                                NEW — pg_trgm + unaccent extension on first boot
  .env.example                              NEW — secret template
  cloudflared/
    config.yml.example                      NEW — tunnel ingress template
  scripts/
    backup.sh                               NEW — pg_dump → HDD + gzip + rclone → R2
  systemd/
    smanga-backup.service                   NEW — oneshot wrapper around backup.sh
    smanga-backup.timer                     NEW — fires 02:30 daily
    cloudflared-override.conf               NEW — wait for network-online.target

docs/
  home-runbook.md                         NEW — operational runbook for the laptop deploy
```

### Modified by this plan

- `MEMORY.md` — add Plan 9 status pointer (Task 20)
- `.claude/projects/.../memory/plan_smanga_laptop_self_host.md` — new memory file (Task 20)
- `CLAUDE.md` — append Plan 9 note to "State of play" section (Task 20)

### Plan 8 reference (NOT executed, but file shapes copied)

[docs/superpowers/plans/2026-05-30-smanga-vps-migration.md](2026-05-30-smanga-vps-migration.md) — supplies the `Caddyfile`, `init-db.sh`, frontend Dockerfile, and GHCR workflow shapes. Plan 9 reuses these with the adaptations specified per task below.

---

## Definition of done

1. `https://smanga.shop` resolves to the laptop via Cloudflare Tunnel, full smoke (login → admin → discover → import → read chapter) passes.
2. Pushing a no-op commit to `main` results in new GHCR images, and Watchtower restarts api + frontend on the laptop within 10 min, without human intervention.
3. A backup runs successfully at 02:30, lands on HDD and R2, with prune of >30d HDD entries and >14d R2 entries.
4. Power-cycle test (unplug AC for >30s, plug back in) → laptop reboots, stack auto-starts, site is reachable within 3 min.
5. Vercel staging at `<deployment>.vercel.app` remains accessible and healthy.

---

## Phase A — Repo file scaffolding (5 tasks, AGENT)

These tasks produce the deploy/home/ tree and CI workflow in the current workspace. No laptop access needed.

### Task 1: Frontend Dockerfile + nginx config

**Type:** `[AGENT]`

**Files:**
- Create: `apps/frontend/Dockerfile`
- Create: `apps/frontend/nginx.conf`

- [ ] **Step 1: Write `apps/frontend/Dockerfile`**

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
RUN pnpm build

FROM nginx:alpine AS runtime
COPY --from=builder /repo/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 2: Write `apps/frontend/nginx.conf`**

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  # Hash-busted Vite assets — 1y immutable cache
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
  }

  # SPA fallback — all non-asset URLs serve index.html
  location / {
    try_files $uri /index.html;
  }
}
```

- [ ] **Step 3: Verify Dockerfile builds locally**

```powershell
docker build -f apps/frontend/Dockerfile -t smanga-frontend:test .
```

Expected: build completes, final image tag `smanga-frontend:test` listed in `docker images`.

- [ ] **Step 4: Commit**

```powershell
git add apps/frontend/Dockerfile apps/frontend/nginx.conf
git commit -m "feat(frontend/build): add Dockerfile + nginx config for self-host

Multi-stage build: Vite production build in node:20-alpine, served by
nginx:alpine with 1y immutable cache on hashed /assets/ paths and SPA
fallback for all other routes. Used by Plan 9 laptop deployment.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

**Do NOT push.**

---

### Task 2: GitHub Actions build workflow

**Type:** `[AGENT]`

**Files:**
- Create: `.github/workflows/build-images.yml`

- [ ] **Step 1: Write workflow**

```yaml
name: Build & Push Images

on:
  push:
    branches: [main]
    paths:
      - 'apps/api/**'
      - 'apps/frontend/**'
      - 'packages/**'
      - 'pnpm-lock.yaml'
      - '.github/workflows/build-images.yml'

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

- [ ] **Step 2: Lint workflow**

```powershell
# Optional: install actionlint and run
# actionlint .github/workflows/build-images.yml
# At minimum: validate YAML syntax
python -c "import yaml; yaml.safe_load(open('.github/workflows/build-images.yml'))"
```

Expected: no exception thrown.

- [ ] **Step 3: Commit**

```powershell
git add .github/workflows/build-images.yml
git commit -m "ci(images): add GHCR build workflow for api + frontend

Pushes ghcr.io/<owner>/smanga-{api,frontend}:latest and :<sha> on every
main-branch change touching apps/, packages/, or the workflow file.
Watchtower polls :latest on the laptop to roll out new images.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

**Do NOT push.** The workflow only runs once code lands on remote `main` — the user controls that.

---

### Task 3: Docker compose + Caddyfile + init-db + .env example

**Type:** `[AGENT]`

**Files:**
- Create: `deploy/home/docker-compose.prod.yml`
- Create: `deploy/home/Caddyfile`
- Create: `deploy/home/init-db.sh`
- Create: `deploy/home/.env.example`

- [ ] **Step 1: Write `deploy/home/docker-compose.prod.yml`**

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
    image: ghcr.io/${GHCR_OWNER}/smanga-api:latest
    restart: unless-stopped
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    environment:
      NODE_ENV: production
      PORT: "3001"
      DATABASE_URL: postgres://smanga:${POSTGRES_PASSWORD}@postgres:5432/smanga
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      FRONTEND_BASE_URL: https://smanga.shop
      AUTH_GOOGLE_ID: ${AUTH_GOOGLE_ID}
      AUTH_GOOGLE_SECRET: ${AUTH_GOOGLE_SECRET}
      AUTH_GOOGLE_CALLBACK_URL: https://smanga.shop/api/v1/auth/google/callback
    # Run drizzle migrations before NestJS starts. Idempotent — the
    # journal table skips applied migrations on every container boot.
    command: ["sh", "-c", "pnpm --filter @smanga/db migrate && node apps/api/dist/main.js"]
    labels:
      com.centurylinklabs.watchtower.enable: "true"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3001/api/v1/health || exit 1"]
      interval: 30s
      timeout: 5s
      start_period: 60s

  frontend:
    image: ghcr.io/${GHCR_OWNER}/smanga-frontend:latest
    restart: unless-stopped
    labels:
      com.centurylinklabs.watchtower.enable: "true"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on: [api, frontend]
    ports:
      - "127.0.0.1:8080:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro

  watchtower:
    image: containrrr/watchtower:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      WATCHTOWER_POLL_INTERVAL: "300"
      WATCHTOWER_CLEANUP: "true"
      WATCHTOWER_LABEL_ENABLE: "true"
      WATCHTOWER_INCLUDE_RESTARTING: "true"

volumes:
  postgres-data:
  redis-data:
```

- [ ] **Step 2: Write `deploy/home/Caddyfile`**

```caddy
{
  admin off
  auto_https off
}

:80 {
  encode zstd gzip

  handle /api/* {
    reverse_proxy api:3001
  }

  handle {
    reverse_proxy frontend:80
  }

  log {
    output stdout
    format console
  }
}
```

- [ ] **Step 3: Write `deploy/home/init-db.sh`**

```bash
#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS unaccent;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EOSQL
```

Make executable in the same step:

```powershell
# On Windows; bit set on the file is irrelevant — Linux receives it on copy.
# If the file is ever edited from Linux, run: chmod +x deploy/home/init-db.sh
```

- [ ] **Step 4: Write `deploy/home/.env.example`**

```env
# Owner of GHCR packages (your GitHub username or org)
GHCR_OWNER=sun-0207

# Postgres password — generate via: openssl rand -base64 32
POSTGRES_PASSWORD=__REPLACE_ME__

# JWT signing secret — generate via: openssl rand -base64 32
JWT_SECRET=__REPLACE_ME__

# Google OAuth credentials (copy from Railway env / Google Cloud Console)
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

- [ ] **Step 5: Validate compose syntax**

```powershell
cd deploy/home
$env:GHCR_OWNER="sun-0207"; $env:POSTGRES_PASSWORD="x"; $env:JWT_SECRET="x"; $env:AUTH_GOOGLE_ID="x"; $env:AUTH_GOOGLE_SECRET="x"
docker compose -f docker-compose.prod.yml config > $null
```

Expected: no error, exit code 0.

- [ ] **Step 6: Commit**

```powershell
git add deploy/home/docker-compose.prod.yml deploy/home/Caddyfile deploy/home/init-db.sh deploy/home/.env.example
git commit -m "feat(deploy/home): docker-compose stack + Caddyfile + init-db

Plan 9 — laptop self-host stack. Caddy listens on 127.0.0.1:8080 only;
public ingress comes through native cloudflared (Task 5). Watchtower
filters by label so only api + frontend get auto-pulled; postgres,
redis, and watchtower itself are pinned by version. api container runs
'pnpm db:migrate' before starting NestJS (idempotent via drizzle journal
table) so new schema changes apply on every Watchtower restart.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: cloudflared config + systemd override

**Type:** `[AGENT]`

**Files:**
- Create: `deploy/home/cloudflared/config.yml.example`
- Create: `deploy/home/systemd/cloudflared-override.conf`

- [ ] **Step 1: Write `deploy/home/cloudflared/config.yml.example`**

```yaml
# Place at /etc/cloudflared/config.yml after `cloudflared tunnel create smanga-prod`.
# Replace <UUID> with the tunnel ID printed by `cloudflared tunnel create`.

tunnel: <UUID>
credentials-file: /etc/cloudflared/<UUID>.json

ingress:
  # Phase 1 of cutover — uncomment this, comment out smanga.shop:
  # - hostname: test.smanga.shop
  #   service: http://localhost:8080
  #   originRequest:
  #     connectTimeout: 30s

  # Phase 2 of cutover — the apex flip:
  - hostname: smanga.shop
    service: http://localhost:8080
    originRequest:
      connectTimeout: 30s

  - service: http_status:404

retries: 5
grace-period: 30s
```

- [ ] **Step 2: Write `deploy/home/systemd/cloudflared-override.conf`**

```ini
# Drop-in for /etc/systemd/system/cloudflared.service.d/override.conf
# Install with: sudo install -D -m 0644 <this file> /etc/systemd/system/cloudflared.service.d/override.conf

[Unit]
Wants=network-online.target
After=network-online.target NetworkManager-wait-online.service
```

- [ ] **Step 3: Commit**

```powershell
git add deploy/home/cloudflared/config.yml.example deploy/home/systemd/cloudflared-override.conf
git commit -m "feat(deploy/home): cloudflared tunnel config + systemd override

Template config.yml routes smanga.shop (or test.smanga.shop during
cutover Phase 1) to the caddy container on localhost:8080. systemd
override ensures cloudflared waits for NetworkManager to bring WiFi
online before attempting tunnel registration — avoids restart loops
on every laptop reboot.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Backup script + systemd units

**Type:** `[AGENT]`

**Files:**
- Create: `deploy/home/scripts/backup.sh`
- Create: `deploy/home/systemd/smanga-backup.service`
- Create: `deploy/home/systemd/smanga-backup.timer`

- [ ] **Step 1: Write `deploy/home/scripts/backup.sh`**

```bash
#!/bin/bash
# Dual-tier backup: nightly pg_dump → HDD (30d retention) → R2 (14d retention).
# Install: copy to /home/smanga/scripts/backup.sh, chmod +x.
set -euo pipefail

STAMP=$(date +%Y-%m-%d)
HDD_DIR=/mnt/hdd/backups
R2_REMOTE=r2:smanga-backups
DUMP="${HDD_DIR}/smanga-${STAMP}.dump"
COMPOSE_FILE=/home/smanga/smanga/docker-compose.prod.yml

# Refuse to write if HDD isn't mounted — better to alert than to write
# nightly backups into /mnt/hdd as a plain root-fs directory that fills up.
mountpoint -q /mnt/hdd || { echo "FATAL: /mnt/hdd not mounted, aborting"; exit 1; }
mkdir -p "$HDD_DIR"

# Tier 1: HDD pg_dump (custom format, parallel-restorable, lvl-6 compress)
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U smanga -d smanga --format=custom --compress=6 --no-owner --no-acl \
  > "$DUMP"

# Tier 1 retention
find "$HDD_DIR" -name 'smanga-*.dump' -mtime +30 -delete

# Tier 2: stream-gzip to R2 (no temp file on root fs)
gzip -c "$DUMP" | rclone rcat "${R2_REMOTE}/smanga-${STAMP}.dump.gz" --quiet

# Tier 2 retention
rclone delete "$R2_REMOTE" --min-age 14d --quiet

echo "[$(date)] backup OK — HDD: $(stat -c %s "$DUMP")B, R2 uploaded"
```

- [ ] **Step 2: Write `deploy/home/systemd/smanga-backup.service`**

```ini
# Install to /etc/systemd/system/smanga-backup.service
[Unit]
Description=SManga nightly backup (pg_dump → HDD + R2)
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
User=smanga
ExecStart=/home/smanga/scripts/backup.sh
StandardOutput=journal
StandardError=journal
```

- [ ] **Step 3: Write `deploy/home/systemd/smanga-backup.timer`**

```ini
# Install to /etc/systemd/system/smanga-backup.timer
# Enable: sudo systemctl enable --now smanga-backup.timer
[Unit]
Description=Run smanga-backup nightly at 02:30

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

- [ ] **Step 4: Shellcheck the script**

```powershell
# Optional if shellcheck installed locally. At minimum:
# Verify shebang + set -euo pipefail present.
Select-String -Pattern "^#!/bin/bash$" deploy/home/scripts/backup.sh
Select-String -Pattern "^set -euo pipefail$" deploy/home/scripts/backup.sh
```

Expected: both lines found.

- [ ] **Step 5: Commit**

```powershell
git add deploy/home/scripts/backup.sh deploy/home/systemd/smanga-backup.service deploy/home/systemd/smanga-backup.timer
git commit -m "feat(deploy/home): nightly pg_dump → HDD + R2 backup

Dual-tier backup script (30d HDD + 14d R2) wired through a systemd
timer firing at 02:30 local. Refuses to run if /mnt/hdd is not mounted
(avoids silently filling the root SSD). Persistent=true means the
timer runs at next boot if the laptop was off at 02:30.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase B — Laptop hardware + OS (3 tasks, HUMAN)

These tasks happen physically on the laptop. The agent's role is to provide commands; the human runs them.

### Task 6: BIOS config + Ubuntu Desktop install + autologin

**Type:** `[HUMAN]`

**Files:** none — laptop configuration only.

- [ ] **Step 1: BIOS AC Power Restore**

Boot into BIOS (typical keys: F1, F2, F10, F12, Delete — varies by vendor). Navigate to **Power Management** (Lenovo: "Power" or "Configuration"; HP: "Advanced"; Dell: "Power Management"). Set:

- **AC Power Recovery / After Power Loss** = **Power On** (or "Last State" if it defaults to On)

Save & exit.

- [ ] **Step 2: Install Ubuntu Desktop 24.04 LTS**

Download ISO from <https://ubuntu.com/download/desktop>. Flash USB with Rufus / balenaEtcher. Boot from USB, install with:

- Erase disk and install Ubuntu (use the 256GB SSD as target)
- User: `smanga`, password: strong
- **Do NOT enable LUKS / full-disk encryption** (breaks unattended power-cut recovery — see spec security tradeoff)
- Skip Ubuntu Pro
- Install third-party drivers if WiFi requires them

- [ ] **Step 3: Enable autologin**

```bash
# Settings GUI: Settings → Users → unlock → toggle "Automatic Login"
# OR via shell:
sudo sed -i 's/^#  AutomaticLoginEnable.*/AutomaticLoginEnable=true/' /etc/gdm3/custom.conf
sudo sed -i 's/^#  AutomaticLogin.*/AutomaticLogin=smanga/' /etc/gdm3/custom.conf
sudo systemctl restart gdm
```

- [ ] **Step 4: Verify**

Power off, unplug, plug back in. Laptop should boot, log in automatically, reach desktop without keyboard input.

**Acceptance criteria:**
- BIOS AC-restore confirmed (or fallback: BIOS lacks the setting → noted in runbook, accept manual power-on after outage).
- Ubuntu boots to desktop without password prompt.
- Laptop hostname is reachable on LAN: `ping <laptop-hostname>.local`.

---

### Task 7: HDD mount + disable suspend/lid + swap

**Type:** `[HUMAN]`

**Files:** none — laptop OS configuration only.

- [ ] **Step 1: Format and mount the HDD**

Identify the HDD device:

```bash
lsblk
# Look for the 1TB drive — likely /dev/sda or /dev/sdb
```

Format as ext4 (DESTROYS DATA on the HDD — confirm you have the right device):

```bash
sudo mkfs.ext4 /dev/sdX   # replace X with the HDD letter
sudo mkdir -p /mnt/hdd

# Get the UUID
HDD_UUID=$(sudo blkid -s UUID -o value /dev/sdX)
echo "UUID=$HDD_UUID  /mnt/hdd  ext4  defaults,noatime,nofail  0  2" | sudo tee -a /etc/fstab

sudo mount /mnt/hdd
df -h | grep /mnt/hdd
```

- [ ] **Step 2: Disable lid suspend + idle suspend**

```bash
sudo sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/' /etc/systemd/logind.conf
sudo sed -i 's/^#\?HandleLidSwitchExternalPower=.*/HandleLidSwitchExternalPower=ignore/' /etc/systemd/logind.conf
sudo systemctl restart systemd-logind
```

Also in Ubuntu Settings → Power:
- Screen Blank: **Never**
- Automatic Suspend: **Off** (both battery and plugged-in)

- [ ] **Step 3: Create 4GB swapfile**

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h    # confirm Swap shows 4.0Gi
```

- [ ] **Step 4: Verify**

```bash
mountpoint -q /mnt/hdd && echo "HDD mounted OK"
grep -E '^/swapfile|^UUID.*hdd' /etc/fstab
swapon --show
```

Expected: all three return positive output.

- [ ] **Step 5: Lid-close stress test**

Close the lid. Verify SSH from another machine on the LAN still works (laptop stays awake).

**Acceptance criteria:**
- `/mnt/hdd` mounted, 950GB+ available.
- 4GB swap active.
- Closing the lid does NOT suspend the laptop.

---

### Task 8: Docker + git on the laptop

**Type:** `[HUMAN]`

**Files:** none — laptop OS configuration.

- [ ] **Step 1: Install Docker via the official convenience script**

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker smanga
# Log out + back in (or `newgrp docker`) for the group to take effect
docker --version          # 27.x
docker compose version    # v2.x
```

- [ ] **Step 2: Install git + rclone (for later tasks)**

```bash
sudo apt-get install -y git rclone
```

- [ ] **Step 3: Verify Docker without sudo**

```bash
docker run --rm hello-world
```

Expected: image pulls, container runs, prints the "Hello from Docker!" message.

**Acceptance criteria:**
- `docker --version` returns 27.x or newer.
- `docker compose version` returns v2.x.
- Non-root `docker run hello-world` succeeds.

---

## Phase C — Cloudflared tunnel (2 tasks, HUMAN)

### Task 9: Install cloudflared + create tunnel

**Type:** `[HUMAN]`

**Files:** uses `deploy/home/cloudflared/config.yml.example` from Task 4.

- [ ] **Step 1: Install cloudflared from official apt repo**

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update
sudo apt-get install -y cloudflared
cloudflared --version    # 2024.x or newer
```

- [ ] **Step 2: Authenticate**

```bash
cloudflared tunnel login
```

A URL is printed. Open it in a browser, sign in to Cloudflare, authorize the `smanga.shop` zone. Cert lands at `~/.cloudflared/cert.pem`.

- [ ] **Step 3: Create the tunnel**

```bash
cloudflared tunnel create smanga-prod
```

Note the printed **tunnel UUID** and the credentials file (`~/.cloudflared/<UUID>.json`). Both are needed in the next task.

- [ ] **Step 4: Move credentials to /etc/cloudflared and prepare config.yml**

```bash
sudo mkdir -p /etc/cloudflared
sudo mv ~/.cloudflared/<UUID>.json /etc/cloudflared/
sudo chown root:root /etc/cloudflared/*

# Pull config template from the repo (you'll clone the repo on the laptop in Task 11
# or scp the file from your workstation — either works)
sudo cp <path-to-checkout>/deploy/home/cloudflared/config.yml.example /etc/cloudflared/config.yml
sudo sed -i "s/<UUID>/<your tunnel UUID>/g" /etc/cloudflared/config.yml
```

Comment out the `smanga.shop` ingress block and uncomment the `test.smanga.shop` block (this is the cutover Phase 1 layout — see Task 16).

- [ ] **Step 5: Verify config parses**

```bash
cloudflared tunnel ingress validate --config /etc/cloudflared/config.yml
```

Expected: `Validating rules from /etc/cloudflared/config.yml` … `OK`.

**Acceptance criteria:**
- `~/.cloudflared/cert.pem` exists.
- `cloudflared tunnel list` shows the `smanga-prod` tunnel.
- `/etc/cloudflared/config.yml` validates.

---

### Task 10: Route test subdomain + install systemd service

**Type:** `[HUMAN]`

**Files:** uses `deploy/home/systemd/cloudflared-override.conf` from Task 4.

- [ ] **Step 1: Route DNS for the test subdomain**

```bash
cloudflared tunnel route dns smanga-prod test.smanga.shop
```

Expected: `Added CNAME test.smanga.shop which will route to this tunnel`.

This auto-creates a CNAME `test.smanga.shop → <UUID>.cfargotunnel.com` in Cloudflare DNS with proxy ON.

- [ ] **Step 2: Install systemd service**

```bash
sudo cloudflared service install
```

This generates `/etc/systemd/system/cloudflared.service` pointing at `/etc/cloudflared/config.yml`.

- [ ] **Step 3: Apply the network-online drop-in**

```bash
sudo install -D -m 0644 <path-to-checkout>/deploy/home/systemd/cloudflared-override.conf \
  /etc/systemd/system/cloudflared.service.d/override.conf

sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

Expected: `Active: active (running)` with no errors in `journalctl -u cloudflared -n 50`.

- [ ] **Step 4: Smoke test the tunnel without the app stack running**

```bash
# From any browser or curl, OUTSIDE the laptop network:
curl -I https://test.smanga.shop
```

Expected: HTTP **502** or **530** (origin not running yet — app stack comes up in Task 11). This proves Cloudflare → laptop tunnel handshake works.

**Acceptance criteria:**
- `systemctl is-active cloudflared` returns `active`.
- `https://test.smanga.shop` returns a Cloudflare error page (origin unreachable, not a Cloudflare 522 timeout) — meaning the tunnel itself is up.

---

## Phase D — Bring app stack up (2 tasks, HUMAN)

### Task 11: Copy deploy/home/, configure .env, first compose up

**Type:** `[HUMAN]`

**Files:** uses everything from Tasks 1–5.

- [ ] **Step 1: Clone the repo on the laptop**

```bash
mkdir -p ~/smanga
cd ~/smanga
git clone https://github.com/sun-0207/smanga.git .
# OR: scp -r the deploy/home tree from the workstation:
# scp -r deploy/home smanga@<laptop-ip>:~/smanga/
```

- [ ] **Step 2: Copy template + populate .env**

```bash
cd ~/smanga/deploy/home
cp .env.example .env

# Generate strong secrets
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=')" > .env.new
echo "JWT_SECRET=$(openssl rand -base64 32 | tr -d '/+=')" >> .env.new
echo "GHCR_OWNER=sun-0207" >> .env.new
# Paste Google OAuth creds from Railway env / Google Cloud Console
read -p "AUTH_GOOGLE_ID: " gid
read -p "AUTH_GOOGLE_SECRET: " gsec
echo "AUTH_GOOGLE_ID=$gid" >> .env.new
echo "AUTH_GOOGLE_SECRET=$gsec" >> .env.new
mv .env.new .env
chmod 600 .env
```

- [ ] **Step 3: Make init-db.sh executable**

```bash
chmod +x ~/smanga/deploy/home/init-db.sh
```

- [ ] **Step 4: First pull + up**

```bash
cd ~/smanga/deploy/home
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

Expected: all services `Up`, postgres + redis healthy. Watch api logs until "Nest application successfully started":

```bash
docker compose -f docker-compose.prod.yml logs -f api
# Ctrl+C once you see the startup line
```

- [ ] **Step 5: Local smoke**

```bash
curl -s http://localhost:8080/api/v1/health
```

Expected: `{"status":"ok"}` or similar JSON OK response.

```bash
curl -I http://localhost:8080/
```

Expected: `HTTP/1.1 200 OK`, `content-type: text/html`.

- [ ] **Step 6: External smoke through the tunnel**

```bash
curl -s https://test.smanga.shop/api/v1/health
```

Expected: same `{"status":"ok"}` JSON, served via Cloudflare → tunnel → caddy → api.

**Acceptance criteria:**
- All 6 services in `docker compose ps` show `running` and (where applicable) `healthy`.
- `https://test.smanga.shop/api/v1/health` returns 200 with `{"status":"ok"}`.

---

### Task 12: Bootstrap admin + end-to-end smoke

**Type:** `[HUMAN]`

**Files:** none.

- [ ] **Step 1: Register admin user**

```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"cuthanhson27@gmail.com","password":"<strong-pass>","name":"Sunny"}'
```

Expected: `{"accessToken":"..."}` or similar success body.

- [ ] **Step 2: Promote to admin role**

```bash
docker compose -f ~/smanga/deploy/home/docker-compose.prod.yml exec postgres \
  psql -U smanga -d smanga -c "UPDATE \"user\" SET role='admin' WHERE email='cuthanhson27@gmail.com';"
```

Expected: `UPDATE 1`.

- [ ] **Step 3: End-to-end smoke through `test.smanga.shop`**

In a real browser (not laptop):

- Visit `https://test.smanga.shop` → landing page renders.
- Click "Đăng nhập" → log in as admin.
- Navigate to `/admin/sources` → add `truyenfull` source if not seeded.
- `/admin/discover` → pick a category → import 1 story.
- Wait for Bull queue to crawl (check `/admin/jobs`).
- Once status = `complete`, visit `/truyen/<slug>` → open chapter 1 → text loads.

- [ ] **Step 4: Cover serving smoke**

Click into a story with a cover image. Verify the cover image loads (not a broken-image icon). Cloudflare caches `/api/v1/cover/*` per CF Cache Rules (set in Plan 8 Task 2 — verify they exist in CF dashboard; if not, add them).

**Acceptance criteria:**
- Admin can register, log in, import a story, crawl it, read a chapter.
- Cover image renders from `https://test.smanga.shop/api/v1/cover/<id>`.

---

## Phase E — Backup wire-up (2 tasks, HUMAN)

### Task 13: R2 bucket + rclone config

**Type:** `[HUMAN]`

**Files:** none — Cloudflare dashboard + laptop rclone config only.

- [ ] **Step 1: Create R2 bucket**

Cloudflare dashboard → **R2** → **Create bucket** → name `smanga-backups`, location auto.

- [ ] **Step 2: Generate scoped API token**

R2 dashboard → **Manage R2 API Tokens** → **Create API Token**:
- Permissions: **Object Read & Write**
- Restrict to bucket: `smanga-backups`
- Note: **Access Key ID**, **Secret Access Key**, **S3 endpoint URL**

- [ ] **Step 3: Configure rclone on the laptop**

```bash
rclone config
```

Interactive prompts:
- `n` (new remote)
- name: `r2`
- storage: `s3`
- provider: `Cloudflare`
- env_auth: `false`
- access_key_id: paste from Step 2
- secret_access_key: paste
- region: `auto`
- endpoint: paste the S3 endpoint URL (looks like `https://<acct>.r2.cloudflarestorage.com`)
- leave the rest default
- `y` to save

- [ ] **Step 4: Verify**

```bash
rclone lsd r2:
rclone lsd r2:smanga-backups
```

Expected: lists buckets (one of which is `smanga-backups`), then an empty bucket listing.

**Acceptance criteria:**
- `~/.config/rclone/rclone.conf` contains the `[r2]` section.
- `rclone lsd r2:smanga-backups` exits 0 with no entries (empty bucket).

---

### Task 14: Install backup script + systemd timer

**Type:** `[HUMAN]`

**Files:** uses `deploy/home/scripts/backup.sh` + the two systemd units from Task 5.

- [ ] **Step 1: Install the script**

```bash
mkdir -p ~/scripts
cp ~/smanga/deploy/home/scripts/backup.sh ~/scripts/backup.sh
chmod +x ~/scripts/backup.sh
```

- [ ] **Step 2: Install systemd units**

```bash
sudo install -D -m 0644 ~/smanga/deploy/home/systemd/smanga-backup.service /etc/systemd/system/smanga-backup.service
sudo install -D -m 0644 ~/smanga/deploy/home/systemd/smanga-backup.timer   /etc/systemd/system/smanga-backup.timer
sudo systemctl daemon-reload
```

- [ ] **Step 3: Run once manually**

```bash
sudo systemctl start smanga-backup.service
sudo journalctl -u smanga-backup.service -n 30 --no-pager
```

Expected: log ends with `backup OK — HDD: <bytes>B, R2 uploaded`.

- [ ] **Step 4: Verify both tiers**

```bash
ls -la /mnt/hdd/backups/
rclone ls r2:smanga-backups/
```

Expected: today's dump file in both locations.

- [ ] **Step 5: Enable the timer**

```bash
sudo systemctl enable --now smanga-backup.timer
systemctl list-timers smanga-backup.timer --all
```

Expected: timer shown, next fire at next 02:30.

- [ ] **Step 6: Restore drill (in throwaway container)**

```bash
# Pull latest dump
LATEST=$(rclone lsf r2:smanga-backups/ | sort | tail -1)
rclone copy "r2:smanga-backups/$LATEST" /tmp/

# Spin up a throwaway postgres
docker run --rm -d --name pg-restore-test -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:17-alpine
sleep 5
gunzip "/tmp/$LATEST"
DUMP="${LATEST%.gz}"
pg_restore -h localhost -p 55432 -U postgres -d postgres --create "/tmp/$DUMP"
docker exec pg-restore-test psql -U postgres -d smanga -c "SELECT count(*) FROM story;"

# Clean up
docker stop pg-restore-test
rm -f /tmp/$LATEST /tmp/$DUMP
```

Expected: row count matches the laptop's live DB.

**Acceptance criteria:**
- One manual backup landed on HDD AND R2.
- Timer enabled, next fire at 02:30.
- Restore drill recreates the DB to identical row count.

---

## Phase F — CI auto-deploy (1 task, HYBRID)

### Task 15: Push commits, verify Watchtower pulls

**Type:** `[HYBRID]` — agent commits a no-op marker, human watches the laptop journal.

**Files:**
- Modify: a marker file or a comment somewhere harmless (e.g., bump a version comment in `apps/api/package.json`).

- [ ] **Step 1: Verify GHCR packages are public**

After the very first GH Actions run on `main` lands (after the human pushes the Plan 9 commits), check <https://github.com/users/sun-0207/packages?repo_name=smanga>. For each package:
- **Package settings** → **Change package visibility** → **Public**

Alternative: keep private and `docker login ghcr.io` on the laptop with a PAT (`read:packages` scope). Public is simpler.

- [ ] **Step 2: Push the Phase A commits to remote**

This is the **first user-driven push** — the agent prepares the commits locally, the user pushes from their workstation when ready:

```powershell
git push origin main
```

GH Actions runs `build-images.yml`, builds + pushes both images.

- [ ] **Step 3: Verify GHCR has new images**

```powershell
# From workstation
gh api -H "Accept: application/vnd.github+json" /users/sun-0207/packages/container/smanga-api/versions
gh api -H "Accept: application/vnd.github+json" /users/sun-0207/packages/container/smanga-frontend/versions
```

Or browse the package versions UI on github.com. Expected: a new version tagged with the just-pushed commit SHA.

- [ ] **Step 4: Watch Watchtower pull on the laptop**

```bash
# On the laptop
docker logs -f $(docker ps -q --filter "name=watchtower")
```

Within 5 minutes of the image push, Watchtower logs should show:
```
Found new ghcr.io/sun-0207/smanga-api:latest image (...)
Stopping /smanga-deploy-laptop-api-1 ...
Creating /smanga-deploy-laptop-api-1 ...
```

After restart, verify the new container exists:

```bash
docker compose -f ~/smanga/deploy/home/docker-compose.prod.yml ps api
docker inspect --format='{{.Image}}' $(docker compose -f ~/smanga/deploy/home/docker-compose.prod.yml ps -q api)
```

- [ ] **Step 5: Smoke after restart**

```bash
curl -s https://test.smanga.shop/api/v1/health
```

Expected: `{"status":"ok"}` again.

**Acceptance criteria:**
- New images appear on GHCR after `git push`.
- Watchtower pulls + restarts api + frontend on the laptop within 10 min (5 min poll + ~2 min restart).
- Smoke remains healthy through the restart blip (~10-20s of 502, then 200).

---

## Phase G — Cutover (3 tasks, HUMAN)

### Task 16: 24-hour soak test on `test.smanga.shop`

**Type:** `[HUMAN]`

**Files:** none — operational monitoring only.

- [ ] **Step 1: Set up UptimeRobot**

<https://uptimerobot.com> → new monitor:
- Type: HTTP(s)
- URL: `https://test.smanga.shop/api/v1/health`
- Interval: 5 min
- Email alerts: on

- [ ] **Step 2: Soak for 24 hours**

Leave the laptop running, plugged in, lid closed (optional). Periodically check:

```bash
# Laptop didn't sleep (battery survived)
uptime    # should show >24h
# No service restarts due to crash
docker compose -f ~/smanga/deploy/home/docker-compose.prod.yml ps
# Cloudflared journal clean
sudo journalctl -u cloudflared --since "24 hours ago" | grep -iE 'error|fail' | wc -l
# Backup ran overnight
ls -la /mnt/hdd/backups/
```

- [ ] **Step 3: Acceptance criteria for cutover**

Decide go/no-go on flipping the apex:

- UptimeRobot reports >99% uptime in the 24h window.
- No unscheduled container restarts (other than Watchtower-driven).
- Backup landed on both tiers overnight.
- Cloudflared journal has no `ERROR` lines.

If any fail → debug + restart Phase 1 timer. If pass → proceed to Task 17.

---

### Task 17: Flip apex DNS to laptop

**Type:** `[HUMAN]`

**Files:** modify `/etc/cloudflared/config.yml` on the laptop.

- [ ] **Step 1: Pre-flip safety net**

Confirm UptimeRobot still green on `test.smanga.shop`. Have rollback notes ready (see "Rollback" below).

- [ ] **Step 2: Delete the existing CNAME for `smanga.shop` in Cloudflare DNS**

Cloudflare Dashboard → DNS → records for `smanga.shop` zone → find the `smanga.shop` (apex) entry currently pointing at Vercel → **Delete**.

⚠ Do NOT delete records for `www.smanga.shop` or any other subdomain — only the apex.

- [ ] **Step 3: Update cloudflared config**

```bash
sudo nano /etc/cloudflared/config.yml
```

Comment out the `test.smanga.shop` ingress block, uncomment the `smanga.shop` block:

```yaml
ingress:
  - hostname: smanga.shop
    service: http://localhost:8080
    originRequest:
      connectTimeout: 30s
  - service: http_status:404
```

- [ ] **Step 4: Restart cloudflared**

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
```

Expected: `Active: active (running)`.

- [ ] **Step 5: Add the apex DNS route**

```bash
cloudflared tunnel route dns smanga-prod smanga.shop
```

Expected: `Added CNAME smanga.shop which will route to this tunnel`.

- [ ] **Step 6: Wait ~2 min for DNS propagation, then smoke**

```bash
dig +short smanga.shop                                  # should resolve to CF anycast IPs
curl -s https://smanga.shop/api/v1/health               # {"status":"ok"}
```

In a real browser, full smoke flow (login + read a chapter).

- [ ] **Step 7: Update Google OAuth Console (if not already done)**

<https://console.cloud.google.com> → OAuth client → Authorized redirect URIs → ensure all three:
- `http://localhost:3001/api/v1/auth/google/callback`
- `https://<vercel-staging-url>.vercel.app/api/v1/auth/google/callback`
- `https://smanga.shop/api/v1/auth/google/callback` ← **must be present** for laptop login

- [ ] **Step 8: Update UptimeRobot monitor URL** from `test.smanga.shop` → `smanga.shop`.

**Acceptance criteria:**
- `https://smanga.shop` serves the SManga app from the laptop.
- Login + read flow works end-to-end through the apex domain.
- Google OAuth login works (callback succeeds).

---

### Task 18: Disable staging auto-refresh

**Type:** `[HUMAN]`

**Files:** none — Vercel/Railway-side admin UI only.

- [ ] **Step 1: Stop staging from re-crawling**

Browser → `https://<vercel-staging-url>.vercel.app/admin/settings` → toggle **Auto-refresh / scheduled refresh** OFF.

This prevents the staging Bull worker on Railway from re-crawling sources into the Neon DB, which would waste Neon row quota and double the crawl load against `truyenfull.today`.

- [ ] **Step 2: Optional — downgrade Neon to free tier**

If the Neon instance is on a paid tier, downgrade to free (1 project, 0.5GB) since staging traffic is light. Save cost.

- [ ] **Step 3: Optional — note Vercel deployment URL in MEMORY.md**

The staging URL is now the de facto QA env. Record it so future sessions know where staging lives (Task 20).

**Acceptance criteria:**
- Vercel staging UI loads, login works, admin can still operate (just no scheduled crawl).
- Railway admin shows the Bull worker idle (no new jobs queued).

---

## Phase H — Documentation (2 tasks, AGENT)

### Task 19: Write `docs/home-runbook.md`

**Type:** `[AGENT]`

**Files:**
- Create: `docs/home-runbook.md`

- [ ] **Step 1: Write the runbook**

```markdown
# SManga laptop runbook

Operational reference for the laptop self-host deploy (Plan 9). Read this first when something breaks.

## SSH (local LAN only)

```bash
ssh smanga@<laptop-ip-or-hostname>.local
```

The laptop has no public SSH port — only Cloudflare Tunnel for HTTPS ingress. If you need remote shell access, add a Cloudflared SSH tunnel (out of scope for Plan 9).

## Restart procedures

**Single service:**

```bash
docker compose -f ~/smanga/deploy/home/docker-compose.prod.yml restart api
```

**Full stack:**

```bash
cd ~/smanga/deploy/home
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

**After laptop reboot (e.g. power outage):**

Docker daemon starts automatically (`restart: unless-stopped` on every service brings the stack back). If services don't auto-start, run the "Full stack" command above.

## Logs

```bash
# Last 100 lines of each service
docker compose -f ~/smanga/deploy/home/docker-compose.prod.yml logs --tail=100 api
docker compose -f ~/smanga/deploy/home/docker-compose.prod.yml logs --tail=100 frontend
docker compose -f ~/smanga/deploy/home/docker-compose.prod.yml logs --tail=100 caddy

# Cloudflared
sudo journalctl -u cloudflared -n 100 --no-pager

# Backups
sudo journalctl -u smanga-backup.service -n 50 --no-pager
```

## Restore from R2 backup

```bash
# Pull latest
LATEST=$(rclone lsf r2:smanga-backups/ | sort | tail -1)
rclone copy "r2:smanga-backups/$LATEST" /tmp/

# Stop api so migrations don't race
docker compose -f ~/smanga/deploy/home/docker-compose.prod.yml stop api

# Restore into running postgres container
gunzip "/tmp/$LATEST"
DUMP="${LATEST%.gz}"
docker compose -f ~/smanga/deploy/home/docker-compose.prod.yml exec -T postgres \
  pg_restore -U smanga -d smanga --clean --if-exists < "/tmp/$DUMP"

# Restart api
docker compose -f ~/smanga/deploy/home/docker-compose.prod.yml start api
```

## Rollback to Vercel-Railway-Neon

If the laptop deploy breaks badly:

1. Cloudflare Dashboard → DNS → find CNAME `smanga.shop` → tunnel UUID → **Delete**.
2. Create CNAME `smanga.shop` → `<vercel-staging-url>.vercel.app`, proxy ON.
3. TTL 120s. Users land on the old Vercel stack within ~2 min.

Note: laptop fresh DB users lose progress on rollback (accepted hobby tradeoff).

## Common failures

| Symptom | Probable cause | Fix |
|---|---|---|
| CF shows 522 timeout | Tunnel up but origin down | `docker compose ps` → restart services |
| CF shows 530 | Tunnel itself down | `sudo systemctl restart cloudflared` |
| 502 from caddy | API container unhealthy | `docker compose logs api` → fix → restart |
| 503 burst at deploy time | Watchtower restarting api | Normal, blip is 10-20s |
| Postgres OOM (api timeouts) | Heavy crawl + 4GB swap not enough | Tune `shared_buffers=512MB`, scale crawl concurrency down |
| HDD not mounting | Cable / fs corruption | `nofail` lets boot continue; check `dmesg`, `sudo mount -a`, `fsck` if needed |
| Watchtower never pulls | GHCR auth or label issue | `docker logs watchtower`, verify api/frontend have `com.centurylinklabs.watchtower.enable=true` label |
| Backup script fails with "HDD not mounted" | exactly that | `mount /mnt/hdd`, then `systemctl start smanga-backup.service` to retry |

## Resource usage check

```bash
# Free RAM, swap
free -h

# Disk usage
df -h
du -sh /mnt/hdd/backups/

# Docker disk usage
docker system df

# Top CPU/RAM consumers
docker stats --no-stream
```

## Cloudflare cache purge

CF Dashboard → Caching → Configuration → **Purge Everything** (after major frontend deploy) or **Custom Purge** by URL.

## Power outage recovery checklist

1. Power back → BIOS auto-on → boot to Ubuntu desktop (autologin).
2. Docker daemon starts → compose services with `restart: unless-stopped` come up.
3. cloudflared systemd unit starts after `NetworkManager-wait-online.service`.
4. Wait ~3 min total for everything to stabilize.
5. Smoke: `curl -s https://smanga.shop/api/v1/health`.

If something didn't come back: SSH from LAN, run "Full stack" restart from above.

## Updating the laptop deploy

Don't manually `docker compose pull` — Watchtower handles it within 5 min of any `git push origin main` on GitHub.

For emergency manual deploy (e.g. Watchtower-down or specific SHA):

```bash
cd ~/smanga/deploy/home
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

For rollback to a specific SHA without pushing new code: edit `docker-compose.prod.yml`, change `:latest` to `:<sha>`, then `up -d`. Or re-tag `:latest` on GHCR via the web UI to point at the known-good SHA.
```

- [ ] **Step 2: Commit**

```powershell
git add docs/home-runbook.md
git commit -m "docs(plan9): laptop self-host operational runbook

Quick-reference doc for the laptop deploy: SSH, restart procedures, log
locations, R2 restore, rollback to Vercel-Railway-Neon, common failure
modes, power-outage recovery checklist, manual deploy escape hatch.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 20: Update CLAUDE.md + MEMORY.md

**Type:** `[AGENT]`

**Files:**
- Modify: `CLAUDE.md` (append Plan 9 state note)
- Modify: `MEMORY.md` (auto-memory index — add Plan 9 pointer)
- Create: `C:\Users\son.cu\.claude\projects\c--Users-son-cu-opswat-project-smanga\memory\plan_smanga_laptop_self_host.md`

- [ ] **Step 1: Add Plan 9 line to `MEMORY.md`**

Find the existing block of `[SManga Plan N]` entries and append (after the Plan 8 line):

```markdown
- [SManga Plan 9 Laptop self-host](plan_smanga_laptop_self_host.md) — spec+plan written 2026-06-05, NOT executed; cloudflared tunnel + Watchtower + dual-tier R2 backup; laptop=prod, Vercel=staging
```

- [ ] **Step 2: Create the memory file**

Path: `C:\Users\son.cu\.claude\projects\c--Users-son-cu-opswat-project-smanga\memory\plan_smanga_laptop_self_host.md`

```markdown
---
name: plan-smanga-laptop-self-host
description: Plan 9 — self-host SManga prod on home laptop (Ubuntu 24.04 + cloudflared tunnel + Watchtower + R2 backup), spec+plan written 2026-06-05, NOT executed yet
metadata:
  type: project
---

Plan 9: Move SManga production off the managed Vercel + Railway + Neon + Upstash stack onto a home laptop running Ubuntu Desktop 24.04 with Cloudflare Tunnel ingress. Vercel becomes the staging environment at <deployment>.vercel.app.

**Status:** Spec + plan written and committed on 2026-06-05. Implementation not yet started.

**Hard constraints (per user):**
- Laptop = prod, Vercel = staging (unusual flip; user accepts residential ISP uptime risk).
- Ubuntu Desktop 24.04 + autologin (not Server).
- SSD = hot data, HDD = nightly pg_dump backup tier (30d retention). R2 offsite (14d retention).
- WiFi only, no UPS — laptop battery is informal UPS.
- Fresh DB on laptop (no Neon → laptop data migration). Catalog rebuilt via admin discover flow.
- Watchtower polls GHCR every 5 min for zero-touch deploys.
- Approach C: cloudflared NATIVE systemd daemon (NOT in docker compose); app stack in docker compose.

**Why:** User has an idle laptop with 8GB+ RAM, 256GB SSD + 1TB HDD. Marginal cost ~$3.6/mo electricity vs $5/mo Hetzner (Plan 8) vs $0-40/mo current managed stack depending on Neon row count. User wants hands-on infra learning + direct control over prod.

**How to apply:** When starting Plan 9 implementation, read [[plan-smanga-laptop-self-host-spec]] for the design and the plan file at docs/superpowers/plans/2026-06-05-plan-9-laptop-self-host.md for task-by-task execution. Many tasks are HUMAN-only (BIOS, OS install, Cloudflare dashboard) — agent's job is to produce exact commands the human runs. Agent-doable tasks are repo file scaffolding (Phase A) and docs (Phase H). Constraint: commit-only, NEVER push.
```

- [ ] **Step 3: Append Plan 9 status to CLAUDE.md "State of play"**

In the `## State of play` section of `CLAUDE.md`, append after the existing bullet list:

```markdown
- **Plan 9 (Laptop self-host) drafted 2026-06-05** — spec + implementation plan committed. Not yet executed. Target: laptop = prod via cloudflared tunnel, Vercel = staging.
```

- [ ] **Step 4: Commit all three**

```powershell
git add MEMORY.md CLAUDE.md "C:\Users\son.cu\.claude\projects\c--Users-son-cu-opswat-project-smanga\memory\plan_smanga_laptop_self_host.md"
git commit -m "docs(plan9): index Plan 9 in CLAUDE.md + MEMORY.md

Adds the Plan 9 (laptop self-host) entry to the auto-memory index and
appends a state-of-play note to the project CLAUDE.md so future
sessions pick up the context.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Risk register (cross-cutting)

| Risk | Phase exposed | Mitigation |
|---|---|---|
| Wrong device formatted in Task 7 → data loss | Phase B | Read `lsblk` output carefully, confirm device size matches the HDD. |
| Wrong DNS record deleted in Task 17 → Vercel staging breaks | Phase G | Only delete the apex `smanga.shop` record. `www.smanga.shop` and any other subdomain stay. |
| GHCR rate-limit blocks Watchtower → no auto-deploy | Phase F | Keep packages public. If private, `docker login ghcr.io` with a PAT first. |
| Cloudflared can't reach origin after a Watchtower restart | Phase F / G | caddy `restart: unless-stopped` brings it back. cloudflared retries built-in. |
| Backup runs while DB is being heavily written → slow pg_dump | Phase E | 02:30 is off-peak. If still problematic, switch to `pg_basebackup` (out of scope). |
| HDD silently fails → backups go through but later reveal corrupt | Phase E | Monthly restore drill (Task 14 Step 6) catches it. |
| Laptop battery wears out → loses informal UPS | Long-term | Replace battery, or skip to ethernet+UPS upgrade later. |

---

## Self-review

**Spec coverage check (all spec sections accounted for):**

- "Hardware + OS setup" → Tasks 6, 7, 8
- "Storage layout" → Task 7 (HDD mount), Task 3 (compose volumes)
- "Software stack" → Task 3 (compose), Task 1+2 (Dockerfiles+CI)
- "Cloudflared tunnel setup" → Tasks 4, 9, 10
- "Google OAuth callback" → Task 17 step 7
- "Backup — dual-tier" → Tasks 5, 13, 14
- "Deploy flow" → Tasks 2, 15
- "Cutover plan" → Tasks 16, 17, 18
- "Rollback" → runbook (Task 19)
- "Monitoring" → Task 16 step 1 (UptimeRobot)
- "Failure modes" → runbook
- "Cost recap" → no implementation needed (informational in spec)

**No placeholders:** every "<UUID>", "<your tunnel UUID>", "<path-to-checkout>", "<sha>", "<strong-pass>", "<laptop-ip-or-hostname>" is an explicit user-substituted value with context for what to fill in. Not a "TODO" or "TBD".

**Type/naming consistency:** GHCR package names `smanga-api` + `smanga-frontend` are used identically across Tasks 1, 2, 3, 15. systemd unit names `smanga-backup.service` + `smanga-backup.timer` consistent across Tasks 5, 14. Tunnel name `smanga-prod` consistent across Tasks 9, 10, 17.

---

## Execution choice

Plan ready. Two execution options:

**1. Subagent-Driven (recommended for Phase A + H)** — fresh subagent per file-scaffolding task, two-stage review between tasks. Agent can't do Phase B-G HUMAN tasks; that's user-driven.

**2. Inline Execution** — walk through Phase A + H step-by-step with the user, batch by batch.

Note: Phases B-G are HUMAN-execution by definition. The agent's role in those is to produce + verify the artifacts in Phases A and H, then guide the user through laptop tasks interactively as the user runs them.
