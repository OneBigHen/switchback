import { DatabaseSync } from "node:sqlite"
import {
  verifyCanonicalSegment,
  type CanonicalSegment
} from "@/lib/roads/canonical-segments"
import type { Coordinate } from "@/lib/routing/types"
import type { VerifiedGravelAtlasCorridorInput } from "./runtime-builder"
import type {
  GravelAccessEvidence,
  GravelAtlasOfficialSourceId,
  GravelStatusEvidence,
  GravelSurfaceEvidence
} from "./sources"

export type GravelAtlasQuarantineReason =
  | "no-routable-graph-match"
  | "insufficient-contiguous-match"
  | "ambiguous-graph-match"
  | "invalid-source-geometry"

export interface GravelAtlasReconciliationQuarantine {
  sourceId: GravelAtlasOfficialSourceId
  sourceFeatureId: string
  reason: GravelAtlasQuarantineReason
}

export interface GravelAtlasReconciliationOptions {
  stagingDatabasePath: string
  graphFingerprint: string
  routableSegments: readonly CanonicalSegment[]
  maxDistanceMeters?: number
  sampleSpacingMeters?: number
  minimumContinuousMeters?: number
  ambiguityDistanceDeltaMeters?: number
  maximumAmbiguousRatio?: number
}

export interface GravelAtlasReconciliationResult {
  graphFingerprint: string
  sourceFingerprint: string
  corridors: VerifiedGravelAtlasCorridorInput[]
  quarantined: GravelAtlasReconciliationQuarantine[]
}

interface StagingManifestRow {
  schema_version: number
  source_fingerprint: string
}

interface StagedObservationRow {
  source_id: string
  source_feature_id: string
  region: string
  road_name: string | null
  county: string | null
  jurisdiction: string | null
  surface_evidence: string
  access_evidence: string
  status_evidence: string
  inspected: number | null
  geometry: string
}

interface SampleInterval {
  start: Coordinate
  finish: Coordinate
  midpoint: Coordinate
  meters: number
}

interface PhysicalSegmentCandidate {
  key: string
  segment: CanonicalSegment
}

interface SegmentMatch {
  candidate: PhysicalSegmentCandidate
  distanceMeters: number
}

interface MatchedInterval extends SampleInterval {
  matched: boolean
  ambiguous: boolean
  segmentUid?: string
}

const SHA256_HEX = /^[0-9a-f]{64}$/
const DEFAULT_MAX_DISTANCE_METERS = 40
const DEFAULT_SAMPLE_SPACING_METERS = 40
const DEFAULT_MINIMUM_CONTINUOUS_METERS = 160
const DEFAULT_AMBIGUITY_DISTANCE_DELTA_METERS = 5
const DEFAULT_MAXIMUM_AMBIGUOUS_RATIO = 0.25
const GRID_CELL_DEGREES = 0.02
const EARTH_RADIUS_METERS = 6_371_000
const MIN_DIRECTION_COSINE = Math.cos(Math.PI / 4)

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

function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 &&
    typeof value[1] === "number" && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90
}

function parseGeometry(value: string): Coordinate[] | null {
  try {
    const geometry: unknown = JSON.parse(value)
    return Array.isArray(geometry) && geometry.length >= 2 && geometry.every(isCoordinate)
      ? geometry
      : null
  } catch {
    return null
  }
}

function interpolate(start: Coordinate, finish: Coordinate, ratio: number): Coordinate {
  return [
    start[0] + (finish[0] - start[0]) * ratio,
    start[1] + (finish[1] - start[1]) * ratio
  ]
}

function sampledIntervals(geometry: readonly Coordinate[], spacingMeters: number): SampleInterval[] {
  const result: SampleInterval[] = []
  for (let index = 1; index < geometry.length; index += 1) {
    const start = geometry[index - 1]!
    const finish = geometry[index]!
    const meters = haversineMeters(start, finish)
    if (meters <= 0) continue
    const parts = Math.max(1, Math.ceil(meters / spacingMeters))
    for (let part = 0; part < parts; part += 1) {
      const intervalStart = interpolate(start, finish, part / parts)
      const intervalFinish = interpolate(start, finish, (part + 1) / parts)
      result.push({
        start: intervalStart,
        finish: intervalFinish,
        midpoint: interpolate(intervalStart, intervalFinish, 0.5),
        meters: haversineMeters(intervalStart, intervalFinish)
      })
    }
  }
  return result
}

