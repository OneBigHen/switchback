import type { Coordinate } from "@/lib/routing/types"
import { haversine } from "@/lib/routing/scoring"
import type { GpxStreamDocument, GpxStreamPoint, GpxStreamSegment } from "@/lib/gpx/streaming-parser"

export interface NormalizedGpxWaypoint {
  lat: number
  lon: number
  label?: string
}

export interface GpxGeometryFingerprint {
  lengthMeters: number
  segmentCount: number
  start: Coordinate
  end: Coordinate
  samples: Coordinate[]
}

export interface NormalizedGpxRoute {
  id: string
  name: string
  fileName: string
  geometry: Coordinate[]
  segments: Coordinate[][]
  segmentStarts: number[]
  waypoints: NormalizedGpxWaypoint[]
  distanceMeters: number
  durationMinutes: number
  ascentMeters: number | null
  descentMeters: number | null
  dedupedPointCount: number
  gapCount: number
  invalidPointCount: number
  hasGaps: boolean
  creatorNotes: string | null
  fingerprint: GpxGeometryFingerprint
}

export interface NormalizeGpxOptions {
  id: string
  fileName: string
  maxGapMeters?: number
}

export interface SplitGpxOptions extends NormalizeGpxOptions {
  /** Distance between two consecutive tracks above which they are separate rides. */
  splitGapMeters?: number
}

interface SourceGroup {
  segments: GpxStreamSegment[]
}

const DEFAULT_MAX_GAP_METERS = 250
const FINGERPRINT_SAMPLE_COUNT = 32
/**
 * Consecutive tracks this far apart did not happen on one ride. Route-sharing
 * exports routinely pack a rider's whole collection into a single file as one
 * `<trk>` per ride; flattened together they become a single implausible route
 * whose geometry is mostly the straight-line jumps between towns.
 */
const DEFAULT_TRACK_SPLIT_METERS = 5_000

function fallbackName(fileName: string): string {
  return fileName.replace(/\.gpx$/i, "").replaceAll(/[-_]+/g, " ").trim() || "Imported ride"
}

function normalizeSegment(points: GpxStreamPoint[]): { coordinates: Coordinate[]; dedupedPointCount: number } {
  const coordinates: Coordinate[] = []
  let dedupedPointCount = 0
  for (const point of points) {
    if (!point.coordinate) continue
    const previous = coordinates.at(-1)
    if (previous && previous[0] === point.coordinate[0] && previous[1] === point.coordinate[1]) {
      dedupedPointCount += 1
      continue
    }
    coordinates.push(point.coordinate)
  }
  return { coordinates, dedupedPointCount }
}

function segmentDistance(segment: Coordinate[]): number {
  let distance = 0
  for (let index = 1; index < segment.length; index += 1) {
    distance += haversine(segment[index - 1]!, segment[index]!)
  }
  return distance
}

function elevationMetrics(groups: SourceGroup[]): { ascent: number; descent: number; hasElevation: boolean } {
  let ascent = 0
  let descent = 0
  let hasElevation = false
  for (const group of groups) {
    for (const segment of group.segments) {
      let previous: number | null = null
      for (const point of segment.points) {
        if (point.elevationMeters === null) {
          previous = null
          continue
        }
        hasElevation = true
        if (previous !== null) {
          const change = point.elevationMeters - previous
          if (change > 0) ascent += change
          else descent += Math.abs(change)
        }
        previous = point.elevationMeters
      }
    }
  }
  return { ascent, descent, hasElevation }
}

function durationMinutes(groups: SourceGroup[]): number {
  const timestamps = groups.flatMap((group) => group.segments.flatMap((segment) =>
    segment.points.flatMap((point) => point.timestampMs === null ? [] : [point.timestampMs])
  ))
  if (timestamps.length < 2) return 0
  return Number(((Math.max(...timestamps) - Math.min(...timestamps)) / 60_000).toFixed(2))
}

function countGaps(groups: SourceGroup[], maxGapMeters: number): number {
  let gapCount = 0
  for (const group of groups) {
    for (const rawSegment of group.segments) {
      const coordinates = rawSegment.points.flatMap((point) => point.coordinate ? [point.coordinate] : [])
      for (let index = 1; index < coordinates.length; index += 1) {
        if (haversine(coordinates[index - 1]!, coordinates[index]!) > maxGapMeters) gapCount += 1
      }
    }
    for (let index = 1; index < group.segments.length; index += 1) {
      const previous = group.segments[index - 1]?.points.at(-1)?.coordinate
      const current = group.segments[index]?.points[0]?.coordinate
      if (previous && current && haversine(previous, current) > maxGapMeters) gapCount += 1
    }
  }
  return gapCount
}

