#!/bin/bash
# Nightly pg_dump → HDD (30d). Offsite Google Drive tier DISABLED 2026-06-28 (see Tier 2 below).
# Install: copy to /home/smanga/scripts/backup.sh, chmod +x.
# (Offsite tier is off; the rclone 'gdrive' remote is only needed if you re-enable it below —
#  setup in docs/home-runbook.md.)
set -euo pipefail

STAMP=$(date +%Y-%m-%d)
HDD_DIR=/mnt/hdd/backups
# OFFSITE_REMOTE=gdrive:smanga-backups   # only used by the disabled offsite tier below
DUMP="${HDD_DIR}/smanga-${STAMP}.dump"
COMPOSE_FILE=/home/smanga/smanga/deploy/home/docker-compose.prod.yml

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

# Tier 2: offsite Google Drive — DISABLED 2026-06-28 (opted out of Drive backup).
# To re-enable: uncomment OFFSITE_REMOTE above + the two rclone lines below, and ensure
# the rclone 'gdrive' remote is configured (see docs/home-runbook.md).
# gzip -c "$DUMP" | rclone rcat "${OFFSITE_REMOTE}/smanga-${STAMP}.dump.gz" --quiet
# rclone delete "$OFFSITE_REMOTE" --min-age 14d --include 'smanga-*.dump.gz' --quiet

echo "[$(date)] backup OK — HDD: $(stat -c %s "$DUMP")B (offsite Drive tier disabled)"
