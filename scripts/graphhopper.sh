#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAR="$ROOT/data/graphhopper-web-11.0.jar"
CONFIG="$ROOT/infra/graphhopper/config.yml"

"$ROOT/scripts/bootstrap-data.sh"

ACTIVE_CACHE="$ROOT/data/graph-cache"

# Phase 3: build and validate a NEW graph beside the active cache without
# touching it. The production swap is owned by Phase 7; `swap` exists so the
# release gate has a single atomic, rollback-safe command.

candidate_cache() {
  echo "$ROOT/data/graph-cache-$1"
}

# Generate a throwaway config pointing at the candidate cache and, for
# validation, a non-production port pair so the active router is untouched.
candidate_config() {
  local name="$1"
  local port="${2:-8989}"
  local admin_port="${3:-8990}"
  local target
  target="$(candidate_cache "$name")"
  local tmp="$ROOT/data/graph-cache-$name.yml"
  sed \
    -e "s|graph.location: data/graph-cache|graph.location: data/graph-cache-$name|" \
    -e "s|^      port: 8989$|      port: $port|" \
    -e "s|^      port: 8990$|      port: $admin_port|" \
    "$CONFIG" > "$tmp"
  echo "$tmp"
}

case "${1:-start}" in
  import)
    rm -rf "$ACTIVE_CACHE"
    cd "$ROOT"
    exec java -Xms1g -Xmx5g -XX:+UseParallelGC -jar "$JAR" import "$CONFIG"
    ;;
  import-candidate)
    # Side-by-side import: build data/graph-cache-<name> beside the active
    # cache. The active cache is never modified. Needs ~5 GB heap and room
    # for a second cache on disk.
    name="${2:?Usage: graphhopper.sh import-candidate <name>}"
    target="$(candidate_cache "$name")"
    if [[ -d "$target" ]]; then
      echo "Candidate cache already exists: $target" >&2
      exit 1
    fi
    mkdir -p "$target"
    cfg="$(candidate_config "$name")"
    cd "$ROOT"
    exec java -Xms1g -Xmx5g -XX:+UseParallelGC -jar "$JAR" import "$cfg"
    ;;
  validate-candidate)
    # Start the candidate cache on port 8988 (admin 8991), probe health and
    # all four profiles, then stop. The active router is not touched.
    name="${2:?Usage: graphhopper.sh validate-candidate <name>}"
    target="$(candidate_cache "$name")"
    if [[ ! -d "$target" ]]; then
      echo "Candidate cache missing: $target" >&2
      exit 1
    fi
    cfg="$(candidate_config "$name" 8988 8991)"
    cd "$ROOT"
    java -Xms1g -Xmx4g -jar "$JAR" server "$cfg" &
    server_pid=$!
    trap 'kill "$server_pid" 2>/dev/null || true' EXIT
    for _ in $(seq 1 60); do
      if curl --fail --silent http://127.0.0.1:8988/health > /dev/null 2>&1; then
        echo "Candidate healthy on :8988"
        for profile in motorcycle_fastest motorcycle_twisty motorcycle_scenic motorcycle_adventure; do
          echo "-- profile $profile --"
          curl --fail --silent \
            --request POST http://127.0.0.1:8988/route \
            --header 'content-type: application/json' \
            --data "{\"profile\":\"$profile\",\"points\":[[-76.8867,40.2732],[-76.3055,40.0379]],\"points_encoded\":false,\"details\":[\"toll\",\"road_environment\",\"urban_density\"]}" \
            | head -c 400
          echo
        done
        exit 0
      fi
      sleep 1
    done
    echo "Candidate failed to become healthy on :8988" >&2
    exit 1
    ;;
  swap)
    # Phase 7 only: atomically swap the candidate in and keep the previous
    # cache as the rollback. Stop the router first.
    name="${2:?Usage: graphhopper.sh swap <name>}"
    candidate="$(candidate_cache "$name")"
    rollback="$ROOT/data/graph-cache-rollback-$name"
    if [[ ! -d "$candidate" ]]; then
      echo "Candidate cache missing: $candidate" >&2
      exit 1
    fi
    if [[ -d "$rollback" ]]; then
      echo "Rollback cache already exists: $rollback — resolve it first." >&2
      exit 1
    fi
    if [[ -d "$ACTIVE_CACHE" ]]; then
      mv "$ACTIVE_CACHE" "$rollback"
    fi
    mv "$candidate" "$ACTIVE_CACHE"
    echo "Swapped. Previous cache preserved for rollback:"
    echo "  rollback: mv $rollback $ACTIVE_CACHE"
    ;;
  start)
    if [[ ! -f "$ACTIVE_CACHE/properties" && ! -f "$ACTIVE_CACHE/properties.txt" ]]; then
      echo "Graph cache is missing. Run: npm run routing:import"
      exit 1
    fi
    cd "$ROOT"
    # The PA+NJ graph loads four landmark caches. Keep the serving heap below
    # the import heap while leaving enough room for the planner and the host.
    exec java -Xms1g -Xmx4g -jar "$JAR" server "$CONFIG"
    ;;
  start-legacy)
    # Graceful boot against a cache that predates an encoded-value change
    # (e.g. the Phase 3 `toll` value): the custom models are served without
    # the unsupported rule so routing works with that evidence unknown. The
    # real fix is the Phase 7 candidate-graph swap on a >=6 GB RAM host.
    if [[ ! -f "$ACTIVE_CACHE/properties" && ! -f "$ACTIVE_CACHE/properties.txt" ]]; then
      echo "Graph cache is missing. Run: npm run routing:import"
      exit 1
    fi
    legacy_models="$ROOT/data/graphhopper-legacy-models"
    rm -rf "$legacy_models"
    mkdir -p "$legacy_models"
    for model in "$ROOT"/infra/graphhopper/custom-models/*.json; do
      node -e '
        const fs = require("fs");
        const [source, target] = process.argv.slice(1);
        const model = JSON.parse(fs.readFileSync(source, "utf8"));
        if (Array.isArray(model.priority)) {
          model.priority = model.priority.filter((rule) => !String(rule.if || "").includes("toll == ALL"));
        }
        fs.writeFileSync(target, JSON.stringify(model, null, 2) + "\n");
      ' "$model" "$legacy_models/$(basename "$model")"
    done
    legacy_config="$ROOT/data/graphhopper-legacy.yml"
    sed "s|custom_models.directory: infra/graphhopper/custom-models|custom_models.directory: data/graphhopper-legacy-models|" \
      "$CONFIG" > "$legacy_config"
    cd "$ROOT"
    exec java -Xms1g -Xmx4g -jar "$JAR" server "$legacy_config"
    ;;
  *)
    echo "Usage: scripts/graphhopper.sh [import|import-candidate <name>|validate-candidate <name>|swap <name>|start]"
    exit 2
    ;;
esac
