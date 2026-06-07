# Plan 9 — Self-host SManga production on home laptop (design)

> **Status:** Design spec (2026-06-05). Implementation plan to follow via `superpowers:writing-plans`.
>
> **Prerequisites:** Plan 6 (managed deploy on Vercel + Railway + Neon + Upstash) and Plan 7 (catalog discovery) shipped. Cloudflare account with `smanga.shop` zone active. Old laptop with ≥8GB RAM, ≥i5 (2018+), 256GB SSD, 1TB HDD available.
>
> **Amendment 2026-06-07:** Plan executed AND the Vercel staging tier was killed the same day per user decision. The spec below still describes a two-tier architecture (laptop=prod, Vercel=staging) because that is what was designed — it is no longer accurate. SManga runs as a **single environment** (laptop prod only). Components table row 9 ("Vercel staging — unchanged") and every "staging" reference is HISTORICAL. See `CLAUDE.md` § State of play for the authoritative current architecture.

## Goal

Move SManga **production** off the managed cloud stack and onto a home laptop running Ubuntu Desktop 24.04. Public access via **Cloudflare Tunnel** (no port forwarding required from residential ISP). The current Vercel + Railway + Neon stack stays alive at its default `*.vercel.app` URL as a **staging environment** — every PR/push deploys there first, hand-verified, then the same image automatically rolls onto the laptop via Watchtower polling GHCR.

## Hard constraints from user

- **Laptop = prod**, Vercel = staging (unusual flip; user accepts residential ISP uptime).
- OS: **Ubuntu Desktop 24.04** with autologin (not Server) — keep GUI for occasional direct use.
- Storage: **SSD = hot data** (OS + Postgres data + Redis dump), **HDD = cold backup** (nightly pg_dump snapshots, 30-day retention).
- Public ingress: **Cloudflare Tunnel** only — no port-forward, no public IP needed.
- **No data migration from Neon** — laptop starts with fresh DB; catalog rebuilt via admin discover flow.
- Network: **WiFi only**, no UPS (laptop battery acts as informal UPS).
- Deploy: **zero-touch on push to main** — laptop pulls new images from GHCR on its own.
- Backup: dual-tier, R2 offsite mandatory for SSD-failure survival.
- Cloudflare Tunnel **TOS compliance** — text + small JPEG covers only (no video / large-file mirror).
- Stay within Cloudflare R2 free tier (10GB).

## Architecture

```
        ┌──────────────────────────────────────────────────────┐
USER ─► │           Cloudflare edge (CDN + WAF + SSL)          │
        └──────────────────────┬───────────────────────────────┘
                               │ HTTPS via Cloudflare Tunnel
                               │ (outbound only — no inbound port)
                               ▼
        ┌──────────────────────────────────────────────────────┐
        │  Laptop (Ubuntu Desktop 24.04 + autologin, WiFi)     │
        │  ┌────────────────────────────────────────────────┐  │
        │  │  cloudflared (systemd, NATIVE — not in docker) │  │
        │  │   smanga.shop → http://localhost:8080            │  │
        │  └────────────────────┬───────────────────────────┘  │
        │                       │                                │
        │                       ▼                                │
        │  ┌────────────────────────────────────────────────┐  │
        │  │  caddy (docker compose) :8080                   │  │
        │  │   /api/* → api:3001                              │  │
        │  │   /     → frontend:80                            │  │
        │  └─────┬─────────────────┬─────────────────────────┘  │
        │        ▼                 ▼                              │
        │  ┌──────────┐    ┌───────────────┐                     │
        │  │ api      │    │ frontend      │  ← nginx + Vite     │
        │  │ NestJS   │    │ (static)      │     build           │
        │  │ + Bull   │    └───────────────┘                     │
        │  └─┬────┬───┘                                          │
        │    ▼    ▼                                              │
        │  ┌────┐ ┌──────┐    ┌────────────────────────────────┐│
        │  │ pg │ │redis │    │ watchtower (compose) every 5min ││
        │  └─┬──┘ └──────┘    │  GHCR poll → auto pull+restart  ││
        │    │ data            └────────────────────────────────┘│
        │    ▼                                                    │
        │  SSD volumes        (/var/lib/docker)                  │
        │  HDD backups        (/mnt/hdd/backups, 30d retention)  │
        └────────────────────┬─────────────────────────────────┘
                             │ rclone copy (systemd timer 02:30)
                             ▼
              Cloudflare R2 `smanga-backups` (14d retention, offsite)
```

