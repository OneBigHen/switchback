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
  /** Distance between consecutive points above which they are separate rides. */
  splitGapMeters?: number
  /** Pieces shorter than this are import debris, not rides. */
  minimumRideMeters?: number
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
/** Shorter than this, a separated piece is a stray fragment rather than a ride. */
const DEFAULT_MINIMUM_RIDE_METERS = 1_609
/**
 * Beyond this many separate rides, the file is a catalogue of roads rather than
 * a record of riding them. Splitting those into hundreds of near-identical
 * posters would bury the real rides, so they are rejected with a reason and
 * kept for review instead.
 */
const MAX_RIDES_PER_FILE = 12
/**
 * A break has to be anomalous for its own file, not just far in absolute terms:
 * planned routes list junctions kilometres apart, recorded traces list points
 * metres apart.
 */
const SPARSE_SPACING_MULTIPLE = 20

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
  const splitGapMeters = options.splitGapMeters ?? DEFAULT_TRACK_SPLIT_METERS
  const minimumRideMeters = options.minimumRideMeters ?? DEFAULT_MINIMUM_RIDE_METERS
  const sources = [...document.tracks, ...document.routes]

  // Walk every point in document order and cut wherever the next one is too far
  // to have been ridden to. The jumps that matter are not only between tracks:
  // the worst file in the current library is a single <trkseg> holding 226
  // disconnected roads, with a 299 km hop in the middle of it.
  // A planned <rte> is sparse by design — its points are junctions, kilometres
  // apart — so a fixed distance threshold would shred one into fragments. Scale
  // the cut against the file's own median point spacing: on a dense GPS trace a
  // 5 km hop is hundreds of times the norm, on a sparse planned route it is
  // ordinary, and only an anomaly for that file counts as a break.
  const spacings: number[] = []
  let spacingPrevious: Coordinate | null = null
  for (const source of sources) {
    for (const segment of source.segments) {
      for (const point of segment.points) {
        if (!point.coordinate) continue
        if (spacingPrevious) spacings.push(haversine(spacingPrevious, point.coordinate))
        spacingPrevious = point.coordinate
      }
    }
  }
  if (spacings.length === 0) return [normalizeGpxDocument(document, options)]
  const medianSpacing = spacings.toSorted((a, b) => a - b)[Math.floor(spacings.length / 2)] ?? 0
  const breakMeters = Math.max(splitGapMeters, medianSpacing * SPARSE_SPACING_MULTIPLE)

  const runs: { name: string | null; points: GpxStreamPoint[] }[] = []
  let run: GpxStreamPoint[] = []
  let previous: Coordinate | null = null
  let runName: string | null = null
  const closeRun = () => {
    if (run.length > 0) runs.push({ name: runName, points: run })
    run = []
  }
  for (const source of sources) {
    for (const segment of source.segments) {
      for (const point of segment.points) {
        if (!point.coordinate) continue
        if (previous !== null && haversine(previous, point.coordinate) > breakMeters) {
          closeRun()
          runName = source.name
        }
        if (run.length === 0) runName = runName ?? source.name
        run.push(point)
        previous = point.coordinate
      }
    }
  }
  closeRun()

  if (runs.length <= 1) return [normalizeGpxDocument(document, options)]

  const rides = runs.filter((candidate) => runDistance(candidate.points) >= minimumRideMeters)
  if (rides.length === 0) {
    // The floor exists to drop debris sitting beside a real ride, not to
    // discard a genuinely short file — several exports are a mile or two of
    // geometry split across two segments. Only fragment soup is rejected.
    if (runs.length > MAX_RIDES_PER_FILE) {
      throw new Error(`The GPX document is a road collection, not a ride: ${runs.length} disconnected pieces`)
    }
    return [normalizeGpxDocument(document, options)]
  }
  if (rides.length === 1) {
    // One real ride plus stray fragments: keep the ride under the file's own id.
    return [normalizeGpxDocument(documentForRun(document, rides[0]!, document.waypoints), options)]
  }
  if (rides.length > MAX_RIDES_PER_FILE) {
    throw new Error(`The GPX document is a road collection, not a ride: ${rides.length} disconnected pieces over ${Math.round(minimumRideMeters / 1609.344)} mi`)
  }

  return rides.flatMap((ride, index) => {
    try {
      // Waypoints belong to the file, not to any one ride, so they stay with
      // the first — attaching every waypoint to every split would invent data.
      const part = documentForRun(document, ride, index === 0 ? document.waypoints : [])
      return [normalizeGpxDocument(part, { ...options, id: `${options.id}--t${index + 1}` })]
    } catch {
      return []
    }
  })
}

function runDistance(points: GpxStreamPoint[]): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]?.coordinate
    const current = points[index]?.coordinate
    if (previous && current) total += haversine(previous, current)
  }
  return total
}

function documentForRun(
  document: GpxStreamDocument,
  run: { name: string | null; points: GpxStreamPoint[] },
  waypoints: GpxStreamDocument["waypoints"]
): GpxStreamDocument {
  return {
    ...document,
    metadataName: run.name ?? document.metadataName,
    tracks: [{ name: run.name, segments: [{ points: run.points }] }],
    routes: [],
    waypoints
  }
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
