#!/usr/bin/env bash
# Restore the Webmana database from a gzipped SQL dump made by backup.sh.
#
# Usage: scripts/restore.sh <backup-file.sql.gz>
# WARNING: this overwrites the current database contents.
set -euo pipefail

FILE="${1:?usage: restore.sh <backup-file.sql.gz>}"
USER="${POSTGRES_USER:-webmana}"
DB="${POSTGRES_DB:-webmana}"
[ -f "$FILE" ] || { echo "no such file: $FILE" >&2; exit 1; }

read -r -p "This overwrites database '$DB'. Continue? [y/N] " ans
[ "$ans" = "y" ] || { echo "aborted"; exit 1; }

echo "[restore] restoring '$DB' from $FILE..."
gunzip -c "$FILE" | docker compose exec -T postgres psql -U "$USER" -d "$DB"
echo "[restore] done. Restart the stack: docker compose up -d"
