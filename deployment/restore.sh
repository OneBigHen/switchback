#!/usr/bin/env bash
set -euo pipefail

BACKUP="${1:?backup directory required}"
ROOT="${SWITCHBACK_DATA_ROOT:-/var/lib/switchback}"

sha256sum -c "$BACKUP/SHA256SUMS"
mkdir -p "$ROOT/app" "$ROOT/artifacts"
cp "$BACKUP/community.sqlite" "$ROOT/app/community.sqlite"
cp "$BACKUP/sync.sqlite" "$ROOT/app/sync.sqlite"
if [ -f "$BACKUP/artifacts.tgz" ]; then tar -C "$ROOT" -xzf "$BACKUP/artifacts.tgz"; fi
echo "Restore staged. Run health checks before exposing traffic."
