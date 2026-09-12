import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { createInterface } from "node:readline"
import { tmpdir } from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { CanonicalSegment, CanonicalSegmentDirection } from "../src/lib/roads/canonical-segments"
import type { Coordinate } from "../src/lib/routing/types"
import {
  childProcessCompletion,
  graphFingerprintFromFiles,
  motorcycleWayDirections,
  motorcycleWayIsRoutable,
  type MotorcycleWayTags
} from "../src/lib/roads/gravel-atlas/graph-build"

interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

interface NodeRow {
  lon: number
  lat: number
}

const GRID_DEGREES = 0.05
const SOURCE_PADDING_METERS = 80
const EARTH_RADIUS_METERS = 6_371_000
const SHA256_HEX = /^[0-9a-f]{64}$/

function argument(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

function decodeOpl(value: string): string {
  return value.replace(/%([0-9a-fA-F]{2})%/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
}

function section(line: string, marker: string): string {
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

function tagsFrom(line: string): Record<string, string> {
  const raw = section(line, "T")
  const tags: Record<string, string> = {}
  if (!raw) return tags
  for (const item of raw.split(",")) {
    const equals = item.indexOf("=")
    if (equals < 0) continue
    tags[decodeOpl(item.slice(0, equals))] = decodeOpl(item.slice(equals + 1))
  }
  return tags
}

function nodeIdFromToken(token: string): string {
  return token.startsWith("n") ? token.slice(1) : token
}

function radians(value: number): number {
  return value * Math.PI / 180
}

function haversineMeters(first: Coordinate, second: Coordinate): number {
  const deltaLatitude = radians(second[1] - first[1])
  const deltaLongitude = radians(second[0] - first[0])
  const latitudeA = radians(first[1])
  const latitudeB = radians(second[1])
  const value = Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)))
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function normalizedGeometry(geometry: readonly Coordinate[]): Coordinate[] {
  return geometry.map(([longitude, latitude]) => [
    Object.is(longitude, -0) ? 0 : longitude,
    Object.is(latitude, -0) ? 0 : latitude
  ])
}

function canonicalSegment(
  osmWayId: string,
  fromOsmNodeId: string,
  toOsmNodeId: string,
  direction: CanonicalSegmentDirection,
  osmSnapshot: string,
  topologyVersion: string,
  geometry: Coordinate[]
): CanonicalSegment {
  const normalized = normalizedGeometry(geometry)
  return {
    segmentUid: sha256([osmWayId, fromOsmNodeId, toOsmNodeId, direction].join("|")),
    osmWayId,
    fromOsmNodeId,
    toOsmNodeId,
    direction,
    osmSnapshot,
    topologyVersion,
    geometryHash: sha256(JSON.stringify(normalized)),
    geometry: normalized,
    lengthMeters: haversineMeters(normalized[0]!, normalized[normalized.length - 1]!)
  }
}

function cell(value: number): number {
  return Math.floor(value / GRID_DEGREES)
}

function gridKey(x: number, y: number): string {
  return `${x}:${y}`
}

function expandedBounds(bounds: Bounds): Bounds {
  const meanLatitude = (bounds.south + bounds.north) / 2
  const latitudePadding = SOURCE_PADDING_METERS / 111_320
  const longitudePadding = SOURCE_PADDING_METERS /
    Math.max(1, Math.cos(radians(meanLatitude)) * 111_320)
  return {
    west: bounds.west - longitudePadding,
    south: bounds.south - latitudePadding,
    east: bounds.east + longitudePadding,
    north: bounds.north + latitudePadding
  }
}

function intersects(first: Bounds, second: Bounds): boolean {
  return first.east >= second.west && first.west <= second.east &&
    first.north >= second.south && first.south <= second.north
}

function sourceGrid(stagingDatabasePath: string): Map<string, Bounds[]> {
  const database = new DatabaseSync(stagingDatabasePath, { readOnly: true })
  try {
    const rows = database.prepare(`
      select west, south, east, north
      from gravel_source_observations
    `).all() as unknown as Bounds[]
    if (rows.length === 0) throw new Error("Gravel Atlas staging database has no source observations")
    const grid = new Map<string, Bounds[]>()
    for (const row of rows) {
      const bounds = expandedBounds(row)
      for (let x = cell(bounds.west); x <= cell(bounds.east); x += 1) {
        for (let y = cell(bounds.south); y <= cell(bounds.north); y += 1) {
          const key = gridKey(x, y)
          const bucket = grid.get(key) ?? []
          bucket.push(bounds)
          grid.set(key, bucket)
        }
      }
    }
    return grid
  } finally {
    database.close()
  }
}

function nearSource(grid: Map<string, Bounds[]>, first: Coordinate, second: Coordinate): boolean {
  const segmentBounds: Bounds = {
    west: Math.min(first[0], second[0]),
    south: Math.min(first[1], second[1]),
    east: Math.max(first[0], second[0]),
    north: Math.max(first[1], second[1])
  }
  const seen = new Set<Bounds>()
  for (let x = cell(segmentBounds.west); x <= cell(segmentBounds.east); x += 1) {
    for (let y = cell(segmentBounds.south); y <= cell(segmentBounds.north); y += 1) {
      for (const bounds of grid.get(gridKey(x, y)) ?? []) {
        if (seen.has(bounds)) continue
        seen.add(bounds)
        if (intersects(segmentBounds, bounds)) return true
      }
    }
  }
  return false
}

async function atomicJsonWrite(destination: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true })
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${process.pid}.${Date.now()}.tmp`)
  await rm(temporary, { force: true })
  try {
    await writeFile(temporary, `${JSON.stringify(value)}\n`, "utf8")
    await rename(temporary, destination)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

async function main() {
  const stagingDatabasePath = path.resolve(argument("staging") ?? "data/gravel-atlas-sources.sqlite")
  const osmPath = path.resolve(argument("osm") ?? "data/pa-nj-motorcycle.osm.pbf")
  const graphHopperPath = path.resolve(argument("graphhopper") ?? "data/graphhopper-web-11.0.jar")
  const configPath = path.resolve(argument("config") ?? "infra/graphhopper/config.yml")
  const customModelsDirectory = path.resolve(argument("models") ?? "infra/graphhopper/custom-models")
  const fingerprintPath = path.resolve(argument("fingerprint") ?? "data/graph-cache/switchback-graph-fingerprint")
  const outputPath = path.resolve(argument("output") ?? "data/gravel-atlas-graph.json")

  const stampedFingerprint = (await readFile(fingerprintPath, "utf8")).trim().toLowerCase()
  if (!SHA256_HEX.test(stampedFingerprint)) throw new Error("Active GraphHopper graph fingerprint is missing or invalid")
  const currentInputs = await graphFingerprintFromFiles({
    osmPath,
    graphHopperPath,
    configPath,
    customModelsDirectory
  })
  if (currentInputs.fingerprint !== stampedFingerprint) {
    throw new Error("Active GraphHopper graph was built from different inputs; rebuild/swap it before Gravel Atlas reconciliation")
  }

  const grid = sourceGrid(stagingDatabasePath)
  const workingDirectory = mkdtempSync(path.join(tmpdir(), "switchback-gravel-graph-"))
  const nodeDatabasePath = path.join(workingDirectory, "nodes.sqlite")
  const nodeDatabase = new DatabaseSync(nodeDatabasePath)
  nodeDatabase.exec("create table nodes (id text primary key, lon real not null, lat real not null) without rowid")
  const insertNode = nodeDatabase.prepare("insert into nodes (id, lon, lat) values (?, ?, ?)")
  const getNode = nodeDatabase.prepare("select lon, lat from nodes where id = ?")
  const nodeBatch: Array<[string, number, number]> = []
  const segments: CanonicalSegment[] = []
  const segmentIds = new Set<string>()
  let sourcePhase: "nodes" | "ways" = "nodes"
  let sourceWays = 0
  let routableWays = 0
  let consideredSegments = 0

  const flushNodes = () => {
    if (nodeBatch.length === 0) return
    nodeDatabase.exec("begin")
    try {
      for (const [id, lon, lat] of nodeBatch.splice(0)) insertNode.run(id, lon, lat)
      nodeDatabase.exec("commit")
    } catch (error) {
      nodeDatabase.exec("rollback")
      throw error
    }
  }

  const processWay = (line: string) => {
    sourceWays += 1
    const wayId = /^w(\d+)/.exec(line)?.[1]
    const tags = tagsFrom(line) as MotorcycleWayTags
    if (!wayId || !motorcycleWayIsRoutable(tags)) return
    const references = section(line, "N").split(",").filter(Boolean).map(nodeIdFromToken)
    if (references.length < 2) return
    routableWays += 1
    const directions = motorcycleWayDirections(tags)
    for (let index = 0; index < references.length - 1; index += 1) {
      const firstId = references[index]!
      const secondId = references[index + 1]!
      const firstRow = getNode.get(firstId) as unknown as NodeRow | undefined
      const secondRow = getNode.get(secondId) as unknown as NodeRow | undefined
      if (!firstRow || !secondRow) continue
      const first: Coordinate = [firstRow.lon, firstRow.lat]
      const second: Coordinate = [secondRow.lon, secondRow.lat]
      consideredSegments += 1
      if (!nearSource(grid, first, second)) continue
      for (const direction of directions) {
        const forward = direction === "forward"
        const fromId = forward ? firstId : secondId
        const toId = forward ? secondId : firstId
        const geometry = forward ? [first, second] : [second, first]
        const segment = canonicalSegment(
          wayId,
          fromId,
          toId,
          direction,
          currentInputs.osmSha256,
          stampedFingerprint,
          geometry
        )
        if (segmentIds.has(segment.segmentUid)) continue
        segmentIds.add(segment.segmentUid)
        segments.push(segment)
      }
    }
  }

  try {
    const osmium = spawn("osmium", ["tags-filter", osmPath, "w/highway", "-f", "opl"], {
      stdio: ["ignore", "pipe", "inherit"]
    })
    const completion = childProcessCompletion(osmium)
    const lines = createInterface({ input: osmium.stdout, crlfDelay: Infinity })
    for await (const line of lines) {
      if (line.startsWith("n")) {
        const id = /^n(\d+)/.exec(line)?.[1]
        const lon = /(?:^| )x(-?\d+(?:\.\d+)?)/.exec(line)?.[1]
        const lat = /(?:^| )y(-?\d+(?:\.\d+)?)/.exec(line)?.[1]
        if (id && lon && lat) {
          nodeBatch.push([id, Number(lon), Number(lat)])
          if (nodeBatch.length >= 10_000) flushNodes()
        }
      } else if (line.startsWith("w")) {
        if (sourcePhase === "nodes") {
          flushNodes()
          sourcePhase = "ways"
        }
        processWay(line)
      }
    }
    flushNodes()
    const exitCode = await completion
    if (exitCode !== 0) throw new Error(`osmium exited with status ${String(exitCode)}`)

    segments.sort((left, right) => left.segmentUid.localeCompare(right.segmentUid))
    if (segments.length === 0) throw new Error("No canonical motorcycle segments intersect staged Gravel Atlas source geometry")
    await atomicJsonWrite(outputPath, {
      schemaVersion: 1,
      graphFingerprint: stampedFingerprint,
      osmSnapshot: currentInputs.osmSha256,
      segmentCount: segments.length,
      segments
    })
    console.log(JSON.stringify({
      outputPath,
      graphFingerprint: stampedFingerprint,
      osmSnapshot: currentInputs.osmSha256,
      sourceWays,
      routableWays,
      consideredSegments,
      retainedSegments: segments.length
    }))
  } finally {
    try { nodeDatabase.close() } catch { /* already closed */ }
    rmSync(workingDirectory, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
