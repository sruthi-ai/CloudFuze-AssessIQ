#!/usr/bin/env bash
#
# Restore the AssessIQ database from a backup produced by backup.sh.
# DESTRUCTIVE: overwrites current data. Run on the production host.
#
#   bash deploy/restore-db.sh backups/db/assessiq-YYYYMMDD-HHMMSS.sql.gz
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$ROOT/docker-compose.prod.yml"
DC="docker compose -f $COMPOSE"

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: bash deploy/restore-db.sh <path-to-backup.sql.gz>" >&2
  echo "Available:" >&2; ls -1 "$ROOT/backups/db/" 2>/dev/null >&2 || true
  exit 1
fi

echo "⚠️  This will OVERWRITE the current database with:"
echo "    $FILE"
read -r -p "Type 'RESTORE' to continue: " confirm
[ "$confirm" = "RESTORE" ] || { echo "Aborted."; exit 1; }

echo "→ Restoring…"
gunzip -c "$FILE" | $DC exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
echo "✅ Restore complete. Restart the backend if needed:  $DC restart backend"

# NOTE: uploaded media is restored separately, e.g.:
#   $DC exec -T backend sh -c 'rm -rf /app/uploads/* && tar xzf - -C /app/uploads' < backups/uploads/uploads-YYYYMMDD-HHMMSS.tar.gz
