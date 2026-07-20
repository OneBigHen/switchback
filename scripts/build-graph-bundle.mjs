#!/usr/bin/env node
/**
 * Graph bundle builder — reads region catalog, fetches Geofabrik extract,
 * runs GraphHopper to produce motorcycle-optimized graph tiles, and outputs
 * serialized OfflineGraph bundles for client download.
 *
 * This runs on the Proxmox host, not in the browser.
 *
 * Usage:
 *   node build-graph-bundle.mjs <region-id> <output-dir>
 *   node build-graph-bundle.mjs --all <output-dir>
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { execSync } from "node:child_process"
import { createHash } from "node:crypto"

/**
 * Minimal region catalog mirror — the Node.js builder can't import TS directly
 * without a build step, so we define the region list here as the single source
 * of truth for the build pipeline. Kept in sync with src/lib/offline/region-catalog.ts.
 */
const REGIONS = [
  { id: "pennsylvania",       geofabrikId: "pennsylvania",       osmFile: "pennsylvania-latest.osm.pbf" },
  { id: "new-jersey",         geofabrikId: "new-jersey",         osmFile: "new-jersey-latest.osm.pbf" },
  { id: "new-york",           geofabrikId: "new-york",           osmFile: "new-york-latest.osm.pbf" },
  { id: "maryland",           geofabrikId: "maryland",           osmFile: "maryland-latest.osm.pbf" },
  { id: "delaware",           geofabrikId: "delaware",           osmFile: "delaware-latest.osm.pbf" },
  { id: "west-virginia",      geofabrikId: "west-virginia",      osmFile: "west-virginia-latest.osm.pbf" },
  { id: "virginia",           geofabrikId: "virginia",           osmFile: "virginia-latest.osm.pbf" },
  { id: "ohio",               geofabrikId: "ohio",               osmFile: "ohio-latest.osm.pbf" },
  { id: "vermont",            geofabrikId: "vermont",            osmFile: "vermont-latest.osm.pbf" },
  { id: "north-carolina",     geofabrikId: "north-carolina",     osmFile: "north-carolina-latest.osm.pbf" }
]

const GEOFABRIK_BASE = "https://download.geofabrik.de/north-america/us"

function log(msg) {
  process.stderr.write(`[build-graph-bundle] ${msg}\n`)
}

async function fetchOsmExtract(region, dataDir) {
  const url = `${GEOFABRIK_BASE}/${region.geofabrikId}-latest.osm.pbf`
  const dest = join(dataDir, region.osmFile)
  log(`Fetching ${url} ...`)
  execSync(`curl -fsSL -o "${dest}" "${url}"`, { stdio: "inherit" })
  const stat = readFileSync(dest)
  log(`Downloaded ${(stat.length / 1_000_000).toFixed(1)} MB`)
  return dest
}

function buildGraphHopperTiles(region, osmPath, outputDir) {
  const tmpDir = join(outputDir, `tmp-${region.id}`)
  mkdirSync(tmpDir, { recursive: true })

  const configPath = join(tmpDir, "config.yml")
  const config = `
graphhopper:
  datareader.file: ${osmPath}
  graph.location: ${tmpDir}/graph-cache
  graph.dataaccess: RAM_STORE
  prepare.min_network_size: 50
  prepare.min_one_way_network_size: 0
  routing.non_ch.max_waypoint_distance: 1000000
  graph.flag_encoders: motorcycle
  graph.encoded_values: motorcycle_access,road_class,road_environment,max_speed,surface,smoothness,track_type,toll,max_weight,seasonal
profiles:
  - name: motorcycle
    vehicle: motorcycle
    weighting: custom
    custom_model_file: motorcycle.json
`
  writeFileSync(configPath, config, "utf-8")

  const graphhopperJar = join(dirname(outputDir), "..", "data", "graphhopper-web-11.0.jar")
  log(`Building GraphHopper tiles for ${region.id} ...`)
  execSync(`java -Xmx2g -jar "${graphhopperJar}" import "${configPath}"`, {
    cwd: tmpDir,
    stdio: "inherit",
    env: { ...process.env, JAVA_OPTS: "-Xmx2g" }
  })

  const graphDir = join(tmpDir, "graph-cache")
  return graphDir
}

function serializeGraphBundle(region, graphDir, outputDir) {
  const bundlePath = join(outputDir, `${region.id}.graph`)
  const hash = createHash("sha256")

  // Read graph files from GraphHopper output
  const nodeData = readFileSync(join(graphDir, "nodes_ch_fastest_motorcycle"))
  const edgeData = readFileSync(join(graphDir, "edges"))
  const geometryData = readFileSync(join(graphDir, "geometry"))

  const bundle = JSON.stringify({
    schemaVersion: 1,
    regionId: region.id,
    bundleVersion: "1.0.0",
    builtAt: new Date().toISOString(),
    checksum: hash.digest("hex"),
    nodeDataEncoded: nodeData.toString("base64"),
    edgeDataEncoded: edgeData.toString("base64"),
    geometryDataEncoded: geometryData.toString("base64")
  })

  writeFileSync(bundlePath, bundle, "utf-8")
  log(`Wrote bundle: ${bundlePath} (${(bundle.length / 1_000_000).toFixed(1)} MB)`)
  return bundlePath
}

async function buildRegion(region, outputDir) {
  log(`=== Building ${region.id} ===`)
  const dataDir = join(outputDir, "..", "data", "osm")
  mkdirSync(dataDir, { recursive: true })

  await fetchOsmExtract(region, dataDir)
  const graphDir = buildGraphHopperTiles(region, join(dataDir, region.osmFile), outputDir)
  serializeGraphBundle(region, graphDir, outputDir)
  log(`=== ${region.id} complete ===\n`)
}

async function main() {
  const args = process.argv.slice(2)
  let regionIds = []
  let outputDir = "data/offline-tiles"

  if (args[0] === "--all") {
    outputDir = args[1] || outputDir
    regionIds = REGIONS.map(r => r.id)
  } else {
    regionIds = [args[0]]
    outputDir = args[1] || outputDir
  }

  mkdirSync(outputDir, { recursive: true })

  for (const id of regionIds) {
    const region = REGIONS.find(r => r.id === id)
    if (!region) {
      log(`Unknown region: ${id}. Available: ${REGIONS.map(r => r.id).join(", ")}`)
      continue
    }
    await buildRegion(region, outputDir)
  }
}

main().catch((err) => {
  log(`FATAL: ${err.message}`)
  process.exit(1)
})
