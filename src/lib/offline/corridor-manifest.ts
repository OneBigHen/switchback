import type { Coordinate, PlannedRoute } from "@/lib/routing/types"

/**
 * Schema version of the persisted corridor manifest payload.
 */
export const CORRIDOR_MANIFEST_SCHEMA_VERSION = 1

export interface CorridorManifestSettings {
  /** Half-width of the corridor in meters around the route geometry. */
  corridorWidthMeters: number
  /** Hard ceiling on the number of graph segments the corridor may produce. */
  maxGraphSegments: number
  /** Hard ceiling on the estimated bytes the corridor may occupy when persisted. */
  maxEstimatedBytes: number
  /** Maximum spacing between corridored sample points along the route, in meters. */
  sampleSpacingMeters: number
}

export interface CorridorManifestSegment {
  /** Index of the originating edge in the source route geometry. */
  sourceEdgeIndex: number
  /** Centerline of this corridor segment (route-derived). */
  centerline: Coordinate[]
  /** Half-width of the corridor segment, in meters. */
  halfWidthMeters: number
}

export interface CorridorManifest {
  schemaVersion: typeof CORRIDOR_MANIFEST_SCHEMA_VERSION
  routeId: string
  routeName: string
  /** ISO timestamp at which the manifest was built. */
  builtAt: string
  settings: CorridorManifestSettings
  /** Source route's centerline (sampled down to a tractable resolution). */
  centerline: Coordinate[]
  /** Bounding box of the corridor in geographic coordinates. */
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number }
  /** Corridor segments, capped at settings.maxGraphSegments. */
  segments: CorridorManifestSegment[]
  /** Best-effort byte estimate of the serialized manifest payload. */
  estimatedBytes: number
  /** Whether the corridor was clipped to fit the configured budget. */
  truncated: boolean
}

export type CorridorManifestBuildError =
  | { kind: "invalid_route"; reason: string }
  | { kind: "invalid_width"; reason: string }
  | { kind: "invalid_geometry"; reason: string }
  | { kind: "budget_exceeded"; reason: string }

const EARTH_RADIUS_METERS = 6_371_000

function haversineMeters(a: Coordinate, b: Coordinate): number {
  const [lonA, latA] = a
  const [lonB, latB] = b
  const toRadians = (deg: number) => (deg * Math.PI) / 180
  const phiA = toRadians(latA)
  const phiB = toRadians(latB)
  const deltaPhi = toRadians(latB - latA)
  const deltaLambda = toRadians(lonB - lonA)
  const sinHalfPhi = Math.sin(deltaPhi / 2)
  const sinHalfLambda = Math.sin(deltaLambda / 2)
  const h =
    sinHalfPhi * sinHalfPhi +
    Math.cos(phiA) * Math.cos(phiB) * sinHalfLambda * sinHalfLambda
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}

function isFiniteCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  )
}

function sampleCenterline(
  geometry: Coordinate[],
  spacingMeters: number
): Coordinate[] {
  if (geometry.length === 0) return []
  if (geometry.length === 1) return [structuredClone(geometry[0])]

  const sampled: Coordinate[] = [structuredClone(geometry[0])]
  let last = geometry[0]
  let accumulated = 0
  for (let i = 1; i < geometry.length; i++) {
    const point = geometry[i]
    accumulated += haversineMeters(last, point)
    if (accumulated >= spacingMeters) {
      sampled.push(structuredClone(point))
      last = point
      accumulated = 0
    }
  }
  const finalPoint = geometry[geometry.length - 1]
  const lastSampled = sampled[sampled.length - 1]
  if (lastSampled[0] !== finalPoint[0] || lastSampled[1] !== finalPoint[1]) {
    sampled.push(structuredClone(finalPoint))
  }
  return sampled
}

function computeBounds(points: Coordinate[]): CorridorManifest["bounds"] {
  let minLon = Number.POSITIVE_INFINITY
  let minLat = Number.POSITIVE_INFINITY
  let maxLon = Number.NEGATIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  for (const point of points) {
    const [lon, lat] = point
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return { minLon, minLat, maxLon, maxLat }
}

function partitionRoutes(
  sourceGeometry: Coordinate[],
  segmentCount: number,
  halfWidthMeters: number
): CorridorManifestSegment[] {
  const totalEdges = sourceGeometry.length - 1
  if (totalEdges < 1 || segmentCount < 1) return []
  const clamped = Math.min(segmentCount, totalEdges)
  const edgesPerSegment = Math.floor(totalEdges / clamped)
  const remainder = totalEdges - edgesPerSegment * clamped

  const segments: CorridorManifestSegment[] = []
  let startEdge = 0
  for (let i = 0; i < clamped; i++) {
    let edgeCount = edgesPerSegment
    if (i === clamped - 1) edgeCount += remainder
    const endEdge = startEdge + edgeCount
    segments.push({
      sourceEdgeIndex: startEdge,
      centerline: sourceGeometry
        .slice(startEdge, endEdge + 1)
        .map((p) => structuredClone(p)),
      halfWidthMeters
    })
    startEdge = endEdge
  }
  return segments
}

function estimateBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength
}