## Components

| # | Component | Where | Role |
|---|---|---|---|
| 1 | **cloudflared** | systemd daemon (native, NOT in docker) | Public ingress tunnel. Maps `smanga.shop` → `localhost:8080`. |
| 2 | **caddy** | docker compose | Reverse proxy. `/api/*` → api, `/` → frontend. Listens `:8080` localhost only. |
| 3 | **api** | docker compose, image `ghcr.io/sun-0207/smanga-api:latest` | NestJS + Bull worker (single container). |
| 4 | **frontend** | docker compose, image `ghcr.io/sun-0207/smanga-frontend:latest` | nginx serving Vite build. |
| 5 | **postgres** | docker compose, `postgres:17-alpine`, volume `postgres-data` on SSD | DB. |
| 6 | **redis** | docker compose, `redis:7-alpine`, volume `redis-data` on SSD | Bull queue + cache. |
| 7 | **watchtower** | docker compose | Polls GHCR every 5 min, restarts api/frontend on new image. |
| 8 | **backup script** | systemd timer (native) | Nightly 02:30 → HDD `pg_dump` + R2 upload via rclone. |
| 9 | **Vercel staging** | unchanged | Hosts pre-merge testing at `<deployment>.vercel.app`. Untouched by this plan. |

## Approach decision

Three approaches were considered:

- **A — All-in-one docker-compose** (cloudflared in compose). Simpler, but CF official docs recommend native cloudflared daemon for prod tunnels; container restart cascades.
- **B — Native postgres + redis** (lean, only app in Docker). Saves ~300MB RAM but adds 3 systemd services to manage; backup script gets more complex.
- **C — Docker compose for app + native cloudflared** *(chosen)*. Middle ground. App stack stays portable (Plan 8 patterns reused verbatim), cloudflared follows CF's recommended deployment, tunnel restarts don't affect app.

## Hardware + OS setup

### BIOS

- **AC Power Restore = ON** — laptop boots automatically when AC returns after a power outage. Required for unattended recovery.
- Secure Boot: leave default; no impact.

### Ubuntu Desktop 24.04 LTS

- Install standard desktop. User: `smanga`. Auto Login: enable (Settings → Users).
- **Disable suspend/lock entirely:**
  - Settings → Power → Screen Blank: **Never**, Automatic Suspend: **Off**.
  - Edit `/etc/systemd/logind.conf`: `HandleLidSwitch=ignore`, `HandleLidSwitchExternalPower=ignore`. Run `systemctl restart systemd-logind`.
- **Disable Ubuntu Pro / Livepatch popup**, screen animations, wallpaper rotation (idle CPU savings).
- Swap: **4GB swapfile** on SSD (Postgres OOM survival, helps small spikes).
- Battery: cable plugged 24/7. If hardware supports (`tlp-stat`), cap charge at 60-80% to slow battery wear. Otherwise accept wear.

### Security tradeoff

**No full-disk encryption (LUKS).** FDE prompts for passphrase at boot, breaking unattended power-cut recovery. Mitigation: physical security (locked room), and the only sensitive secrets on disk are `JWT_SECRET` + `AUTH_GOOGLE_SECRET` — both rotatable in minutes.

### Storage layout

