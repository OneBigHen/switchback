#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAR="$ROOT/data/graphhopper-web-11.0.jar"
CONFIG="$ROOT/infra/graphhopper/config.yml"

"$ROOT/scripts/bootstrap-data.sh"

case "${1:-start}" in
  import)
    rm -rf "$ROOT/data/graph-cache"
    cd "$ROOT"
    exec java -Xms1g -Xmx5g -XX:+UseParallelGC -jar "$JAR" import "$CONFIG"
    ;;
  start)
    if [[ ! -f "$ROOT/data/graph-cache/properties" && ! -f "$ROOT/data/graph-cache/properties.txt" ]]; then
      echo "Graph cache is missing. Run: npm run routing:import"
      exit 1
    fi
    cd "$ROOT"
    exec java -Xms768m -Xmx2g -jar "$JAR" server "$CONFIG"
    ;;
  *)
    echo "Usage: scripts/graphhopper.sh [import|start]"
    exit 2
    ;;
esac