/**
 * Build a deterministic corridor manifest from route geometry and bounded
 * settings. Returns null and an actionable error when inputs are invalid
 * or the configured graph budget cannot accommodate the route. Pure: no
 * fetches, IndexedDB, map UI, or routing-service calls.
 */
export function buildCorridorManifest(
  route: PlannedRoute,
  settings: CorridorManifestSettings,
  now: Date = new Date()
): { manifest: CorridorManifest | null; error: CorridorManifestBuildError | null } {
  if (route.previewOnly === true) {
    return {
      manifest: null,
      error: {
        kind: "invalid_route",
        reason: "preview-only routes cannot form a corridor"
      }
    }
  }
  if (!Array.isArray(route.geometry)) {
    return {
      manifest: null,
      error: {
        kind: "invalid_geometry",
        reason: "route.geometry must be an array of [lon, lat]"
      }
    }
  }
  if (route.geometry.length < 2) {
    return {
      manifest: null,
      error: {
        kind: "invalid_route",
        reason: "route geometry must contain at least two coordinates"
      }
    }
  }
  for (const coord of route.geometry) {
    if (!isFiniteCoordinate(coord)) {
      return {
        manifest: null,
        error: {
          kind: "invalid_geometry",
          reason: "all coordinates must be finite [lon, lat] tuples"
        }
      }
    }
  }
  if (
    !Number.isFinite(settings.corridorWidthMeters) ||
    settings.corridorWidthMeters <= 0
  ) {
    return {
      manifest: null,
      error: {
        kind: "invalid_width",
        reason: "corridorWidthMeters must be finite and > 0"
      }
    }
  }
  if (
    !Number.isFinite(settings.maxGraphSegments) ||
    settings.maxGraphSegments < 1
  ) {
    return {
      manifest: null,
      error: {
        kind: "invalid_width",
        reason: "maxGraphSegments must be >= 1"
      }
    }
  }
  if (
    !Number.isFinite(settings.maxEstimatedBytes) ||
    settings.maxEstimatedBytes < 1024
  ) {
    return {
      manifest: null,
      error: {
        kind: "invalid_width",
        reason: "maxEstimatedBytes must be >= 1024"
      }
    }
  }
  if (
    !Number.isFinite(settings.sampleSpacingMeters) ||
    settings.sampleSpacingMeters <= 0
  ) {
    return {
      manifest: null,
      error: {
        kind: "invalid_width",
        reason: "sampleSpacingMeters must be finite and > 0"
      }
    }
  }

  const geometry = route.geometry
  const centerline = sampleCenterline(geometry, settings.sampleSpacingMeters)
  const bounds = computeBounds(centerline)
  const builtAt = now.toISOString()
  const totalEdges = geometry.length - 1
  const desiredSegments = Math.min(settings.maxGraphSegments, totalEdges)

  let chosenSegmentCount: number | null = null
  for (let segCount = desiredSegments; segCount >= 1; segCount--) {
    const segments = partitionRoutes(
      geometry,
      segCount,
      settings.corridorWidthMeters
    )
    const basePayload: Omit<CorridorManifest, "estimatedBytes"> = {
      schemaVersion: CORRIDOR_MANIFEST_SCHEMA_VERSION,
      routeId: route.id,
      routeName: route.name,
      builtAt,
      settings: structuredClone(settings),
      centerline: structuredClone(centerline),
      bounds: structuredClone(bounds),
      segments,
      truncated: segCount < desiredSegments
    }
    const bytes = estimateBytes(basePayload)
    if (bytes <= settings.maxEstimatedBytes) {
      chosenSegmentCount = segCount
      break
    }
  }

  if (chosenSegmentCount === null) {
    return {
      manifest: null,
      error: {
        kind: "budget_exceeded",
        reason:
          "corridor manifest exceeds maxEstimatedBytes even at minimum segment count"
      }
    }
  }

  const truncated = chosenSegmentCount < desiredSegments
  const segments = partitionRoutes(
    geometry,
    chosenSegmentCount,
    settings.corridorWidthMeters
  )
  const baseManifest: Omit<CorridorManifest, "estimatedBytes"> = {
    schemaVersion: CORRIDOR_MANIFEST_SCHEMA_VERSION,
    routeId: route.id,
    routeName: route.name,
    builtAt,
    settings: structuredClone(settings),
    centerline: structuredClone(centerline),
    bounds: structuredClone(bounds),
    segments,
    truncated
  }
  const estimatedBytes = estimateBytes(baseManifest)
  const manifest: CorridorManifest = { ...baseManifest, estimatedBytes }
  return { manifest, error: null }
}
