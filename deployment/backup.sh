#!/usr/bin/env bash
set -euo pipefail

ROOT="${SWITCHBACK_DATA_ROOT:-/var/lib/switchback}"
DEST="${1:-/var/backups/switchback}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DEST/$STAMP"

mkdir -p "$OUT"
sqlite3 "$ROOT/app/community.sqlite" ".backup '$OUT/community.sqlite'"
sqlite3 "$ROOT/app/sync.sqlite" ".backup '$OUT/sync.sqlite'"
tar -C "$ROOT" -czf "$OUT/artifacts.tgz" artifacts 2>/dev/null || true
sha256sum "$OUT"/* > "$OUT/SHA256SUMS"
echo "Backup complete: $OUT"
