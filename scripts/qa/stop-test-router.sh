#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PID_FILE="${SWITCHBACK_TEST_ROUTER_PID_FILE:-$ROOT/data/quality/switchback-test-router.pid}"

if [[ ! -f "$PID_FILE" ]]; then
  exit 0
fi

router_pid="$(<"$PID_FILE")"
if [[ "$router_pid" =~ ^[0-9]+$ ]] && kill -0 "$router_pid" 2>/dev/null; then
  kill "$router_pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 "$router_pid" 2>/dev/null || break
    sleep 1
  done
fi
rm -f "$PID_FILE"
