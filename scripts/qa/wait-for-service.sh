#!/usr/bin/env bash
set -euo pipefail

url="${1:?Usage: wait-for-service.sh <url> [timeout-seconds]}"
timeout_seconds="${2:-60}"
for _ in $(seq 1 "$timeout_seconds"); do
  if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for $url" >&2
exit 1
