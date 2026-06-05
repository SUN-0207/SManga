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
