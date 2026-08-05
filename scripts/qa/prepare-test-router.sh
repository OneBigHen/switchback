#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE_XML="${SWITCHBACK_TEST_ROUTER_OSM_XML:-$ROOT/tests/fixtures/osm/switchback-test.osm}"
RAW_PBF="${SWITCHBACK_TEST_ROUTER_RAW_PBF:-$ROOT/data/quality/switchback-test.osm.pbf}"
MOTORCYCLE_PBF="${SWITCHBACK_TEST_ROUTER_PBF:-$ROOT/data/quality/switchback-test-motorcycle.osm.pbf}"
GRAPH_LOCATION="${SWITCHBACK_TEST_ROUTER_GRAPH:-$ROOT/data/quality/switchback-test-graph-v2}"
CONFIG="${SWITCHBACK_TEST_ROUTER_CONFIG:-$ROOT/tests/fixtures/osm/graphhopper-test.yml}"
JAR="${SWITCHBACK_GRAPHHOPPER_JAR:-$ROOT/data/graphhopper-web-11.0.jar}"

command -v osmium >/dev/null || { echo "osmium is required to prepare the GraphHopper fixture" >&2; exit 1; }
command -v node >/dev/null || { echo "node is required to normalize the GraphHopper fixture" >&2; exit 1; }
command -v java >/dev/null || { echo "java is required to import the GraphHopper fixture" >&2; exit 1; }
[[ -f "$FIXTURE_XML" ]] || { echo "OSM fixture not found: $FIXTURE_XML" >&2; exit 1; }
[[ -f "$CONFIG" ]] || { echo "GraphHopper fixture config not found: $CONFIG" >&2; exit 1; }
[[ -f "$JAR" ]] || { echo "GraphHopper jar not found: $JAR" >&2; exit 1; }

mkdir -p "$(dirname "$RAW_PBF")" "$GRAPH_LOCATION"
if [[ ! -f "$RAW_PBF" ]]; then
  osmium check-refs "$FIXTURE_XML"
  osmium cat -f pbf --overwrite -o "$RAW_PBF" "$FIXTURE_XML"
fi
if [[ ! -f "$MOTORCYCLE_PBF" ]]; then
  node "$ROOT/scripts/prepare-motorcycle-osm.mjs" "$RAW_PBF" "$MOTORCYCLE_PBF"
fi

# The graph is deliberately ignored and reusable locally. CI starts from a
# clean checkout, so this imports the exact fixture once per workflow run.
if [[ ! -f "$GRAPH_LOCATION/properties" && ! -f "$GRAPH_LOCATION/properties.txt" ]]; then
  cd "$ROOT"
  java -Xms256m -Xmx1g -XX:+UseSerialGC -jar "$JAR" import "$CONFIG"
fi

echo "GraphHopper fixture ready: $MOTORCYCLE_PBF"
echo "GraphHopper graph ready: $GRAPH_LOCATION"