function projectedVector(origin: Coordinate, point: Coordinate): [number, number] {
  const latitudeScale = 111_320
  const longitudeScale = Math.max(1, Math.cos(radians(origin[1])) * latitudeScale)
  return [
    (point[0] - origin[0]) * longitudeScale,
    (point[1] - origin[1]) * latitudeScale
  ]
}

function pointToSegmentMatch(
  point: Coordinate,
  sourceStart: Coordinate,
  sourceFinish: Coordinate,
  candidateStart: Coordinate,
  candidateFinish: Coordinate
): { distanceMeters: number; directionCosine: number } {
  const [ax, ay] = projectedVector(point, candidateStart)
  const [bx, by] = projectedVector(point, candidateFinish)
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const position = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared))
  const distanceMeters = Math.hypot(ax + position * dx, ay + position * dy)

  const [sx, sy] = projectedVector(sourceStart, sourceFinish)
  const sourceLength = Math.hypot(sx, sy)
  const candidateLength = Math.hypot(dx, dy)
  const directionCosine = sourceLength === 0 || candidateLength === 0
    ? 0
    : Math.abs((sx * dx + sy * dy) / (sourceLength * candidateLength))
  return { distanceMeters, directionCosine }
}

function lineMatch(
  interval: SampleInterval,
  geometry: readonly Coordinate[]
): { distanceMeters: number; directionCosine: number } {
  let bestDistance = Number.POSITIVE_INFINITY
  let bestDirection = 0
  for (let index = 1; index < geometry.length; index += 1) {
    const match = pointToSegmentMatch(
      interval.midpoint,
      interval.start,
      interval.finish,
      geometry[index - 1]!,
      geometry[index]!
    )
    if (match.directionCosine < MIN_DIRECTION_COSINE) continue
    if (match.distanceMeters < bestDistance) {
      bestDistance = match.distanceMeters
      bestDirection = match.directionCosine
    }
  }
  return { distanceMeters: bestDistance, directionCosine: bestDirection }
}

function geometryBounds(geometry: readonly Coordinate[]) {
  const longitudes = geometry.map((coordinate) => coordinate[0])
  const latitudes = geometry.map((coordinate) => coordinate[1])
  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes)
  }
}

function physicalSegmentKey(segment: CanonicalSegment): string {
  const nodes = [segment.fromOsmNodeId, segment.toOsmNodeId].sort()
  return `${segment.osmWayId}|${nodes[0]}|${nodes[1]}`
}

function gridKey(x: number, y: number): string {
  return `${x}:${y}`
}

function cell(value: number): number {
  return Math.floor(value / GRID_CELL_DEGREES)
}

function buildSegmentGrid(segments: readonly CanonicalSegment[]): Map<string, PhysicalSegmentCandidate[]> {
  const representatives = new Map<string, CanonicalSegment>()
  for (const segment of segments) {
    const key = physicalSegmentKey(segment)
    const previous = representatives.get(key)
    if (!previous || segment.segmentUid.localeCompare(previous.segmentUid) < 0) representatives.set(key, segment)
  }

  const grid = new Map<string, PhysicalSegmentCandidate[]>()
  for (const [key, segment] of representatives) {
    const bounds = geometryBounds(segment.geometry)
    for (let x = cell(bounds.west); x <= cell(bounds.east); x += 1) {
      for (let y = cell(bounds.south); y <= cell(bounds.north); y += 1) {
        const bucketKey = gridKey(x, y)
        const bucket = grid.get(bucketKey) ?? []
        bucket.push({ key, segment })
        grid.set(bucketKey, bucket)
      }
    }
  }
  return grid
}

function candidateSegments(
  grid: Map<string, PhysicalSegmentCandidate[]>,
  geometry: readonly Coordinate[],
  maxDistanceMeters: number
): PhysicalSegmentCandidate[] {
  const bounds = geometryBounds(geometry)
  const meanLatitude = (bounds.south + bounds.north) / 2
  const latitudePadding = maxDistanceMeters / 111_320
  const longitudePadding = maxDistanceMeters /
    Math.max(1, Math.cos(radians(meanLatitude)) * 111_320)
  const selected = new Map<string, PhysicalSegmentCandidate>()
  for (let x = cell(bounds.west - longitudePadding); x <= cell(bounds.east + longitudePadding); x += 1) {
    for (let y = cell(bounds.south - latitudePadding); y <= cell(bounds.north + latitudePadding); y += 1) {
      for (const candidate of grid.get(gridKey(x, y)) ?? []) selected.set(candidate.key, candidate)
    }
  }
  return [...selected.values()]
}

function sourceId(value: string): GravelAtlasOfficialSourceId | null {
  return value === "pa-pasda-2012" || value === "njgin-ng911" ? value : null
}

