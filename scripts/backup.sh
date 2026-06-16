#!/usr/bin/env bash
# Back up the Webmana database to a gzipped SQL dump.
#
# Usage: scripts/backup.sh [output-dir]   (defaults to ./backups)
# Produces: <output-dir>/webmana-YYYYmmdd-HHMMSS.sql.gz
#
# Note: this dumps the database only. Connector secrets are encrypted at rest
# with WEBMANA_SECRET_KEY — keep that key backed up separately and safely, or
# the restored secrets cannot be decrypted.
set -euo pipefail

OUT_DIR="${1:-./backups}"
USER="${POSTGRES_USER:-webmana}"
DB="${POSTGRES_DB:-webmana}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/webmana-$STAMP.sql.gz"

echo "[backup] dumping database '$DB' as '$USER'..."
docker compose exec -T postgres pg_dump -U "$USER" -d "$DB" --clean --if-exists | gzip > "$FILE"
echo "[backup] wrote $FILE ($(du -h "$FILE" | cut -f1))"
