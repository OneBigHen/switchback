/**
 * Verify that every retained atlas corridor can actually be ridden end to end
 * in the built GraphHopper graph, and quarantine the ones that cannot.
 *
 * The canonical exporter proves corridor membership per OSM segment. This step
 * asks the running router the question that per-segment proof cannot answer:
 * "route me from this corridor's start to its end" and then measures, with an
 * implementation independent of the app's evidence code, how much of the
 * corridor that route actually follows.
 *
 * Usage:
 *   npm run gravel-atlas:verify-routability -- [--input=data/gravel-atlas-verified.json]
 *     [--out=data/gravel-atlas-verified-traversable.json] [--report=data/gravel-atlas-traversability.json]
 *     [--graphhopper=http://127.0.0.1:8989] [--profile=motorcycle_adventure]
 *
 * Fails closed: a corridor that cannot be positively shown traversable is
 * quarantined with its measured reason instead of being published.
 */
import { readFileSync, writeFileSync } from "node:fs"
import {
  DEFAULT_TRAVERSABILITY_THRESHOLDS,
  evaluateCorridorTraversability,
  type CorridorTraversalProbe
} from "../src/lib/roads/gravel-atlas/traversability"

interface Coordinate { 0: number; 1: number; length: 2 }

interface VerifiedCorridor {
  id: string
  label: string
  geometry: [number, number][]
  verifiedGravelMeters: number
  longestContinuousGravelMeters: number
  fragmentCount: number
  confidence: number
  verification: string
  canonicalSegmentIds?: string[]
  sourceFeatureRefs?: unknown[]
}

interface VerifiedAtlas {
  graphFingerprint: string
  sourceFingerprint: string
  corridors: VerifiedCorridor[]
  quarantined: Array<Record<string, unknown>>
}

function argument(name: string, fallback: string): string {
  const hit = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const INPUT = argument("input", "data/gravel-atlas-verified.json")
const OUT = argument("out", "data/gravel-atlas-verified-traversable.json")
const REPORT = argument("report", "data/gravel-atlas-traversability.json")
const GRAPHHOPPER = argument("graphhopper", process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8989").replace(/\/$/, "")
const PROFILE = argument("profile", "motorcycle_adventure")

const EARTH_RADIUS = 6371008.8
const SAMPLE_METERS = 25
const radians = (degrees: number) => (degrees * Math.PI) / 180

function haversine(a: Coordinate, b: Coordinate): number {
  const dLat = radians(b[1] - a[1])
  const dLon = radians(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)))
}

function pointToSegmentMeters(point: Coordinate, start: Coordinate, end: Coordinate): number {
  const scaleX = (Math.PI / 180) * EARTH_RADIUS * Math.cos(radians(point[1]))
  const scaleY = (Math.PI / 180) * EARTH_RADIUS
  const px = point[0] * scaleX, py = point[1] * scaleY
  const ax = start[0] * scaleX, ay = start[1] * scaleY
  const bx = end[0] * scaleX, by = end[1] * scaleY
  const dx = bx - ax, dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function sampleLine(coordinates: Coordinate[], stepMeters: number): Coordinate[] {
  const samples: Coordinate[] = [coordinates[0]]
  let carried = 0
  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const start = coordinates[i], end = coordinates[i + 1]
    const span = haversine(start, end)
    if (span <= 0) continue
    let travelled = carried
    while (travelled + stepMeters <= span) {
      travelled += stepMeters
      const t = travelled / span
      samples.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t] as unknown as Coordinate)
    }
    carried = travelled - span
  }
  samples.push(coordinates[coordinates.length - 1])
  return samples
}

/** Fraction of `samples` lying within the match radius of any segment of `line`. */
function coveredFraction(samples: Coordinate[], line: Coordinate[], radiusMeters: number): number {
  if (samples.length === 0) return 0
  let covered = 0
  for (const sample of samples) {
    let hit = false
    for (let i = 0; i < line.length - 1 && !hit; i += 1) {
      if (pointToSegmentMeters(sample, line[i], line[i + 1]) <= radiusMeters) hit = true
    }
    if (hit) covered += 1
  }
  return covered / samples.length
}