function samplePolyline(points: Coordinate[], sampleCount: number): Coordinate[] {
  if (points.length === 0) return []
  if (points.length === 1 || sampleCount <= 1) return [points[0]!]
  const cumulative = [0]
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1]! + haversine(points[index - 1]!, points[index]!))
  }
  const total = cumulative.at(-1)!
  if (total === 0) return Array.from({ length: sampleCount }, () => points[0]!)

  return Array.from({ length: sampleCount }, (_, index) => {
    const target = total * index / (sampleCount - 1)
    const next = cumulative.findIndex((distance) => distance >= target)
    if (next <= 0) return points[0]!
    if (next < cumulative.length && cumulative[next] === target) return points[next]!
    const left = next < 0 ? points.length - 2 : Math.min(next - 1, points.length - 2)
    const span = cumulative[left + 1]! - cumulative[left]!
    const ratio = span === 0 ? 0 : (target - cumulative[left]!) / span
    return [
      points[left]![0] + (points[left + 1]![0] - points[left]![0]) * ratio,
      points[left]![1] + (points[left + 1]![1] - points[left]![1]) * ratio
    ]
  })
}

export function createGpxGeometryFingerprint(input: {
  geometry: Coordinate[]
  segmentStarts: number[]
  distanceMeters: number
}, sampleCount = FINGERPRINT_SAMPLE_COUNT): GpxGeometryFingerprint {
  const starts = input.segmentStarts
    .filter((start) => Number.isInteger(start) && start >= 0 && start < input.geometry.length)
  const samples = starts.flatMap((start, index) => {
    const end = starts[index + 1] ?? input.geometry.length
    return samplePolyline(input.geometry.slice(start, end), sampleCount)
  })
  return {
    lengthMeters: input.distanceMeters,
    segmentCount: starts.length,
    start: input.geometry[0] ?? [0, 0],
    end: input.geometry.at(-1) ?? [0, 0],
    samples
  }
}

export function areGpxFingerprintsNear(
  left: GpxGeometryFingerprint,
  right: GpxGeometryFingerprint,
  options: {
    maxPointDistanceMeters?: number
    maxEndpointDistanceMeters?: number
    maxLengthRatio?: number
  } = {}
): boolean {
  if (left.segmentCount === 0 || left.segmentCount !== right.segmentCount) return false
  const maxLengthRatio = options.maxLengthRatio ?? 1.08
  const shorter = Math.min(left.lengthMeters, right.lengthMeters)
  const longer = Math.max(left.lengthMeters, right.lengthMeters)
  if (shorter <= 0 || longer / shorter > maxLengthRatio) return false
  const maxEndpointDistanceMeters = options.maxEndpointDistanceMeters ?? 250
  if (haversine(left.start, right.start) > maxEndpointDistanceMeters ||
    haversine(left.end, right.end) > maxEndpointDistanceMeters) return false
  if (left.samples.length !== right.samples.length || left.samples.length === 0) return false
  const maxPointDistanceMeters = options.maxPointDistanceMeters ?? 100
  return left.samples.every((point, index) => haversine(point, right.samples[index]!) <= maxPointDistanceMeters)
}

function firstCoordinate(segments: GpxStreamSegment[]): Coordinate | null {
  for (const segment of segments) {
    for (const point of segment.points) if (point.coordinate) return point.coordinate
  }
  return null
}

function lastCoordinate(segments: GpxStreamSegment[]): Coordinate | null {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const points = segments[index]?.points ?? []
    for (let pointIndex = points.length - 1; pointIndex >= 0; pointIndex -= 1) {
      const coordinate = points[pointIndex]?.coordinate
      if (coordinate) return coordinate
    }
  }
  return null
}

/**
 * Splits a document that holds several disjoint rides into one route each.
 *
 * `normalizeGpxDocument` flattens every track and route in a file into a single
 * geometry, which is right for a ride recorded across several segments and
 * wrong for a file that is really a ride *collection*. Tracks are grouped while
 * each one starts near where the previous ended; a jump beyond
 * `splitGapMeters` starts a new ride. A document that yields one group is
 * normalized exactly as before, so single-ride imports are untouched.
 */
