import { turfBearing } from "@/lib/client/geo-math"
import type { Coordinate } from "@/lib/routing/types"
import type { ReconTrack, ReplayFrame } from "@/features/recon/types"
import {
  cumulativeDistancesMeters,
  isValidReconCoordinate,
} from "@/features/recon/data/recon-track"

/**
 * Deterministic replay sampling over a Recon track.
 *
 * Recorded tracks interpolate on real timestamps: position is normalized
 * timeline progress, so elapsed time starts at zero and GPU layers never
 * see absolute epoch values. Preview tracks interpolate on distance-normal
 * ized progress and never emit observed speed or elapsed time. Impossible
 * tracks (bad geometry, backwards timestamps, zero duration) fail safely
 * with null instead of inventing data. Tracks are treated as immutable;
 * the derived timeline is memoized per track object.
 */

interface ReplayTimeline {
  points: ReconTrack["points"]
  /** Normalized cumulative times (start at zero); recorded tracks only. */
  timesMs: number[]
  distancesMeters: number[]
  totalDurationMs: number | null
  totalDistanceMeters: number
}

const timelines = new WeakMap<ReconTrack, ReplayTimeline | null>()

function buildTimeline(track: ReconTrack): ReplayTimeline | null {
  const points = track.points
  if (points.length < 2) return null
  for (const point of points) {
    if (!isValidReconCoordinate(point.coordinate)) return null
  }

  const distancesMeters = cumulativeDistancesMeters(points)
  const totalDistanceMeters = distancesMeters[distancesMeters.length - 1]!

  if (track.playbackKind === "preview") {
    return { points, timesMs: [], distancesMeters, totalDurationMs: null, totalDistanceMeters }
  }

  const absoluteTimesMs: number[] = []
  for (const point of points) {
    if (point.recordedAt === null || !Number.isFinite(point.recordedAt)) return null
    absoluteTimesMs.push(point.recordedAt)
  }
  for (let index = 1; index < absoluteTimesMs.length; index += 1) {
    if (absoluteTimesMs[index]! < absoluteTimesMs[index - 1]!) return null
  }

  const timesMs = absoluteTimesMs.map((time) => time - absoluteTimesMs[0]!)
  const totalDurationMs = timesMs[timesMs.length - 1]!
  // A zero-duration recorded timeline cannot be sampled truthfully: time
  // says the ride was instant while geometry says it was not.
  if (totalDurationMs <= 0) return null

  return { points, timesMs, distancesMeters, totalDurationMs, totalDistanceMeters }
}

function timelineFor(track: ReconTrack): ReplayTimeline | null {
  if (!timelines.has(track)) timelines.set(track, buildTimeline(track))
  return timelines.get(track) ?? null
}

/** Locates the segment containing the target, with a clamped fraction. */
function bracket(cumulative: number[], target: number): { index: number; fraction: number } {
  const lastIndex = cumulative.length - 2
  for (let index = 0; index <= lastIndex; index += 1) {
    const start = cumulative[index]!
    const end = cumulative[index + 1]!
    if (target <= end || index === lastIndex) {
      const span = end - start
      const fraction = span > 0 ? (target - start) / span : 0
      return { index, fraction: Math.min(1, Math.max(0, fraction)) }
    }
  }
  return { index: Math.max(0, lastIndex), fraction: 1 }
}

function interpolateCoordinate(a: Coordinate, b: Coordinate, fraction: number): Coordinate {
  // Exact endpoints: never re-derive a recorded point through arithmetic.
  if (fraction <= 0) return [...a]
  if (fraction >= 1) return [...b]
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]
}

function interpolateScalar(
  a: number | null,
  b: number | null,
  fraction: number
): number | null {
  if (fraction <= 0) return a
  if (fraction >= 1) return b
  if (a === null || b === null) return null
  return a + (b - a) * fraction
}

/** Geometric direction of travel, normalized to [0, 360). */
function bearingDegrees(a: Coordinate, b: Coordinate): number {
  const bearing = turfBearing(a, b)
  return ((bearing % 360) + 360) % 360
}

/**
 * Samples a track at `position` — normalized timeline progress in [0, 1]
 * (elapsed time for recorded rides, distance for previews). Positions out
 * of range clamp to the ride bounds; non-finite positions and unsampleable
 * tracks yield null.
 */
export function sampleReplay(track: ReconTrack, position: number): ReplayFrame | null {
  if (!Number.isFinite(position)) return null
  const timeline = timelineFor(track)
  if (timeline === null) return null

  const progress = Math.min(1, Math.max(0, position))

  if (track.playbackKind === "recorded") {
    const target = progress * timeline.totalDurationMs!
    const { index, fraction } = bracket(timeline.timesMs, target)
    const a = timeline.points[index]!
    const b = timeline.points[index + 1]!
    const elapsedMs =
      fraction <= 0
        ? timeline.timesMs[index]!
        : fraction >= 1
          ? timeline.timesMs[index + 1]!
          : timeline.timesMs[index]! +
            (timeline.timesMs[index + 1]! - timeline.timesMs[index]!) * fraction
    return {
      progress,
      elapsedMs,
      coordinate: interpolateCoordinate(a.coordinate, b.coordinate, fraction),
      bearingDegrees: bearingDegrees(a.coordinate, b.coordinate),
      speedMph: interpolateScalar(a.speedMph, b.speedMph, fraction),
      altitudeMeters: interpolateScalar(a.altitudeMeters, b.altitudeMeters, fraction),
    }
  }

  const target = progress * timeline.totalDistanceMeters
  const { index, fraction } = bracket(timeline.distancesMeters, target)
  const a = timeline.points[index]!
  const b = timeline.points[index + 1]!
  return {
    progress,
    // Previews carry no observed time and no synthetic speed — ever.
    elapsedMs: null,
    coordinate: interpolateCoordinate(a.coordinate, b.coordinate, fraction),
    bearingDegrees: bearingDegrees(a.coordinate, b.coordinate),
    speedMph: null,
    altitudeMeters: interpolateScalar(a.altitudeMeters, b.altitudeMeters, fraction),
  }
}