async function snapDistance(point: Coordinate): Promise<number | null> {
  const response = await fetch(`${GRAPHHOPPER}/nearest?profile=${encodeURIComponent(PROFILE)}&point=${point[1]},${point[0]}`)
  if (!response.ok) return null
  const body = await response.json() as { distance?: unknown }
  return typeof body.distance === "number" ? body.distance : null
}

async function routeAlong(points: Coordinate[]): Promise<{ meters: number; coordinates: Coordinate[] } | null> {
  const response = await fetch(`${GRAPHHOPPER}/route`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      profile: PROFILE,
      points: points.map((point) => [point[0], point[1]]),
      points_encoded: false,
      instructions: false
    })
  })
  if (!response.ok) return null
  const body = await response.json() as { paths?: Array<{ distance?: unknown; points?: { coordinates?: unknown } }> }
  const path = body.paths?.[0]
  if (!path || typeof path.distance !== "number") return null
  const coordinates = path.points?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  return { meters: path.distance, coordinates: coordinates as Coordinate[] }
}

function corridorMeters(geometry: Coordinate[]): number {
  let total = 0
  for (let i = 1; i < geometry.length; i += 1) total += haversine(geometry[i - 1], geometry[i])
  return total
}

async function probeCorridor(geometry: Coordinate[]): Promise<CorridorTraversalProbe> {
  const start = geometry[0]
  const end = geometry[geometry.length - 1]
  const [snapStart, snapEnd] = await Promise.all([snapDistance(start), snapDistance(end)])
  const route = await routeAlong([start, end])
  if (!route) {
    return { endpointSnapMeters: [snapStart, snapEnd], routeMeters: null, corridorCoveredByRoute: null }
  }
  const covered = coveredFraction(
    sampleLine(geometry, SAMPLE_METERS),
    route.coordinates,
    DEFAULT_TRAVERSABILITY_THRESHOLDS.matchRadiusMeters
  )
  return {
    endpointSnapMeters: [snapStart, snapEnd],
    routeMeters: route.meters,
    corridorCoveredByRoute: covered
  }
}

async function main(): Promise<void> {
  const atlas = JSON.parse(readFileSync(INPUT, "utf8")) as VerifiedAtlas
  const kept: VerifiedCorridor[] = []
  const quarantined = [...atlas.quarantined]
  const report: Array<Record<string, unknown>> = []

  for (const corridor of atlas.corridors) {
    const geometry = corridor.geometry as unknown as Coordinate[]
    const length = corridorMeters(geometry)
    const probe = await probeCorridor(geometry)
    const verdict = evaluateCorridorTraversability(length, probe)
    report.push({
      id: corridor.id,
      label: corridor.label,
      traversable: verdict.traversable,
      ...(verdict.traversable ? {} : { reason: verdict.reason, message: verdict.message }),
      metrics: verdict.metrics
    })
    if (verdict.traversable) {
      kept.push(corridor)
    } else {
      quarantined.push({
        id: corridor.id,
        label: corridor.label,
        reason: verdict.reason,
        detail: verdict.message,
        metrics: verdict.metrics
      })
    }
  }

  const output: VerifiedAtlas = {
    graphFingerprint: atlas.graphFingerprint,
    sourceFingerprint: atlas.sourceFingerprint,
    corridors: kept,
    quarantined
  }
  writeFileSync(OUT, JSON.stringify(output, null, 2))
  writeFileSync(REPORT, JSON.stringify({
    profile: PROFILE,
    graphhopper: GRAPHHOPPER,
    thresholds: DEFAULT_TRAVERSABILITY_THRESHOLDS,
    graphFingerprint: atlas.graphFingerprint,
    sourceFingerprint: atlas.sourceFingerprint,
    corridorsChecked: atlas.corridors.length,
    traversable: kept.length,
    quarantinedByTraversability: atlas.corridors.length - kept.length,
    corridors: report
  }, null, 2))

  const failures = report.filter((entry) => entry.traversable === false)
  console.log(`Traversability: ${kept.length}/${atlas.corridors.length} corridors rideable end to end`)
  for (const failure of failures) {
    console.log(`  refused ${String(failure.label)} :: ${String(failure.reason)} :: ${String(failure.message)}`)
  }
  console.log(`Wrote ${OUT} and ${REPORT}`)
  if (failures.length > 0) {
    console.log("Note: refused corridors stay out of the runtime atlas and are recorded with their evidence.")
  }
}

await main()
