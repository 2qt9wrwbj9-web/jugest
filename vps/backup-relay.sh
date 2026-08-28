#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR=${JUGEST_RELAY_DATA_DIR:-/var/lib/jugest-relay}
BACKUP_DIR=${JUGEST_RELAY_BACKUP_DIR:-/var/backups/jugest-relay}
KEEP_DAYS=${JUGEST_RELAY_BACKUP_KEEP_DAYS:-14}

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Relay data directory not found: $SOURCE_DIR" >&2
  exit 1
fi

umask 077
mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TMP="$BACKUP_DIR/.jugest-relay-${STAMP}.tar.gz.tmp"
OUT="$BACKUP_DIR/jugest-relay-${STAMP}.tar.gz"
tar -C "$(dirname "$SOURCE_DIR")" -czf "$TMP" "$(basename "$SOURCE_DIR")"
mv "$TMP" "$OUT"
find "$BACKUP_DIR" -type f -name 'jugest-relay-*.tar.gz' -mtime "+$KEEP_DAYS" -delete
printf '%s\n' "$OUT"
