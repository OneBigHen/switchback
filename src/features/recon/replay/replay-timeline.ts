import { turfBearing } from "@/lib/client/geo-math"
import type { Coordinate } from "@/lib/routing/types"
import type { ReconTrack, ReplayFrame } from "@/features/recon/types"
import { cumulativeDistancesMeters, isValidReconCoordinate } from "@/features/recon/data/recon-track"

/**
 * Deterministic playback over a Recon track.
 *
 * Recorded tracks run on their real timestamps (normalized to start at zero);
 * previews run on distance and never emit elapsed time or speed. Impossible
 * tracks fail safely with null instead of inventing data. Tracks are treated
 * as immutable, so derived timelines are memoized per track object.
 */

export interface ReplayTimeline {
  /** Normalized cumulative times (start at zero); empty for previews. */
  timesMs: number[]
  distancesMeters: number[]
  totalDurationMs: number | null
  totalDistanceMeters: number
}

const timelines = new WeakMap<ReconTrack, ReplayTimeline | null>()

export function replayTimeline(track: ReconTrack): ReplayTimeline | null {
  if (!timelines.has(track)) timelines.set(track, buildTimeline(track))
  return timelines.get(track) ?? null
}

function buildTimeline(track: ReconTrack): ReplayTimeline | null {
  const { points } = track
  if (points.length < 2 || !points.every((point) => isValidReconCoordinate(point.coordinate))) return null
  const distancesMeters = cumulativeDistancesMeters(points.map((point) => point.coordinate))
  const totalDistanceMeters = distancesMeters[distancesMeters.length - 1]!
  if (!(totalDistanceMeters > 0)) return null

  if (track.playbackKind === "preview") {
    return { timesMs: [], distancesMeters, totalDurationMs: null, totalDistanceMeters }
  }

  const start = points[0]!.recordedAt
  if (start === null) return null
  const timesMs: number[] = []
  for (const point of points) {
    if (point.recordedAt === null || !Number.isFinite(point.recordedAt)) return null
    const time = point.recordedAt - start
    if (timesMs.length > 0 && time < timesMs[timesMs.length - 1]!) return null
    timesMs.push(time)
  }
  const totalDurationMs = timesMs[timesMs.length - 1]!
  // Time says the ride was instant while geometry says it was not.
  if (totalDurationMs <= 0) return null
  return { timesMs, distancesMeters, totalDurationMs, totalDistanceMeters }
}

/** Last index whose value is <= target, clamped into [0, length - 2]. */
function segmentIndex(cumulative: readonly number[], target: number): number {
  let low = 0
  let high = cumulative.length - 2
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (cumulative[mid]! <= target) low = mid
    else high = mid - 1
  }
  return low
}

function fractionWithin(cumulative: readonly number[], index: number, target: number): number {
  const span = cumulative[index + 1]! - cumulative[index]!
  return span > 0 ? Math.min(1, Math.max(0, (target - cumulative[index]!) / span)) : 1
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpNullable(a: number | null, b: number | null, t: number): number | null {
  if (t <= 0) return a
  if (t >= 1) return b
  return a === null || b === null ? null : lerp(a, b, t)
}

function lerpCoordinate(a: Coordinate, b: Coordinate, t: number): Coordinate {
  if (t <= 0) return [a[0], a[1]]
  if (t >= 1) return [b[0], b[1]]
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
}

export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/**
 * Samples a track at normalized playback progress in [0, 1] — elapsed time
 * for recorded rides, distance for previews. Out-of-range positions clamp;
 * non-finite positions and unsampleable tracks yield null.
 */
export function sampleReplay(track: ReconTrack, position: number): ReplayFrame | null {
  if (!Number.isFinite(position)) return null
  const timeline = replayTimeline(track)
  if (!timeline) return null
  const progress = Math.min(1, Math.max(0, position))
  const recorded = track.playbackKind === "recorded"

  const axis = recorded ? timeline.timesMs : timeline.distancesMeters
  const target = progress * (recorded ? timeline.totalDurationMs! : timeline.totalDistanceMeters)
  // A stop repeats the same timestamp window; take the latest segment that
  // starts at or before the target so time never runs backwards.
  const index = segmentIndex(axis, target)
  const t = fractionWithin(axis, index, target)
  const a = track.points[index]!
  const b = track.points[index + 1]!

  return {
    progress,
    elapsedMs: recorded ? lerp(timeline.timesMs[index]!, timeline.timesMs[index + 1]!, t) : null,
    distanceMeters: lerp(timeline.distancesMeters[index]!, timeline.distancesMeters[index + 1]!, t),
    coordinate: lerpCoordinate(a.coordinate, b.coordinate, t),
    bearingDegrees: travelBearing(track, index),
    speedMph: recorded ? lerpNullable(a.speedMph, b.speedMph, t) : null,
    altitudeMeters: lerpNullable(a.altitudeMeters, b.altitudeMeters, t)
  }
}

/**
 * Playback progress at which the ride first reached `meters` along its track:
 * time-based for recorded rides, distance-based for previews. Used to map an
 * X-Ray position (distance) back onto the replay clock.
 */
export function progressAtDistance(track: ReconTrack, meters: number): number {
  const timeline = replayTimeline(track)
  if (!timeline || !Number.isFinite(meters)) return 0
  const clamped = Math.min(timeline.totalDistanceMeters, Math.max(0, meters))
  if (track.playbackKind === "preview") return clamped / timeline.totalDistanceMeters
  // First segment whose end reaches the target: stops at the same place do
  // not advance distance, so the earliest crossing is the arrival time.
  const distances = timeline.distancesMeters
  let low = 0
  let high = distances.length - 1
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (distances[mid]! < clamped) low = mid + 1
    else high = mid
  }
  const end = Math.max(1, low)
  const t = fractionWithin(distances, end - 1, clamped)
  const time = lerp(timeline.timesMs[end - 1]!, timeline.timesMs[end]!, t)
  return time / timeline.totalDurationMs!
}