| Disk | Mount | Approx size | Purpose |
|---|---|---|---|
| 256GB SSD | `/` | ~220GB free after OS + swap | OS, `/var/lib/docker` (volumes), cloudflared logs |
| 1TB HDD | `/mnt/hdd` (ext4) | ~950GB | `/mnt/hdd/backups/` — nightly pg_dump snapshots, 30d retention. HDD allowed to spin down when idle. |

`/etc/fstab`:
```
UUID=<hdd-uuid>  /mnt/hdd  ext4  defaults,noatime,nofail  0  2
```
`nofail` = boot succeeds even if HDD is dead. Backup script checks `mountpoint -q /mnt/hdd` before writing.

## Software stack

### `deploy/home/docker-compose.prod.yml`

Reuses Plan 8 structure with two changes: (1) caddy listens on `localhost:8080` only (no public 80/443), (2) adds `watchtower` with label-based filtering.

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
    image: ghcr.io/sun-0207/smanga-api:latest
    restart: unless-stopped
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    environment:
      NODE_ENV: production
      PORT: 3001
      DATABASE_URL: postgres://smanga:${POSTGRES_PASSWORD}@postgres:5432/smanga
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      FRONTEND_BASE_URL: https://smanga.shop
      AUTH_GOOGLE_ID: ${AUTH_GOOGLE_ID}
      AUTH_GOOGLE_SECRET: ${AUTH_GOOGLE_SECRET}
      AUTH_GOOGLE_CALLBACK_URL: https://smanga.shop/api/v1/auth/google/callback
    labels:
      com.centurylinklabs.watchtower.enable: "true"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3001/api/v1/health || exit 1"]
      interval: 30s
      start_period: 30s

  frontend:
    image: ghcr.io/sun-0207/smanga-frontend:latest
    restart: unless-stopped
    labels:
      com.centurylinklabs.watchtower.enable: "true"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on: [api, frontend]
    ports:
      - "127.0.0.1:8080:80"   # localhost only, cloudflared connects here
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro

  watchtower:
    image: containrrr/watchtower:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      WATCHTOWER_POLL_INTERVAL: 300       # 5 min
      WATCHTOWER_CLEANUP: "true"
      WATCHTOWER_LABEL_ENABLE: "true"     # only watch labeled containers
      WATCHTOWER_INCLUDE_RESTARTING: "true"

volumes:
  postgres-data:
  redis-data:
```

### `deploy/home/Caddyfile`

No SSL (cloudflared terminates), no port 80/443 (cloudflared owns public ingress).

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

### `deploy/home/init-db.sh`

Same as Plan 8 — enables `unaccent` + `pg_trgm` extensions on first postgres boot.

### `deploy/home/.env`

```env
POSTGRES_PASSWORD=<openssl rand -base64 32>
JWT_SECRET=<openssl rand -base64 32>
AUTH_GOOGLE_ID=<from Google Cloud Console>
AUTH_GOOGLE_SECRET=<from Google Cloud Console>
```

## Cloudflared tunnel setup

One-time, ~10 min:

```bash
# Install (Cloudflare apt repo)
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared

# Auth (opens browser to CF login)
cloudflared tunnel login

# Create tunnel — outputs UUID + credentials JSON
cloudflared tunnel create smanga-prod

# CF Dashboard → DNS → delete current A/CNAME `smanga.shop` (pointing at Vercel)

# Now route the tunnel — creates CNAME smanga.shop → <UUID>.cfargotunnel.com (proxy ON)
cloudflared tunnel route dns smanga-prod smanga.shop
```

`/etc/cloudflared/config.yml`:

```yaml
tunnel: <UUID>
credentials-file: /etc/cloudflared/<UUID>.json

ingress:
  - hostname: smanga.shop
    service: http://localhost:8080
    originRequest:
      connectTimeout: 30s
  - service: http_status:404

