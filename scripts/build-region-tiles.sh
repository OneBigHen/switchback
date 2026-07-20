#!/usr/bin/env bash
# Build offline region graph bundles from Geofabrik OSM extracts.
#
# Usage: ./scripts/build-region-tiles.sh [--all] [region-id]
#   Without args: builds all available regions.
#   With region-id: builds a single region (e.g. "pennsylvania").
#   With --all: explicit flag for all regions.
#
# Prerequisites (run once):
#   ./scripts/bootstrap-data.sh
#
# This script reads region metadata from src/lib/offline/region-catalog.ts
# (via the companion Node.js builder), fetches the Geofabrik extract for each
# region, runs the GraphHopper tile builder, validates counts/schema,
# computes a SHA-256 for every bundle, retains the newest 3 versions of
# each region bundle, and publishes the manifest atomically.
#
# Tile format version: 1.0.0
# OSM data source: Geofabrik daily extracts (ODbL, attribution required)
# Attribution: © OpenStreetMap contributors, ODbL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/data/offline-tiles"
BUILDER_SCRIPT="$SCRIPT_DIR/build-graph-bundle.mjs"
RETENTION_VERSIONS=3
MANIFEST_PATH="$OUTPUT_DIR/manifest.json"
MANIFEST_NEXT_PATH="$OUTPUT_DIR/manifest.next.json"

mkdir -p "$OUTPUT_DIR"

REGION_ID=""
ALL_REGIONS=false

for arg in "$@"; do
  case "$arg" in
    --all)
      ALL_REGIONS=true
      ;;
    --help|-h)
      echo "Usage: $0 [--all] [region-id]"
      exit 0
      ;;
    *)
      if [ -n "$REGION_ID" ]; then
        echo "Unexpected argument: $arg" >&2
        exit 2
      fi
      REGION_ID="$arg"
      ;;
  esac
done

if [ -n "$REGION_ID" ] && [ "$ALL_REGIONS" = "true" ]; then
  echo "Combining --all with a region-id is not supported" >&2
  exit 2
fi

echo "=== Building offline region graph bundles ==="
echo "Output directory: $OUTPUT_DIR"

if [ -n "$REGION_ID" ]; then
  node "$BUILDER_SCRIPT" "$REGION_ID" "$OUTPUT_DIR"
elif [ "$ALL_REGIONS" = "true" ] || [ "$#" -eq 0 ]; then
  node "$BUILDER_SCRIPT" --all "$OUTPUT_DIR"
else
  node "$BUILDER_SCRIPT" --all "$OUTPUT_DIR"
fi

echo ""
echo "=== Validating bundles ==="

# Verify each bundle has a non-empty payload and reflects current schema.
validate_bundle() {
  local bundle_path="$1"
  if [ ! -s "$bundle_path" ]; then
    echo "ERROR: bundle is empty: $bundle_path" >&2
    return 1
  fi
  if ! node -e '
    const fs = require("fs");
    const path = process.argv[1];
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    if (!data.regionId || typeof data.regionId !== "string") {
      console.error("missing regionId in " + path);
      process.exit(1);
    }
    if (!data.bundleVersion || typeof data.bundleVersion !== "string") {
      console.error("missing bundleVersion in " + path);
      process.exit(1);
    }
    if (!data.builtAt || typeof data.builtAt !== "string") {
      console.error("missing builtAt in " + path);
      process.exit(1);
    }
    if (typeof data.nodeDataEncoded !== "string" || data.nodeDataEncoded.length === 0) {
      console.error("missing nodeDataEncoded in " + path);
      process.exit(1);
    }
    if (typeof data.edgeDataEncoded !== "string" || data.edgeDataEncoded.length === 0) {
      console.error("missing edgeDataEncoded in " + path);
      process.exit(1);
    }
    if (typeof data.geometryDataEncoded !== "string" || data.geometryDataEncoded.length === 0) {
      console.error("missing geometryDataEncoded in " + path);
      process.exit(1);
    }
  ' "$bundle_path"; then
    return 1
  fi
  return 0
}

# Walk every .graph bundle, recompute its SHA-256 (overwrites the
# builder's checksum with a freshly derived one so the manifest stays
# authoritative), then surface a non-empty payload check.
mapfile -t BUNDLES < <(find "$OUTPUT_DIR" -maxdepth 1 -type f -name '*.graph' | sort)

if [ "${#BUNDLES[@]}" -eq 0 ]; then
  echo "WARNING: no bundles were produced" >&2
fi

SWITCHBACK_MANIFEST_NEXT="$MANIFEST_NEXT_PATH" node -e '
  const fs = require("fs");
  const crypto = require("crypto");
  const path = require("path");
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    bundles: []
  };
  for (const bundlePath of process.argv.slice(1)) {
    const bytes = fs.readFileSync(bundlePath);
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const parsed = JSON.parse(bytes.toString("utf8"));
    manifest.bundles.push({
      regionId: parsed.regionId,
      bundleVersion: parsed.bundleVersion,
      builtAt: parsed.builtAt,
      path: path.basename(bundlePath),
      sha256: hash,
      bytes: bytes.byteLength
    });
  }
  fs.writeFileSync(process.env.SWITCHBACK_MANIFEST_NEXT, JSON.stringify(manifest, null, 2) + "\n", "utf8");
' "${BUNDLES[@]}"

for bundle in "${BUNDLES[@]}"; do
  if ! validate_bundle "$bundle"; then
    exit 1
  fi
done

echo "Validated ${#BUNDLES[@]} bundle(s)."

# Snapshot the live bundle to a timestamped copy so older builds remain
# recoverable while the next weekly run builds over the live path.
SNAPSHOT_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
for bundle in "${BUNDLES[@]}"; do
  region_base="$(basename "$bundle")"
  snapshot_path="$OUTPUT_DIR/${region_base}.archive_${SNAPSHOT_STAMP}"
  cp -a "$bundle" "$snapshot_path"
done

# Retain only the newest RETENTION_VERSIONS archived snapshots per region
# (the live {region}.graph is always preserved separately).
node -e '
  const fs = require("fs");
  const path = require("path");
  const dir = process.argv[1];
  const retention = Number(process.argv[2] || "3");
  const groups = new Map();
  for (const entry of fs.readdirSync(dir)) {
    const match = entry.match(/^(.+\.graph)\.archive_(\d{8}T\d{6}Z)$/);
    if (!match) continue;
    const fileId = match[1];
    const stamp = match[2];
    const full = path.join(dir, entry);
    if (!groups.has(fileId)) groups.set(fileId, []);
    groups.get(fileId).push({ full, entry, stamp });
  }
  let pruned = 0;
  for (const [, files] of groups) {
    files.sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0));
    for (const file of files.slice(retention)) {
      fs.unlinkSync(file.full);
      pruned += 1;
    }
  }
  if (pruned > 0) console.log(`Pruned ${pruned} superseded bundle snapshot(s).`);
' "$OUTPUT_DIR" "$RETENTION_VERSIONS"

# Atomic manifest publish: write next, then rename over the live file so
# clients reading the manifest always see a consistent snapshot.
mv "$MANIFEST_NEXT_PATH" "$MANIFEST_PATH"
echo "Published manifest: $MANIFEST_PATH"
echo ""
echo "=== Build complete ==="
echo "Bundles are in: $OUTPUT_DIR"
echo "Serve via: /api/offline/regions/{region-id}.graph"

