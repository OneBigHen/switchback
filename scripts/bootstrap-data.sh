#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT/data"

link_first_existing() {
  local target="$1"
  shift
  if [[ -e "$target" || -L "$target" ]]; then
    return
  fi
  for candidate in "$@"; do
    if [[ -e "$candidate" ]]; then
      ln -s "$candidate" "$target"
      return
    fi
  done
  return 1
}

download_file() {
  local target="$1"
  local url="$2"
  local partial="${target}.part"
  if ! command -v curl >/dev/null 2>&1; then
    return 1
  fi
  echo "Downloading $(basename "$target")..."
  if curl -fL --retry 3 --progress-bar -o "$partial" "$url"; then
    mv "$partial" "$target"
    return 0
  fi
  rm -f "$partial"
  return 1
}

PA_PBF="$ROOT/data/pennsylvania-latest.osm.pbf"
NJ_PBF="$ROOT/data/new-jersey-latest.osm.pbf"
REGION_PBF="$ROOT/data/pa-nj-latest.osm.pbf"

link_first_existing "$PA_PBF" \
  /root/Vibe/ridevector/data/pennsylvania-latest.osm.pbf \
  /root/Vibe/graphhopper/pennsylvania-latest.osm.pbf \
  /root/Vibe/PA-Moto-Router/graphhopper/pennsylvania-latest.osm.pbf || \
  download_file \
    "$PA_PBF" \
    "${SWITCHBACK_PBF_URL:-https://download.geofabrik.de/north-america/us/pennsylvania-latest.osm.pbf}" || {
    echo "No Pennsylvania OSM extract found. Download one from Geofabrik into data/pennsylvania-latest.osm.pbf."
    exit 1
  }

link_first_existing "$NJ_PBF" \
  /root/Vibe/ridevector/data/new-jersey-latest.osm.pbf \
  /root/Vibe/graphhopper/new-jersey-latest.osm.pbf \
  /root/Vibe/PA-Moto-Router/graphhopper/new-jersey-latest.osm.pbf || \
  download_file \
    "$NJ_PBF" \
    "${SWITCHBACK_NJ_PBF_URL:-https://download.geofabrik.de/north-america/us/new-jersey-latest.osm.pbf}" || {
    echo "No New Jersey OSM extract found. Download one from Geofabrik into data/new-jersey-latest.osm.pbf."
    exit 1
  }

if ! command -v osmium >/dev/null 2>&1; then
  echo "osmium-tool is required to prepare motorcycle-specific road access."
  exit 1
fi

if [[ ! -f "$REGION_PBF" || "$PA_PBF" -nt "$REGION_PBF" || "$NJ_PBF" -nt "$REGION_PBF" ]]; then
  echo "Merging Pennsylvania and New Jersey routing extracts..."
  osmium merge "$PA_PBF" "$NJ_PBF" --output "$REGION_PBF" --overwrite
fi

MOTORCYCLE_PBF="$ROOT/data/pa-nj-motorcycle.osm.pbf"
MOTORCYCLE_PREPARER="$ROOT/scripts/prepare-motorcycle-osm.mjs"
MOTORCYCLE_NORMALIZER="$ROOT/scripts/lib/motorcycle-osm.mjs"
if [[ ! -f "$MOTORCYCLE_PBF" \
  || "$REGION_PBF" -nt "$MOTORCYCLE_PBF" \
  || "$MOTORCYCLE_PREPARER" -nt "$MOTORCYCLE_PBF" \
  || "$MOTORCYCLE_NORMALIZER" -nt "$MOTORCYCLE_PBF" ]]; then
  echo "Preparing motorcycle-specific OSM access data..."
  node "$MOTORCYCLE_PREPARER" \
    "$REGION_PBF" \
    "$MOTORCYCLE_PBF"
fi

link_first_existing "$ROOT/data/graphhopper-web-11.0.jar" \
  /root/Vibe/ridevector/.cache/graphhopper/graphhopper-web-11.0.jar || \
  download_file \
    "$ROOT/data/graphhopper-web-11.0.jar" \
    "${SWITCHBACK_GRAPHHOPPER_JAR_URL:-https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/11.0/graphhopper-web-11.0.jar}" || {
    echo "GraphHopper 11 jar not found. Place graphhopper-web-11.0.jar in data/."
    exit 1
  }

link_first_existing "$ROOT/data/segments.db" \
  /root/Vibe/planning-skill/data/segments.db \
  /root/Vibe/rideplanner/data/segments.db || {
    echo "Curvature database is optional and was not found."
  }

echo "Switchback data and motorcycle access extract are ready."
