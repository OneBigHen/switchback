#!/usr/bin/env node

import { createHash } from "node:crypto"
import { createInterface } from "node:readline"
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import { closeSync, openSync, writeSync } from "node:fs"
import { join } from "node:path"
import { spawn, spawnSync } from "node:child_process"
import Database from "better-sqlite3"

const [inputPbf, outputRoot, regionId, regionName = regionId] = process.argv.slice(2)
if (!inputPbf || !outputRoot || !regionId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(regionId)) {
  console.error("Usage: build-offline-v2.mjs INPUT.osm.pbf OUTPUT_ROOT REGION_ID [REGION_NAME]")
  process.exit(2)
}

const TILE_DEGREES = Number(process.env.SWITCHBACK_OFFLINE_TILE_DEGREES || "0.25")
await mkdir(join(outputRoot, regionId), { recursive: true })
const pendingDirectory = await mkdtemp(join(outputRoot, regionId, ".pending-"))
const stagingDirectory = join(pendingDirectory, "staging")
await mkdir(stagingDirectory)
await mkdir(join(pendingDirectory, "tiles"))

const database = new Database(join(pendingDirectory, "build.sqlite"))
database.pragma("journal_mode = WAL")
database.pragma("synchronous = NORMAL")
database.exec(`
  CREATE TABLE nodes (id TEXT PRIMARY KEY, lon REAL NOT NULL, lat REAL NOT NULL) WITHOUT ROWID;
  CREATE TABLE edge_refs (
    way_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    edge_id TEXT NOT NULL
  );
  CREATE INDEX edge_refs_lookup ON edge_refs (way_id, node_id, direction);
`)
const insertNode = database.prepare("INSERT INTO nodes (id, lon, lat) VALUES (?, ?, ?)")
const getNode = database.prepare("SELECT lon, lat FROM nodes WHERE id = ?")
const insertEdgeRef = database.prepare(
  "INSERT INTO edge_refs (way_id, node_id, direction, edge_id) VALUES (?, ?, ?, ?)"
)
const findEdgeRefs = database.prepare(
  "SELECT edge_id FROM edge_refs WHERE way_id = ? AND node_id = ? AND direction = ?"
)
const nodeBatch = []
const edgeRefBatch = []
const writeNodes = database.transaction((batch) => {
  for (const [id, lon, lat] of batch) insertNode.run(id, lon, lat)
})
const writeEdgeRefs = database.transaction((batch) => {
  for (const [wayId, nodeId, direction, edgeId] of batch) {
    insertEdgeRef.run(wayId, nodeId, direction, edgeId)
  }
})
const tileHandles = new Map()
const tileKeys = new Set()
let sourcePhase = "nodes"

function flushNodes() {
  if (nodeBatch.length > 0) writeNodes(nodeBatch.splice(0))
}