retries: 5
grace-period: 30s
```

Move credentials JSON and install systemd service:

```bash
sudo cp ~/.cloudflared/<UUID>.json /etc/cloudflared/
sudo chown root:root /etc/cloudflared/*
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Drop-in override to ensure WiFi up first (`/etc/systemd/system/cloudflared.service.d/override.conf`):

```ini
[Unit]
Wants=network-online.target
After=network-online.target NetworkManager-wait-online.service
```

### Google OAuth callback

Google Cloud Console → existing OAuth client → Authorized redirect URIs **must contain all three**:
- `https://smanga.shop/api/v1/auth/google/callback` (laptop prod)
- `https://<vercel-deployment>.vercel.app/api/v1/auth/google/callback` (Vercel staging — keep)
- `http://localhost:3001/api/v1/auth/google/callback` (dev)

### TOS check

SManga serves text + ~50KB cover JPEGs. Cloudflare Tunnel free-tier TOS (Section 2.8 of CF SSAA) permits this — only restricts streaming media / large-file mirroring. No violation risk at current scope.

## Backup — dual-tier

### Tier 1 — HDD local (fast SSD-failure recovery)

`pg_dump --format=custom --compress=6` → `/mnt/hdd/backups/smanga-YYYY-MM-DD.dump`. 30-day retention. Restore: single `pg_restore` command, no internet.

### Tier 2 — Cloudflare R2 offsite (fire/theft survival)

Same dump → gzipped → uploaded via `rclone copy` to `r2:smanga-backups/`. 14-day retention. ~10MB per snapshot × 14 = 140MB total, well within 10GB free.

### `/home/smanga/scripts/backup.sh`

```bash
#!/bin/bash
set -euo pipefail

STAMP=$(date +%Y-%m-%d)
HDD_DIR=/mnt/hdd/backups
R2_REMOTE=r2:smanga-backups
DUMP="${HDD_DIR}/smanga-${STAMP}.dump"

mountpoint -q /mnt/hdd || { echo "HDD not mounted, abort"; exit 1; }
mkdir -p "$HDD_DIR"

docker compose -f /home/smanga/smanga/docker-compose.prod.yml exec -T postgres \
  pg_dump -U smanga -d smanga --format=custom --compress=6 --no-owner --no-acl \
  > "$DUMP"

find "$HDD_DIR" -name 'smanga-*.dump' -mtime +30 -delete

gzip -c "$DUMP" | rclone rcat "${R2_REMOTE}/smanga-${STAMP}.dump.gz" --quiet

rclone delete "$R2_REMOTE" --min-age 14d --quiet

echo "[$(date)] backup OK"
```

### Systemd timer

`/etc/systemd/system/smanga-backup.service`:

```ini
[Unit]
Description=SManga nightly backup
After=docker.service network-online.target

[Service]
Type=oneshot
User=smanga
ExecStart=/home/smanga/scripts/backup.sh
StandardOutput=journal
StandardError=journal
```

`/etc/systemd/system/smanga-backup.timer`:

```ini
[Unit]
Description=Run smanga-backup nightly 02:30

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

`sudo systemctl enable --now smanga-backup.timer`.

### Restore drill

**Monthly manual test** (calendar reminder): pick latest dump → restore into throwaway docker container → smoke. Untested backups are not backups.

## Deploy flow

### CI build (reuse Plan 8's `.github/workflows/build-images.yml` verbatim)

Push to `main` → GitHub Actions builds two images → pushes to GHCR public registry as `ghcr.io/sun-0207/smanga-{api,frontend}:latest` plus `:<sha>`.

### Watchtower auto-deploy on laptop

Watchtower polls GHCR every 5 min for new digests of labeled containers (api + frontend). On change: pull → stop old → start new. Rolling restart, ~10-20s blip per service.

### Migration auto-run

The api image entrypoint runs `pnpm db:migrate` before starting NestJS. Drizzle migrations are idempotent (skipped via `__drizzle_migrations` journal table), so every container start is safe. New migrations apply automatically when Watchtower pulls a new image.

### Risks

| Risk | Mitigation |
|---|---|
| Destructive migration auto-deploys without manual review | Code review must flag destructive migrations. Emergency: `docker compose stop watchtower` before push, deploy manually. |
| Watchtower pulls a broken image | Re-tag GHCR `:latest` to a known-good SHA via web UI → Watchtower picks it up within 5 min. |
| GHCR rate limit | Public images = unlimited anon pulls. Keep packages public. |
| Restart blip ~20s | Acceptable for hobby. Cloudflare shows brief 502; no banner needed. |

## Cutover plan

### Phase 0 — Prep (no production impact)

1. Ubuntu install + BIOS + autologin (Hardware section).
2. Install Docker + cloudflared (do NOT run `route dns` yet).
3. Copy `deploy/home/` skeleton + create `.env` with secrets.
4. `docker compose up -d` → verify `curl localhost:8080/api/v1/health` returns 200.
5. Bootstrap admin user: register via API, then `UPDATE "user" SET role='admin' WHERE email='cuthanhson27@gmail.com'`.

### Phase 1 — Public test on temporary subdomain (1-2 days)

6. Set `config.yml` ingress to `hostname: test.smanga.shop`. `sudo systemctl restart cloudflared`.
7. `cloudflared tunnel route dns smanga-prod test.smanga.shop` — uses a throwaway subdomain.
8. Browser smoke: `https://test.smanga.shop` → login → admin → discover → import 1 story → crawl → read chapter.
9. Watch first nightly backup; push a dummy commit and confirm Watchtower picks it up within 5 min.
10. **24h soak test:** confirm laptop never sleeps, no 5xx, cloudflared journal clean.

### Phase 2 — Flip apex (when Phase 1 is stable)

11. CF Dashboard → DNS → **delete** the `smanga.shop` CNAME pointing at Vercel.
12. Edit `config.yml`: replace `hostname: test.smanga.shop` with `hostname: smanga.shop`. `sudo systemctl restart cloudflared`.
13. `cloudflared tunnel route dns smanga-prod smanga.shop` — creates new CNAME pointing at the tunnel.
14. Wait ~2 min for DNS propagation.
15. Browser → `https://smanga.shop` → full smoke flow.
16. Optional cleanup: `cloudflared tunnel route dns --overwrite-dns ...` is not needed since the `test.smanga.shop` CNAME can stay (or be deleted via CF dashboard).

### Phase 3 — Cleanup (after 1 week of stable operation)

14. Vercel staging stays at `<deployment>.vercel.app` — untouched (matches user constraint).
15. Disable Auto-refresh in `/admin/settings` on the Vercel-Railway-Neon staging stack so its Bull worker doesn't double-crawl into Neon.
16. Optional: downgrade Neon to free tier to save cost.

## Rollback (≤2 min)

If the laptop production breaks:

1. CF Dashboard → DNS → delete the CNAME `smanga.shop` → tunnel UUID.
2. Recreate CNAME `smanga.shop` → previous Vercel deployment URL (proxy ON).
3. TTL is 120s; users back on the old Vercel-Railway-Neon stack.

Note: because Phase 1 starts with a fresh laptop DB, **rollback to Vercel means users lose any reading progress made during the laptop period**. Accepted as a hobby tradeoff. If catalog needs to be preserved post-rollback, restore the latest R2 backup into Neon — but in practice, expect to fix-forward instead.

## Monitoring (lean)

| Layer | Tool | Cost |
|---|---|---|
| Tunnel connection status | Cloudflare Zero Trust dashboard + Email Alerts on tunnel down | $0 |
| Site uptime | UptimeRobot free (5-min ping on `/api/v1/health`) | $0 |
| Service logs | `journalctl -u cloudflared`, `docker compose logs api` — read on-demand | $0 |
| Disk usage | Weekly manual `df -h`, or simple cron alert when SSD > 80% | $0 |
| Backup success | `journalctl -u smanga-backup.service --since '1 day ago'` | $0 |

No Prometheus / Grafana — overkill at this scale. Add only if the project grows past hobby.

## Failure modes

| Failure | Detection | Recovery time | Mitigation |
|---|---|---|---|
| Power cut < ~3h (within battery) | UptimeRobot still green | 0 — battery sustains | Battery = informal UPS |
| Power cut > battery | UptimeRobot alert; site 522 | Power returns → BIOS auto-on → ~2 min boot → stack up | BIOS "AC restore" ON |
| WiFi drop < 30s | User sees brief 502 | Auto | cloudflared retry built-in |
| WiFi / ISP down > 5 min | UptimeRobot alert | Until ISP recovers | Long-term: move to ethernet |
| SSD dies | API crash loop, postgres data lost | ~30 min: restore latest R2 backup into new install | R2 backup + monthly drill |
| HDD dies | Tier-1 backup silently absent | Tier-2 (R2) still 14d available | `nofail` fstab, backup script checks mountpoint |
| Postgres OOM | API timeouts, container restart | Auto-restart, ~30s | 4GB swap + tune `shared_buffers=512MB` |
| Watchtower pulls broken image | API crash loop after pull | Manual re-tag GHCR `:latest` → known-good SHA, ~5 min | Code review for risky changes |
| Cloudflare R2 quota crossed (>10GB) | Upload fails | Increase retention rotation aggressively | Current usage ~150MB, headroom huge |

## Cost recap

| Item | Monthly |
|---|---|
| Electricity (~40W × 24h × 30d × ₫3,000/kWh) | ~₫90,000 ≈ **$3.6** |
| Home internet (already paid) | $0 marginal |
| Cloudflare Tunnel (free tier) | $0 |
| Cloudflare R2 (~150MB of 10GB free) | $0 |
| GHCR (public packages) | $0 |
| GitHub Actions (public repo) | $0 |
| Domain `smanga.shop` (already owned) | $0 marginal |
| Vercel staging (free tier) | $0 |
| Railway + Neon staging (free tier or $5 credit) | $0-5 |
| **TOTAL marginal** | **~$3.6/mo** |

Compare:
- Plan 8 (Hetzner CX23 cloud): $5/mo flat
- Current managed prod: $0 to $25-40/mo depending on Neon row count and Railway compute

## File structure (to be created by Plan 9 implementation plan)

```
deploy/
  laptop/
    docker-compose.prod.yml         postgres + redis + api + frontend + caddy + watchtower
    Caddyfile                       reverse proxy localhost only, no SSL
    .env.example                    secret template
    init-db.sh                      postgres extension enable
    cloudflared/
      config.yml.example            tunnel ingress template
    backup.sh                       pg_dump → HDD + R2
    systemd/
      smanga-backup.service
      smanga-backup.timer
      cloudflared-override.conf     wait for network-online
docs/
  home-runbook.md                 SSH local, restart, restore, BIOS recovery, Cloudflare DNS surgery
```

## Out of scope (explicitly deferred)

- Tailscale or mesh VPN for remote management (start with local-LAN SSH only; add if needed).
- Read replica / second laptop for HA — single-node is fine for hobby.
- HTTPS between cloudflared and caddy — not needed since both on localhost.
- Prometheus / Grafana — not needed at this scale.
- Battery charge limiter scripts beyond `tlp` defaults — add if/when the chosen laptop's hardware supports it cleanly.
- UPS for router — listed as a future improvement when reliability becomes a real concern.

## Open issues for implementation

None blocking — all decisions resolved during brainstorm:

- Approach: **C** (compose + native cloudflared).
- OS: Ubuntu Desktop 24.04 + autologin.
- DNS: `smanga.shop` → tunnel; Vercel keeps `<deployment>.vercel.app` untouched.
- Data: fresh DB on laptop (no Neon migration).
- Deploy: Watchtower polling GHCR.
- Backup: HDD nightly (30d) + R2 nightly (14d).
- Network: WiFi (with ethernet as future improvement).