function baseConfidence(row: StagedObservationRow): number {
  const access = row.access_evidence as GravelAccessEvidence
  const status = row.status_evidence as GravelStatusEvidence
  const surface = row.surface_evidence as GravelSurfaceEvidence
  if (row.source_id === "njgin-ng911" && access === "non-restricted" && status === "active" && surface === "unimproved") return 0.95
  if (row.source_id === "pa-pasda-2012" && surface === "unpaved") return row.inspected === 1 ? 0.88 : 0.8
  return 0.7
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function bestMatches(
  intervals: readonly SampleInterval[],
  candidates: readonly PhysicalSegmentCandidate[],
  maxDistanceMeters: number,
  ambiguityDistanceDeltaMeters: number
): MatchedInterval[] {
  return intervals.map((interval) => {
    const matches: SegmentMatch[] = candidates.flatMap((candidate) => {
      const match = lineMatch(interval, candidate.segment.geometry)
      return match.distanceMeters <= maxDistanceMeters
        ? [{ candidate, distanceMeters: match.distanceMeters }]
        : []
    }).sort((left, right) =>
      left.distanceMeters - right.distanceMeters ||
      left.candidate.segment.segmentUid.localeCompare(right.candidate.segment.segmentUid)
    )
    const best = matches[0]
    const second = matches[1]
    return {
      ...interval,
      matched: Boolean(best),
      ambiguous: Boolean(best && second && second.distanceMeters - best.distanceMeters <= ambiguityDistanceDeltaMeters),
      ...(best ? { segmentUid: best.candidate.segment.segmentUid } : {})
    }
  })
}

function longestMatchedRun(intervals: readonly MatchedInterval[]): {
  geometry: Coordinate[]
  meters: number
  segmentUids: string[]
} | null {
  let best: { geometry: Coordinate[]; meters: number; segmentUids: string[] } | null = null
  let currentGeometry: Coordinate[] = []
  let currentMeters = 0
  let currentIds = new Set<string>()

  const finishRun = () => {
    if (currentMeters > (best?.meters ?? 0) && currentGeometry.length >= 2) {
      best = {
        geometry: currentGeometry,
        meters: currentMeters,
        segmentUids: [...currentIds].sort()
      }
    }
    currentGeometry = []
    currentMeters = 0
    currentIds = new Set<string>()
  }

  for (const interval of intervals) {
    if (!interval.matched) {
      finishRun()
      continue
    }
    if (currentGeometry.length === 0) currentGeometry.push(interval.start)
    currentGeometry.push(interval.finish)
    currentMeters += interval.meters
    if (interval.segmentUid) currentIds.add(interval.segmentUid)
  }
  finishRun()
  return best
}

function stagingManifest(database: DatabaseSync): StagingManifestRow {
  const row = database.prepare(`
    select schema_version, source_fingerprint
    from gravel_source_manifest
    limit 1
  `).get() as unknown as StagingManifestRow | undefined
  if (!row || row.schema_version !== 1 || !SHA256_HEX.test(row.source_fingerprint)) {
    throw new Error("Gravel Atlas staging manifest is missing or invalid")
  }
  return row
}

/**
 * Reconcile normalized official surface evidence against the active canonical
 * motorcycle-routable graph. The source geometry is sampled densely, matched
 * only to direction-aligned graph segments, and reduced to its longest proven
 * continuous run. Unmatched or materially ambiguous observations are
 * quarantined rather than becoming routing candidates.
 */
export async function reconcileGravelAtlasSources(
  options: GravelAtlasReconciliationOptions
): Promise<GravelAtlasReconciliationResult> {
  const graphFingerprint = options.graphFingerprint.trim()
  if (!graphFingerprint) throw new Error("A routing graph fingerprint is required for Gravel Atlas reconciliation")
  const maxDistanceMeters = options.maxDistanceMeters ?? DEFAULT_MAX_DISTANCE_METERS
  const sampleSpacingMeters = options.sampleSpacingMeters ?? DEFAULT_SAMPLE_SPACING_METERS
  const minimumContinuousMeters = options.minimumContinuousMeters ?? DEFAULT_MINIMUM_CONTINUOUS_METERS
  const ambiguityDistanceDeltaMeters = options.ambiguityDistanceDeltaMeters ?? DEFAULT_AMBIGUITY_DISTANCE_DELTA_METERS
  const maximumAmbiguousRatio = options.maximumAmbiguousRatio ?? DEFAULT_MAXIMUM_AMBIGUOUS_RATIO
  if (
    !Number.isFinite(maxDistanceMeters) || maxDistanceMeters <= 0 ||
    !Number.isFinite(sampleSpacingMeters) || sampleSpacingMeters <= 0 ||
    !Number.isFinite(minimumContinuousMeters) || minimumContinuousMeters <= 0 ||
    !Number.isFinite(ambiguityDistanceDeltaMeters) || ambiguityDistanceDeltaMeters < 0 ||
    !Number.isFinite(maximumAmbiguousRatio) || maximumAmbiguousRatio < 0 || maximumAmbiguousRatio > 1
  ) throw new Error("Gravel Atlas reconciliation thresholds are invalid")

  const segmentIds = new Set<string>()
  for (const segment of options.routableSegments) {
    if (segmentIds.has(segment.segmentUid)) throw new Error(`Duplicate canonical graph segment ${segment.segmentUid}`)
    segmentIds.add(segment.segmentUid)
  }
  const verified = await Promise.all(options.routableSegments.map(verifyCanonicalSegment))
  if (verified.some((valid) => !valid)) throw new Error("Routable canonical graph contains an invalid or hash-mismatched segment")
  const grid = buildSegmentGrid(options.routableSegments)

  const database = new DatabaseSync(options.stagingDatabasePath, { readOnly: true })
  try {
    const manifest = stagingManifest(database)
    const rows = database.prepare(`
      select source_id, source_feature_id, region, road_name, county,
        jurisdiction, surface_evidence, access_evidence, status_evidence,
        inspected, geometry
      from gravel_source_observations
      order by source_id asc, source_feature_id asc
    `).all() as unknown as StagedObservationRow[]

    const corridors: VerifiedGravelAtlasCorridorInput[] = []
    const quarantined: GravelAtlasReconciliationQuarantine[] = []
    for (const row of rows) {
      const normalizedSourceId = sourceId(row.source_id)
      if (!normalizedSourceId) continue
      const geometry = parseGeometry(row.geometry)
      if (!geometry) {
        quarantined.push({ sourceId: normalizedSourceId, sourceFeatureId: row.source_feature_id, reason: "invalid-source-geometry" })
        continue
      }
      const intervals = sampledIntervals(geometry, sampleSpacingMeters)
      const candidates = candidateSegments(grid, geometry, maxDistanceMeters)
      if (intervals.length === 0 || candidates.length === 0) {
        quarantined.push({ sourceId: normalizedSourceId, sourceFeatureId: row.source_feature_id, reason: "no-routable-graph-match" })
        continue
      }
      const matched = bestMatches(intervals, candidates, maxDistanceMeters, ambiguityDistanceDeltaMeters)
      const matchedMeters = matched.reduce((sum, interval) => sum + (interval.matched ? interval.meters : 0), 0)
      if (matchedMeters === 0) {
        quarantined.push({ sourceId: normalizedSourceId, sourceFeatureId: row.source_feature_id, reason: "no-routable-graph-match" })
        continue
      }
      const ambiguousMeters = matched.reduce((sum, interval) => sum + (interval.matched && interval.ambiguous ? interval.meters : 0), 0)
      if (ambiguousMeters / matchedMeters > maximumAmbiguousRatio) {
        quarantined.push({ sourceId: normalizedSourceId, sourceFeatureId: row.source_feature_id, reason: "ambiguous-graph-match" })
        continue
      }
      const run = longestMatchedRun(matched)
      if (!run || run.meters < minimumContinuousMeters || run.segmentUids.length === 0) {
        quarantined.push({ sourceId: normalizedSourceId, sourceFeatureId: row.source_feature_id, reason: "insufficient-contiguous-match" })
        continue
      }

      const totalMeters = intervals.reduce((sum, interval) => sum + interval.meters, 0)
      const coverage = totalMeters > 0 ? run.meters / totalMeters : 0
      corridors.push({
        id: `${normalizedSourceId}:${row.source_feature_id}`,
        label: row.road_name?.trim() || `${row.region} known gravel ${row.source_feature_id}`,
        geometry: run.geometry,
        verifiedGravelMeters: run.meters,
        longestContinuousGravelMeters: run.meters,
        fragmentCount: 1,
        confidence: clamp01(baseConfidence(row) * (0.65 + 0.35 * coverage)),
        verification: "routable",
        canonicalSegmentIds: run.segmentUids,
        sourceFeatureRefs: [{ sourceId: normalizedSourceId, sourceFeatureId: row.source_feature_id }]
      })
    }

    return {
      graphFingerprint,
      sourceFingerprint: manifest.source_fingerprint,
      corridors,
      quarantined
    }
  } finally {
    database.close()
  }
}
