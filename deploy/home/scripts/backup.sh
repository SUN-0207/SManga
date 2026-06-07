#!/bin/bash
# Dual-tier backup: nightly pg_dump → HDD (30d) → Google Drive (14d).
# Install: copy to /home/smanga/scripts/backup.sh, chmod +x.
# rclone remote 'gdrive' must be configured (see docs/home-runbook.md).
set -euo pipefail

STAMP=$(date +%Y-%m-%d)
HDD_DIR=/mnt/hdd/backups
OFFSITE_REMOTE=gdrive:smanga-backups
DUMP="${HDD_DIR}/smanga-${STAMP}.dump"
COMPOSE_FILE=/home/smanga/smanga/docker-compose.prod.yml

# Refuse to write if HDD isn't mounted — better to alert than to write
# nightly backups into /mnt/hdd as a plain root-fs directory that fills up.
mountpoint -q /mnt/hdd || { echo "FATAL: /mnt/hdd not mounted, aborting"; exit 1; }
mkdir -p "$HDD_DIR"

# Clean up partial dump on any failure after this point
trap 'rm -f "$DUMP"' ERR

# Tier 1: HDD pg_dump (custom format, parallel-restorable)
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U smanga -d smanga --format=custom --no-owner --no-acl \
  > "$DUMP"

# Tier 1 retention
find "$HDD_DIR" -name 'smanga-*.dump' -mtime +30 -delete

# Tier 2: stream-gzip to GDrive (no temp file on root fs)
gzip -c "$DUMP" | rclone rcat "${OFFSITE_REMOTE}/smanga-${STAMP}.dump.gz" --quiet

# Tier 2 retention
rclone delete "$OFFSITE_REMOTE" --min-age 14d --include 'smanga-*.dump.gz' --quiet

echo "[$(date)] backup OK — HDD: $(stat -c %s "$DUMP")B, GDrive uploaded"
