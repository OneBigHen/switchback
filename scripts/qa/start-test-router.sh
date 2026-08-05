#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
JAR="${SWITCHBACK_GRAPHHOPPER_JAR:-$ROOT/data/graphhopper-web-11.0.jar}"
CONFIG="${SWITCHBACK_TEST_ROUTER_CONFIG:-$ROOT/tests/fixtures/osm/graphhopper-test.yml}"
PID_FILE="${SWITCHBACK_TEST_ROUTER_PID_FILE:-$ROOT/data/quality/switchback-test-router.pid}"
LOG_FILE="${SWITCHBACK_TEST_ROUTER_LOG:-$ROOT/data/quality/switchback-test-router.log}"
BASE_URL="${SWITCHBACK_TEST_ROUTER_URL:-http://127.0.0.1:8998}"

if [[ ! -f "$JAR" ]]; then
  echo "GraphHopper jar not found: $JAR" >&2
  exit 1
fi
if [[ ! -f "$CONFIG" ]]; then
  echo "GraphHopper test config not found: $CONFIG" >&2
  exit 1
fi
if [[ ! -f "$ROOT/data/quality/switchback-test-motorcycle.osm.pbf" ]]; then
  echo "Prepared fixture PBF not found. Run the fixture preparation step first." >&2
  exit 1
fi
if [[ -f "$PID_FILE" ]]; then
  existing_pid="$(<"$PID_FILE")"
  if [[ "$existing_pid" =~ ^[0-9]+$ ]] && kill -0 "$existing_pid" 2>/dev/null; then
    echo "Test GraphHopper is already running with pid $existing_pid" >&2
    exit 1
  fi
fi

mkdir -p "$(dirname "$PID_FILE")" "$(dirname "$LOG_FILE")"
cd "$ROOT"
nohup java -Xms256m -Xmx1g -XX:+UseSerialGC -jar "$JAR" server "$CONFIG" >"$LOG_FILE" 2>&1 &
router_pid=$!
printf '%s\n' "$router_pid" >"$PID_FILE"

if ! "$ROOT/scripts/qa/wait-for-service.sh" "$BASE_URL/health" "${SWITCHBACK_TEST_ROUTER_TIMEOUT_SECONDS:-60}"; then
  echo "GraphHopper test router failed to become healthy; log: $LOG_FILE" >&2
  exit 1
fi
echo "GraphHopper test router ready at $BASE_URL (pid $router_pid)"
