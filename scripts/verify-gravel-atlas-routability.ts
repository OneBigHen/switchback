/**
 * Verify that every retained atlas corridor can actually be ridden end to end
 * in the built GraphHopper graph, and quarantine the ones that cannot.
 *
 * The canonical exporter proves corridor membership per OSM segment. This step
 * asks the running router the question that per-segment proof cannot answer:
 * "route me from this corridor's start to its end" and then measures, with an
 * implementation independent of the app's evidence code, whether the returned
 * route remains close, directionally aligned and substantially contiguous with
 * the corridor without taking an implausible detour.
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
import { createGraphHopperProbe } from "../src/lib/roads/gravel-atlas/router-probe"
import {
  DEFAULT_TRAVERSABILITY_THRESHOLDS,
  GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION,
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
  traversabilityPolicyVersion?: number
  corridors: VerifiedCorridor[]
  quarantined: Array<Record<string, unknown>>
}

interface CoverageMetrics {
  coveredFraction: number
  longestContinuousCoveredFraction: number
  directionAgreementFraction: number
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
const MAX_DIRECTION_DIFFERENCE_DEGREES = 35
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
  let distanceToNext = stepMeters
  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const start = coordinates[i], end = coordinates[i + 1]
    const span = haversine(start, end)
    if (span <= 0) continue
    let travelled = distanceToNext
    while (travelled <= span) {
      const t = travelled / span
      samples.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t] as unknown as Coordinate)
      travelled += stepMeters
    }
    distanceToNext = travelled - span
  }
  const last = coordinates[coordinates.length - 1]
  const sampledLast = samples[samples.length - 1]
  if (haversine(sampledLast, last) > 0.5) samples.push(last)
  return samples
}

function directionsAlign(
  firstStart: Coordinate,
  firstEnd: Coordinate,
  secondStart: Coordinate,
  secondEnd: Coordinate
): boolean {
  const referenceLatitude = (firstStart[1] + firstEnd[1] + secondStart[1] + secondEnd[1]) / 4
  const lonScale = Math.cos(radians(referenceLatitude))
  const firstX = (firstEnd[0] - firstStart[0]) * lonScale
  const firstY = firstEnd[1] - firstStart[1]
  const secondX = (secondEnd[0] - secondStart[0]) * lonScale
  const secondY = secondEnd[1] - secondStart[1]
  const denominator = Math.hypot(firstX, firstY) * Math.hypot(secondX, secondY)
  if (denominator === 0) return false
  const cosine = Math.min(1, Math.abs((firstX * secondX + firstY * secondY) / denominator))
  return Math.acos(cosine) * 180 / Math.PI <= MAX_DIRECTION_DIFFERENCE_DEGREES
}

function localSampleDirection(samples: Coordinate[], index: number): readonly [Coordinate, Coordinate] | null {
  if (samples.length < 2) return null
  if (index === 0) return [samples[0], samples[1]]
  if (index === samples.length - 1) return [samples[index - 1], samples[index]]
  return [samples[index - 1], samples[index + 1]]
}

function coverageMetrics(samples: Coordinate[], line: Coordinate[], radiusMeters: number): CoverageMetrics {
  if (samples.length === 0 || line.length < 2) {
    return { coveredFraction: 0, longestContinuousCoveredFraction: 0, directionAgreementFraction: 0 }
  }
  let proximityHits = 0
  let alignedHits = 0
  let currentRun = 0
  let longestRun = 0

  samples.forEach((sample, sampleIndex) => {
    const direction = localSampleDirection(samples, sampleIndex)
    let near = false
    let aligned = false
    for (let i = 0; i < line.length - 1; i += 1) {
      const routeStart = line[i], routeEnd = line[i + 1]
      if (pointToSegmentMeters(sample, routeStart, routeEnd) > radiusMeters) continue
      near = true
      if (direction && directionsAlign(direction[0], direction[1], routeStart, routeEnd)) {
        aligned = true
        break
      }
    }
    if (near) proximityHits += 1
    if (near && aligned) {
      alignedHits += 1
      currentRun += 1
      longestRun = Math.max(longestRun, currentRun)
    } else {
      currentRun = 0
    }
  })

  return {
    coveredFraction: alignedHits / samples.length,
    longestContinuousCoveredFraction: longestRun / samples.length,
    directionAgreementFraction: proximityHits === 0 ? 0 : alignedHits / proximityHits
  }
}

// Router 429/5xx, timeouts and dropped connections throw and abort the run
// before any output is written; only a real GraphHopper answer (including a
// 400 "no connection") may mark a corridor non-traversable.
const probe = createGraphHopperProbe({ baseUrl: GRAPHHOPPER, profile: PROFILE })
const snapDistance = (point: Coordinate) => probe.snapDistance(point as unknown as [number, number])
const routeAlong = async (points: Coordinate[]) => {
  const route = await probe.routeAlong(points as unknown as Array<[number, number]>)
  return route ? { meters: route.meters, coordinates: route.coordinates as unknown as Coordinate[] } : null
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
    return {
      endpointSnapMeters: [snapStart, snapEnd],
      routeMeters: null,
      corridorCoveredByRoute: null,
      longestContinuousCoveredFraction: null,
      directionAgreementFraction: null
    }
  }
  const coverage = coverageMetrics(
    sampleLine(geometry, SAMPLE_METERS),
    route.coordinates,
    DEFAULT_TRAVERSABILITY_THRESHOLDS.matchRadiusMeters
  )
  return {
    endpointSnapMeters: [snapStart, snapEnd],
    routeMeters: route.meters,
    corridorCoveredByRoute: coverage.coveredFraction,
    longestContinuousCoveredFraction: coverage.longestContinuousCoveredFraction,
    directionAgreementFraction: coverage.directionAgreementFraction
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
    traversabilityPolicyVersion: GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION,
    corridors: kept,
    quarantined
  }
  writeFileSync(OUT, JSON.stringify(output, null, 2))
  writeFileSync(REPORT, JSON.stringify({
    profile: PROFILE,
    graphhopper: GRAPHHOPPER,
    traversabilityPolicyVersion: GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION,
    thresholds: DEFAULT_TRAVERSABILITY_THRESHOLDS,
    graphFingerprint: atlas.graphFingerprint,
    sourceFingerprint: atlas.sourceFingerprint,
    corridorsChecked: atlas.corridors.length,
    traversable: kept.length,
    quarantinedByTraversability: atlas.corridors.length - kept.length,
    corridors: report
  }, null, 2))

  const failures = report.filter((entry) => entry.traversable === false)
  console.log(`Traversability policy v${GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION}: ${kept.length}/${atlas.corridors.length} corridors rideable end to end`)
  for (const failure of failures) {
    console.log(`  refused ${String(failure.label)} :: ${String(failure.reason)} :: ${String(failure.message)}`)
  }
  console.log(`Wrote ${OUT} and ${REPORT}`)
  if (failures.length > 0) {
    console.log("Note: refused corridors stay out of the runtime atlas and are recorded with their evidence.")
  }
}

await main()