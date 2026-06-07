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

> ⚠️ **Destructive.** `pg_restore --clean --if-exists` drops every object in the target database before recreating it. Double-check `-d smanga` matches the container you intend to restore *into*, and that you have a current backup on HDD before running this against prod.

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

## Recovery when the laptop is unavailable

The managed-cloud rollback (Vercel + Railway + Neon) from earlier plans is no
longer an option — that stack was retired 2026-06-07. If the laptop is dead
or unreachable, the path to restore service is:

1. Provision a replacement host (another laptop, mini PC, or rented VPS).
2. Follow the Plan 9 install order (Phase B → E) from `docs/superpowers/plans/2026-06-05-plan-9-laptop-self-host.md`.
3. Restore the latest Google Drive dump into the new host's postgres:
   ```bash
   rclone copy gdrive:smanga-backups/<latest>.dump.gz /tmp/
   gunzip /tmp/<latest>.dump.gz
   docker compose -f deploy/home/docker-compose.prod.yml exec -T postgres \
     pg_restore -U smanga -d smanga --clean --if-exists < /tmp/<latest>.dump
   ```
4. Point `smanga.shop` at the new host's cloudflared tunnel (`cloudflared tunnel route dns --overwrite-dns smanga-prod smanga.shop`).
5. End-to-end smoke; remove the broken host.

If the laptop is just temporarily down (router reboot, planned outage), users see Cloudflare 522 until the tunnel reconnects — usually within seconds of the laptop coming back online. No manual intervention needed.

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