/** Elapsed recorded time (ms from start) at which a timestamp falls. */
export function progressAtTimestamp(track: ReconTrack, at: number): number {
  const timeline = replayTimeline(track)
  if (!timeline || timeline.totalDurationMs === null || track.startedAt === null) return 0
  return Math.min(1, Math.max(0, (at - track.startedAt) / timeline.totalDurationMs))
}

const bearings = new WeakMap<ReconTrack, number[]>()

/**
 * Heading of travel per segment. A stop repeats coordinates, and the bearing
 * of identical points reads as north — an invented heading that would snap
 * the camera at every red light — so stops carry the previous heading, and a
 * stationary start takes the first heading that exists ahead.
 */
function travelBearing(track: ReconTrack, index: number): number {
  let resolved = bearings.get(track)
  if (!resolved) {
    resolved = resolveSegmentBearings(track.points.map((point) => point.coordinate))
    bearings.set(track, resolved)
  }
  return resolved[Math.min(index, resolved.length - 1)] ?? 0
}

export function resolveSegmentBearings(coordinates: readonly Coordinate[]): number[] {
  const raw: (number | null)[] = []
  let first: number | null = null
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const a = coordinates[index]!
    const b = coordinates[index + 1]!
    const value = a[0] === b[0] && a[1] === b[1] ? null : normalizeDegrees(turfBearing(a, b))
    const valid = value !== null && Number.isFinite(value) ? value : null
    raw.push(valid)
    if (valid !== null && first === null) first = valid
  }
  let carried = first ?? 0
  return raw.map((value) => (carried = value ?? carried))
}

// ── Display geometry ────────────────────────────────────────────────────────

/** Rendered replay vertices stay inside the 2000–4000 performance band. */
export const RECON_MAX_RENDER_VERTICES = 3000

/**
 * The render-only, decimated view of a track. Positions on it are addressed
 * by fraction of total distance, so the head drawn by deck.gl always sits on
 * the drawn trail even though decimation shortens the polyline slightly.
 */
export interface DisplayPath {
  coordinates: Coordinate[]
  distancesMeters: number[]
  totalDistanceMeters: number
}

const displayPaths = new WeakMap<ReconTrack, DisplayPath | null>()

export function displayPath(track: ReconTrack): DisplayPath | null {
  if (!displayPaths.has(track)) displayPaths.set(track, buildDisplayPath(track))
  return displayPaths.get(track) ?? null
}

function buildDisplayPath(track: ReconTrack): DisplayPath | null {
  if (!replayTimeline(track)) return null
  const source = track.points.map((point) => point.coordinate)
  const coordinates = selectVerticesByBudget(source, RECON_MAX_RENDER_VERTICES).map((index) => [...source[index]!] as Coordinate)
  const distancesMeters = cumulativeDistancesMeters(coordinates)
  return { coordinates, distancesMeters, totalDistanceMeters: distancesMeters[distancesMeters.length - 1]! }
}

/** Point at a fraction of the display path's length. */
export function pointAtFraction(path: DisplayPath, fraction: number): { coordinate: Coordinate; index: number } {
  const target = Math.min(1, Math.max(0, fraction)) * path.totalDistanceMeters
  const index = segmentIndex(path.distancesMeters, target)
  const t = fractionWithin(path.distancesMeters, index, target)
  return { coordinate: lerpCoordinate(path.coordinates[index]!, path.coordinates[index + 1]!, t), index }
}

const METERS_PER_DEGREE = 111_320

function perpendicularDistanceMeters(p: Coordinate, a: Coordinate, b: Coordinate): number {
  const lngScale = METERS_PER_DEGREE * Math.max(0.05, Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180))
  const px = p[0] * lngScale
  const py = p[1] * METERS_PER_DEGREE
  const ax = a[0] * lngScale
  const ay = a[1] * METERS_PER_DEGREE
  const dx = b[0] * lngScale - ax
  const dy = b[1] * METERS_PER_DEGREE - ay
  const length = Math.hypot(dx, dy)
  if (length === 0) return Math.hypot(px - ax, py - ay)
  return Math.abs(dy * (px - ax) - dx * (py - ay)) / length
}

/**
 * Douglas–Peucker by vertex budget: every interior vertex gets the error it
 * would introduce, then the endpoints plus the largest errors are kept. Ties
 * break toward the lower index, so the result is deterministic.
 */
export function selectVerticesByBudget(coordinates: readonly Coordinate[], maxVertices: number): number[] {
  const count = coordinates.length
  if (count <= maxVertices) return coordinates.map((_, index) => index)
  const errors = new Float64Array(count)
  const stack: Array<[number, number]> = [[0, count - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop()!
    if (end - start < 2) continue
    let bestIndex = start + 1
    let bestError = -1
    for (let index = start + 1; index < end; index += 1) {
      const error = perpendicularDistanceMeters(coordinates[index]!, coordinates[start]!, coordinates[end]!)
      if (error > bestError) {
        bestError = error
        bestIndex = index
      }
    }
    errors[bestIndex] = bestError
    stack.push([start, bestIndex], [bestIndex, end])
  }
  const interior = Array.from({ length: count - 2 }, (_, offset) => offset + 1)
  interior.sort((a, b) => errors[b]! - errors[a]! || a - b)
  return [0, ...interior.slice(0, maxVertices - 2), count - 1].sort((a, b) => a - b)
}