function flushEdgeRefs() {
  if (edgeRefBatch.length > 0) writeEdgeRefs(edgeRefBatch.splice(0))
}
const stats = {
  sourceNodes: 0,
  sourceWays: 0,
  eligibleWays: 0,
  rejectedConditionalWays: 0,
  rejectedAccessWays: 0,
  directedEdges: 0,
  sourceRestrictions: 0,
  emittedRestrictions: 0,
  unsupportedRestrictions: 0
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function decodeOpl(value) {
  return value.replace(/%([0-9a-fA-F]{2})%/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
}

function section(line, marker) {
  const start = line.indexOf(` ${marker}`)
  if (start < 0) return ""
  const valueStart = start + 2
  let end = line.length
  for (const candidate of [" T", " N", " M"]) {
    const index = line.indexOf(candidate, valueStart)
    if (index >= 0 && index < end) end = index
  }
  return line.slice(valueStart, end)
}

function tagsFrom(line) {
  const raw = section(line, "T")
  const tags = new Map()
  if (!raw) return tags
  for (const item of raw.split(",")) {
    const equals = item.indexOf("=")
    if (equals < 0) continue
    tags.set(decodeOpl(item.slice(0, equals)), decodeOpl(item.slice(equals + 1)))
  }
  return tags
}

function nodeIdFromToken(token) {
  return token.startsWith("n") ? token.slice(1) : token
}

function gridIndex(value) {
  return Math.floor(value / TILE_DEGREES)
}

function gridKey(coordinate) {
  const x = gridIndex(coordinate[0])
  const y = gridIndex(coordinate[1])
  const part = (axis, value) => `${axis}${value < 0 ? "m" : "p"}${Math.abs(value)}`
  return `${part("x", x)}_${part("y", y)}`
}

function gridBounds(key) {
  const match = /^x([mp])(\d+)_y([mp])(\d+)$/.exec(key)
  if (!match) throw new Error(`Invalid grid key ${key}`)
  const x = Number(match[2]) * (match[1] === "m" ? -1 : 1)
  const y = Number(match[4]) * (match[3] === "m" ? -1 : 1)
  return {
    minLon: x * TILE_DEGREES,
    minLat: y * TILE_DEGREES,
    maxLon: (x + 1) * TILE_DEGREES,
    maxLat: (y + 1) * TILE_DEGREES
  }
}

function tileHandle(key) {
  let handle = tileHandles.get(key)
  if (handle === undefined) {
    handle = openSync(join(stagingDirectory, `${key}.ndjson`), "a")
    tileHandles.set(key, handle)
    tileKeys.add(key)
  }
  return handle
}

function addEdgeToTile(key, edge, fromCoordinate, toCoordinate) {
  writeSync(tileHandle(key), `${JSON.stringify({
    type: "edge",
    edge,
    nodes: [
      { id: edge.fromNodeId, coordinate: fromCoordinate },
      { id: edge.toNodeId, coordinate: toCoordinate }
    ]
  })}\n`)
}

function rememberEdge(map, wayId, nodeId, edgeId) {
  edgeRefBatch.push([wayId, nodeId, map, edgeId])
  if (edgeRefBatch.length >= 10_000) {
    writeEdgeRefs(edgeRefBatch.splice(0))
  }
}

function haversineMeters(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180
  const dLat = radians(b[1] - a[1])
  const dLon = radians(b[0] - a[0])
  const lat1 = radians(a[1])
  const lat2 = radians(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function accessState(value) {
  if (["no", "private"].includes(value)) return "forbidden"
  if (value === "designated") return "designated"
  if (["destination", "customers", "delivery", "permissive"].includes(value)) return "discouraged"
  return "permitted"
}

function roadClass(highway) {
  if (["motorway", "motorway_link"].includes(highway)) return "motorway"
  if (["trunk", "trunk_link"].includes(highway)) return "trunk"
  if (["primary", "primary_link"].includes(highway)) return "primary"
  if (["secondary", "secondary_link"].includes(highway)) return "secondary"
  if (["tertiary", "tertiary_link"].includes(highway)) return "tertiary"
  if (highway === "residential" || highway === "living_street") return "residential"
  if (highway === "track") return "track"
  if (highway === "path") return "path"
  if (highway === "service") return "service"
  return "unclassified"
}

function surface(tags) {
  const value = tags.get("surface") ?? "unknown"
  if (["asphalt", "concrete", "gravel", "dirt", "paved", "unpaved", "ground"].includes(value)) return value
  return value === "fine_gravel" || value === "pebblestone" || value === "compacted" ? "gravel" : "unknown"
}

function smoothness(tags) {
  const value = tags.get("smoothness")
  return ["excellent", "good", "intermediate", "bad", "very_bad", "horrible"].includes(value)
    ? value
    : undefined
}

function trackType(tags) {
  const value = tags.get("tracktype")
  return ["grade1", "grade2", "grade3", "grade4", "grade5"].includes(value)
    ? value
    : undefined
}

function maxSpeed(tags) {
  const raw = tags.get("maxspeed")
  if (!raw) return undefined
  const match = /^(\d+(?:\.\d+)?)\s*(mph)?$/i.exec(raw)
  if (!match) return undefined
  const value = Number(match[1])
  return match[2] ? Math.round(value * 1.609344) : value
}

function profileWeights(tags, lengthMeters) {
  const klass = roadClass(tags.get("highway"))
  const roadSurface = surface(tags)
  const fast = klass === "motorway" || klass === "trunk"
  const minor = ["tertiary", "unclassified", "residential", "track"].includes(klass)
  const unpaved = ["gravel", "dirt", "unpaved", "ground"].includes(roadSurface)
  return {
    quick: lengthMeters * (fast ? 0.8 : 1),
    twisty: lengthMeters * (fast ? 1.8 : minor ? 0.8 : 1),
    scenic: lengthMeters * (fast ? 1.6 : minor ? 0.85 : 1),
    adventure: lengthMeters * (unpaved ? 0.65 : fast ? 2 : 1)
  }
}

function eligibleWay(tags) {
  const highway = tags.get("highway")
  if (!highway || ["footway", "cycleway", "pedestrian", "steps", "bridleway", "construction", "proposed"].includes(highway)) {
    return false
  }
  for (const key of tags.keys()) {
    if (key.endsWith(":conditional") && ["access:conditional", "vehicle:conditional", "motor_vehicle:conditional", "motorcycle:conditional"].includes(key)) {
      stats.rejectedConditionalWays += 1
      return false
    }
  }
  const general = accessState(tags.get("access"))
  const motorcycle = accessState(tags.get("motorcycle") ?? tags.get("motor_vehicle") ?? tags.get("vehicle"))
  if (general === "forbidden" || motorcycle === "forbidden") {
    stats.rejectedAccessWays += 1
    return false
  }
  return true
}

function emitDirectedEdge(wayId, segmentIndex, suffix, fromId, toId, fromCoordinate, toCoordinate, tags) {
  const lengthMeters = haversineMeters(fromCoordinate, toCoordinate)
  const edge = {
    id: `w${wayId}s${segmentIndex}${suffix}`,
    fromNodeId: fromId,
    toNodeId: toId,
    geometry: [fromCoordinate, toCoordinate],
    osmWayId: wayId,
    motorcycleAccess: accessState(tags.get("motorcycle") ?? tags.get("motor_vehicle") ?? tags.get("vehicle")),
    access: accessState(tags.get("access")),
    roadClass: roadClass(tags.get("highway")),
    surface: surface(tags),
    ...(smoothness(tags) ? { smoothness: smoothness(tags) } : {}),
    ...(trackType(tags) ? { trackType: trackType(tags) } : {}),
    ...(maxSpeed(tags) ? { maxSpeedKph: maxSpeed(tags) } : {}),
    profileWeights: profileWeights(tags, lengthMeters),
    uncertainty: tags.get("surface") ? [] : ["surface_unknown"]
  }
  for (const key of new Set([gridKey(fromCoordinate), gridKey(toCoordinate)])) {
    addEdgeToTile(key, edge, fromCoordinate, toCoordinate)
  }
  rememberEdge("outgoing", wayId, fromId, edge.id)
  rememberEdge("incoming", wayId, toId, edge.id)
  stats.directedEdges += 1
}

function processWay(line) {
  stats.sourceWays += 1
  const wayId = /^w(\d+)/.exec(line)?.[1]
  const tags = tagsFrom(line)
  if (!wayId || !eligibleWay(tags)) return
  const references = section(line, "N").split(",").filter(Boolean).map(nodeIdFromToken)
  if (references.length < 2) return
  stats.eligibleWays += 1
  const oneway = tags.get("oneway")
  const reverseOnly = oneway === "-1"
  const forwardOnly = reverseOnly || ["yes", "1", "true"].includes(oneway) || tags.get("junction") === "roundabout"
  for (let index = 0; index < references.length - 1; index += 1) {
    const aId = references[index]
    const bId = references[index + 1]
    const aRow = getNode.get(aId)
    const bRow = getNode.get(bId)
    if (!aRow || !bRow) continue
    const a = [aRow.lon, aRow.lat]
    const b = [bRow.lon, bRow.lat]
    if (!reverseOnly) emitDirectedEdge(wayId, index, "f", aId, bId, a, b, tags)
    if (!forwardOnly || reverseOnly) emitDirectedEdge(wayId, index, "r", bId, aId, b, a, tags)
  }
}

function processRestriction(line) {
  const tags = tagsFrom(line)
  if (tags.get("type") !== "restriction") return
  stats.sourceRestrictions += 1
  if (tags.has("restriction:conditional")) {
    stats.unsupportedRestrictions += 1
    return
  }
  const members = section(line, "M").split(",")
  const from = members.find((member) => member.endsWith("@from") && member.startsWith("w"))
  const via = members.find((member) => member.endsWith("@via") && member.startsWith("n"))
  const to = members.find((member) => member.endsWith("@to") && member.startsWith("w"))
  if (!from || !via || !to) {
    stats.unsupportedRestrictions += 1
    return
  }
  const fromWay = from.slice(1, from.indexOf("@"))
  const viaNode = via.slice(1, via.indexOf("@"))
  const toWay = to.slice(1, to.indexOf("@"))
  const coordinateRow = getNode.get(viaNode)
  const incoming = findEdgeRefs.all(fromWay, viaNode, "incoming").map((row) => row.edge_id)
  const outgoing = findEdgeRefs.all(toWay, viaNode, "outgoing").map((row) => row.edge_id)
  if (!coordinateRow || incoming.length === 0 || outgoing.length === 0) {
    stats.unsupportedRestrictions += 1
    return
  }
  const coordinate = [coordinateRow.lon, coordinateRow.lat]
  const key = gridKey(coordinate)
  const restrictionValue = tags.get("restriction") ?? ""
  const kind = restrictionValue.startsWith("only_") ? "only_turn" : "no_turn"
  const relationId = /^r(\d+)/.exec(line)?.[1]
  for (const incomingEdgeId of incoming) {
    for (const outgoingEdgeId of outgoing) {
      writeSync(tileHandle(key), `${JSON.stringify({ type: "restriction", restriction: {
        incomingEdgeId,
        viaNodeId: viaNode,
        outgoingEdgeId,
        restriction: kind,
        ...(relationId ? { sourceRelationId: relationId } : {})
      } })}\n`)
      stats.emittedRestrictions += 1
    }
  }
}

// `tags-filter` includes referenced nodes while excluding unrelated OSM objects,
// keeping state-scale builds bounded without sampling any eligible road ways.
const osmium = spawn(
  "osmium",
  ["tags-filter", inputPbf, "w/highway", "r/type=restriction", "-f", "opl"],
  { stdio: ["ignore", "pipe", "inherit"] }
)
const lines = createInterface({ input: osmium.stdout, crlfDelay: Infinity })
for await (const line of lines) {
  if (line.startsWith("n")) {
    const id = /^n(\d+)/.exec(line)?.[1]
    const lon = /(?:^| )x(-?\d+(?:\.\d+)?)/.exec(line)?.[1]
    const lat = /(?:^| )y(-?\d+(?:\.\d+)?)/.exec(line)?.[1]
    if (id && lon && lat) {
      nodeBatch.push([id, Number(lon), Number(lat)])
      if (nodeBatch.length >= 10_000) flushNodes()
      stats.sourceNodes += 1
    }
  } else if (line.startsWith("w")) {
    if (sourcePhase === "nodes") {
      flushNodes()
      sourcePhase = "ways"
    }
    processWay(line)
  } else if (line.startsWith("r")) {
    if (sourcePhase !== "relations") {
      flushNodes()
      flushEdgeRefs()
      sourcePhase = "relations"
    }
    processRestriction(line)
  }
}
flushNodes()
flushEdgeRefs()
const exitCode = await new Promise((resolve) => osmium.once("close", resolve))
if (exitCode !== 0) throw new Error(`osmium exited with status ${exitCode}`)
if (tileKeys.size === 0 || stats.directedEdges === 0) throw new Error("No eligible directed road edges were extracted")
for (const handle of tileHandles.values()) closeSync(handle)
database.close()

const inventory = []

for (const key of [...tileKeys].sort((a, b) => a.localeCompare(b))) {
  const staged = await readFile(join(stagingDirectory, `${key}.ndjson`), "utf8")
  const tileNodes = new Map()
  const tileEdges = new Map()
  const turnRestrictions = []
  for (const line of staged.split("\n")) {
    if (!line) continue
    const record = JSON.parse(line)
    if (record.type === "edge") {
      tileEdges.set(record.edge.id, record.edge)
      for (const node of record.nodes) tileNodes.set(node.id, node)
    } else if (record.type === "restriction") {
      turnRestrictions.push(record.restriction)
    }
  }
  const semantic = {
    schemaVersion: 2,
    tileId: key,
    bounds: gridBounds(key),
    nodes: [...tileNodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...tileEdges.values()].sort((a, b) => a.id.localeCompare(b.id)),
    turnRestrictions: turnRestrictions.sort((a, b) => a.incomingEdgeId.localeCompare(b.incomingEdgeId))
  }
  const semanticHash = hash(JSON.stringify(semantic))
  semantic.tileId = `t-${semanticHash}`
  const compressed = spawnSync("gzip", ["-9", "-c"], {
    input: JSON.stringify(semantic),
    maxBuffer: 1024 * 1024 * 1024
  })
  if (compressed.status !== 0) throw new Error(`gzip failed for ${key}`)
  const tileSha = hash(compressed.stdout)
  await writeFile(join(pendingDirectory, "tiles", `${semantic.tileId}.json.gz`), compressed.stdout)
  inventory.push({
    tileId: semantic.tileId,
    bounds: semantic.bounds,
    bytes: compressed.stdout.byteLength,
    sha256: tileSha,
    nodeCount: semantic.nodes.length,
    edgeCount: semantic.edges.length
  })
}

await rm(stagingDirectory, { recursive: true })
await rm(join(pendingDirectory, "build.sqlite"), { force: true })
await rm(join(pendingDirectory, "build.sqlite-wal"), { force: true })
await rm(join(pendingDirectory, "build.sqlite-shm"), { force: true })

const inventorySha256 = hash(inventory.map((tile) => `${tile.tileId}:${tile.sha256}`).join("\n"))
const buildDate = new Date().toISOString()
const version = `${buildDate.slice(0, 10)}-${inventorySha256.slice(0, 16)}`
const geofabrikSlug = regionId === "new-jersey" ? "new-jersey" : regionId
const geofabrikBase = `https://download.geofabrik.de/north-america/us/${geofabrikSlug}`
const allBounds = inventory.reduce((bounds, tile) => ({
  minLon: Math.min(bounds.minLon, tile.bounds.minLon),
  minLat: Math.min(bounds.minLat, tile.bounds.minLat),
  maxLon: Math.max(bounds.maxLon, tile.bounds.maxLon),
  maxLat: Math.max(bounds.maxLat, tile.bounds.maxLat)
}), { minLon: 180, minLat: 90, maxLon: -180, maxLat: -90 })
const manifest = {
  schemaVersion: 2,
  regionId,
  regionName,
  version,
  compression: "gzip-json",
  buildDate,
  sourceDataDate: process.env.SWITCHBACK_SOURCE_DATA_DATE || buildDate,
  snapshotUrl: process.env.SWITCHBACK_SOURCE_SNAPSHOT_URL || `${geofabrikBase}-latest.osm.pbf`,
  sourceUrl: process.env.SWITCHBACK_SOURCE_URL || `${geofabrikBase}.html`,
  bounds: allBounds,
  checksums: { inventorySha256 },
  attribution: "© OpenStreetMap contributors, ODbL 1.0",
  tiles: inventory,
  tileByteTotal: inventory.reduce((sum, tile) => sum + tile.bytes, 0)
}
await writeFile(join(pendingDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(join(pendingDirectory, "build-report.json"), `${JSON.stringify(stats, null, 2)}\n`)
const finalDirectory = join(outputRoot, regionId, version)
await rename(pendingDirectory, finalDirectory)
const activeNext = join(outputRoot, regionId, "active.next.json")
await writeFile(activeNext, `${JSON.stringify({ version })}\n`)
await rename(activeNext, join(outputRoot, regionId, "active.json"))
console.log(JSON.stringify({ regionId, version, tiles: inventory.length, ...stats }))
