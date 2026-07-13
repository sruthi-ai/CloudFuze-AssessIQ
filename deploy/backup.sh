#!/usr/bin/env bash
#
# Daily backup of the AssessIQ database + uploaded media (candidate audio/writing
# responses, Listening clips, proctoring snapshots). Run on the production host.
#
#   bash deploy/backup.sh
#
# Configure via env (all optional):
#   BACKUP_DIR             where to write backups   (default: <repo>/backups)
#   RETENTION_DAYS         delete backups older than N days (default: 14)
#   BACKUP_RCLONE_REMOTE   if set, `rclone copy` backups off-host (e.g. "s3:my-bucket/assessiq")
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$ROOT/docker-compose.prod.yml"
DC="docker compose -f $COMPOSE"

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TS="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/uploads"
DB_FILE="$BACKUP_DIR/db/assessiq-$TS.sql.gz"
UP_FILE="$BACKUP_DIR/uploads/uploads-$TS.tar.gz"

echo "→ [$(date)] Backing up database…"
# Use the db container's own env; local socket auth. Fails the pipe if pg_dump errors.
$DC exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' \
  | gzip > "$DB_FILE"
# Sanity: a real dump is well over 1KB; a failed one leaves an empty/tiny gzip.
if [ "$(stat -c%s "$DB_FILE" 2>/dev/null || stat -f%z "$DB_FILE")" -lt 1000 ]; then
  echo "✖ Database dump looks empty — aborting." >&2; rm -f "$DB_FILE"; exit 1
fi
echo "  ✔ $DB_FILE"

echo "→ [$(date)] Backing up uploaded media…"
$DC exec -T backend tar czf - -C /app/uploads . > "$UP_FILE"
echo "  ✔ $UP_FILE"

echo "→ Pruning backups older than ${RETENTION_DAYS} days…"
find "$BACKUP_DIR" -type f -name '*.gz' -mtime +"$RETENTION_DAYS" -delete || true

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  echo "→ Copying off-host to $BACKUP_RCLONE_REMOTE…"
  rclone copy "$BACKUP_DIR" "$BACKUP_RCLONE_REMOTE" && echo "  ✔ off-host copy done"
fi

echo "✅ [$(date)] Backup complete."
du -sh "$BACKUP_DIR" 2>/dev/null | awk '{print "   total backups on disk: " $1}'
