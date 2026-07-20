#!/usr/bin/env bash
# Build offline region graph bundles from Geofabrik OSM extracts.
#
# Usage: ./scripts/build-region-tiles.sh [region-id]
#   Without args: builds all available regions.
#   With region-id: builds a single region (e.g. "pennsylvania").
#
# Prerequisites (run once):
#   ./scripts/bootstrap-data.sh
#
# This script reads region metadata from src/lib/offline/region-catalog.ts
# (via the companion Node.js builder), fetches the Geofabrik extract for each
# region, runs the GraphHopper tile builder, and outputs region graph bundles
# to data/offline-tiles/{region-id}.graph.
#
# The output bundles are static files that the app serves at
# /api/offline/regions/{region-id}.graph and the client downloads via
# the RegionGraphStore + fetch. They contain the full OfflineGraph serialized
# in the format expected by the corridor-extractor and A* worker.
#
# Tile format version: 1.0.0
# OSM data source: Geofabrik daily extracts (ODbL, attribution required)
# Attribution: © OpenStreetMap contributors, ODbL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/data/offline-tiles"
BUILDER_SCRIPT="$SCRIPT_DIR/build-graph-bundle.mjs"

mkdir -p "$OUTPUT_DIR"

REGION_ID="${1:-}"

echo "=== Building offline region graph bundles ==="
echo "Output directory: $OUTPUT_DIR"
echo ""

if [ -n "$REGION_ID" ]; then
  node "$BUILDER_SCRIPT" "$REGION_ID" "$OUTPUT_DIR"
else
  node "$BUILDER_SCRIPT" --all "$OUTPUT_DIR"
fi

echo ""
echo "=== Build complete ==="
echo "Bundles are in: $OUTPUT_DIR"
echo "Serve via: /api/offline/regions/{region-id}.graph"