export function splitGpxDocument(
  document: GpxStreamDocument,
  options: SplitGpxOptions
): NormalizedGpxRoute[] {
  const sources = [...document.tracks, ...document.routes]
    .filter((source) => source.segments.some((segment) => segment.points.some((point) => point.coordinate)))
  if (sources.length <= 1) return [normalizeGpxDocument(document, options)]

  const splitGapMeters = options.splitGapMeters ?? DEFAULT_TRACK_SPLIT_METERS
  const rides: (typeof sources)[] = []
  let current: typeof sources = []
  for (const source of sources) {
    const previousEnd = current.length === 0 ? null : lastCoordinate(current.at(-1)!.segments)
    const start = firstCoordinate(source.segments)
    const disjoint = previousEnd !== null && start !== null && haversine(previousEnd, start) > splitGapMeters
    if (disjoint) {
      rides.push(current)
      current = []
    }
    current.push(source)
  }
  if (current.length > 0) rides.push(current)
  if (rides.length <= 1) return [normalizeGpxDocument(document, options)]

  return rides.flatMap((ride, index) => {
    // Waypoints belong to the file, not to any one ride, so they stay with the
    // first — attaching every waypoint to every split would invent data.
    const part: GpxStreamDocument = {
      ...document,
      metadataName: ride[0]?.name ?? (document.metadataName ? `${document.metadataName} (part ${index + 1})` : null),
      tracks: ride.map((source) => ({ name: source.name, segments: source.segments })),
      routes: [],
      waypoints: index === 0 ? document.waypoints : []
    }
    try {
      return [normalizeGpxDocument(part, { ...options, id: `${options.id}--t${index + 1}` })]
    } catch {
      // A track with no usable geometry drops out rather than failing the file.
      return []
    }
  })
}

export function normalizeGpxDocument(
  document: GpxStreamDocument,
  options: NormalizeGpxOptions
): NormalizedGpxRoute {
  const groups: SourceGroup[] = [
    ...document.tracks.map((track) => ({ segments: track.segments })),
    ...document.routes.map((route) => ({ segments: route.segments }))
  ]
  const segments: Coordinate[][] = []
  let dedupedPointCount = 0
  for (const group of groups) {
    for (const rawSegment of group.segments) {
      const normalized = normalizeSegment(rawSegment.points)
      if (normalized.coordinates.length === 0) continue
      segments.push(normalized.coordinates)
      dedupedPointCount += normalized.dedupedPointCount
    }
  }
  const geometry = segments.flat()
  if (geometry.length < 2) throw new Error("The GPX document has no valid route geometry")
  const segmentStarts: number[] = []
  let geometryOffset = 0
  for (const segment of segments) {
    segmentStarts.push(geometryOffset)
    geometryOffset += segment.length
  }

  const maxGapMeters = options.maxGapMeters ?? DEFAULT_MAX_GAP_METERS
  const gapCount = countGaps(groups, maxGapMeters)
  const elevation = elevationMetrics(groups)
  const distanceMeters = segments.reduce((total, segment) => total + segmentDistance(segment), 0)
  const name = (document.metadataName || document.tracks[0]?.name || document.routes[0]?.name || fallbackName(options.fileName))
    .slice(0, 160)
  const waypoints = document.waypoints.flatMap((waypoint) => waypoint.coordinate ? [{
    lat: waypoint.coordinate[1],
    lon: waypoint.coordinate[0],
    ...(waypoint.label ? { label: waypoint.label } : {})
  }] : [])
  const fingerprint = createGpxGeometryFingerprint({ geometry, segmentStarts, distanceMeters })

  return {
    id: options.id,
    name,
    fileName: options.fileName,
    geometry,
    segments,
    segmentStarts,
    waypoints,
    distanceMeters,
    durationMinutes: durationMinutes(groups),
    ascentMeters: elevation.hasElevation ? Number(elevation.ascent.toFixed(1)) : null,
    descentMeters: elevation.hasElevation ? Number(elevation.descent.toFixed(1)) : null,
    dedupedPointCount,
    gapCount,
    invalidPointCount: document.invalidPointCount,
    hasGaps: gapCount > 0,
    creatorNotes: document.metadataDescription,
    fingerprint
  }
}
