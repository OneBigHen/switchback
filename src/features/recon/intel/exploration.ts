import type { Coordinate } from "@/lib/routing/types"
import type { ExplorationSegment, ReconTrack } from "@/features/recon/types"
import { cumulativeDistancesMeters } from "@/features/recon/data/recon-track"

/**
 * New-to-you: track-history comparison, not road discovery.
 *
 * The ride and the rider's earlier recorded rides are resampled along their
 * own geometry; a ride sample counts as previously ridden when any earlier
 * sample lies within a conservative tolerance, regardless of direction.
 * Earlier rides are never interpolated across GPS gaps, so a signal loss can
 * not paint a straight line of "history" through country the rider never
 * rode. Copy built on this says "new to you" — never "new road".
 */

export const EXPLORATION_SAMPLE_METERS = 30
export const EXPLORATION_TOLERANCE_METERS = 50
/** Consecutive fixes further apart than this are a gap, not a road. */
export const HISTORY_GAP_METERS = 250
/** Runs shorter than this are GPS noise and merge into their neighbours. */
const MIN_RUN_METERS = 120

export interface ExplorationResult {
  segments: ExplorationSegment[]
  newToYouMeters: number
  previouslyRiddenMeters: number
  /** Earlier recorded rides this ride was compared against. */
  comparedRideCount: number
}

const METERS_PER_DEGREE = 111_320

/** Local equirectangular distance; accurate to well under a meter at 50 m. */
function nearMeters(a: Coordinate, b: Coordinate, lngScale: number): number {
  return Math.hypot((a[0] - b[0]) * lngScale, (a[1] - b[1]) * METERS_PER_DEGREE)
}

/** Samples every `step` meters along a polyline, breaking at gaps. */
export function resampleAlong(coordinates: readonly Coordinate[], step: number, gapMeters = Infinity): Coordinate[] {
  if (coordinates.length === 0) return []
  const samples: Coordinate[] = [[coordinates[0]![0], coordinates[0]![1]]]
  let carried = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    const a = coordinates[index - 1]!
    const b = coordinates[index]!
    const lngScale = METERS_PER_DEGREE * Math.cos((a[1] * Math.PI) / 180)
    const length = nearMeters(a, b, lngScale)
    if (length > gapMeters) {
      samples.push([b[0], b[1]])
      carried = 0
      continue
    }
    let next = step - carried
    while (next <= length) {
      const t = next / length
      samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      next += step
    }
    carried = length - (next - step)
  }
  const last = coordinates[coordinates.length - 1]!
  samples.push([last[0], last[1]])
  return samples
}

class HistoryIndex {
  private readonly cells = new Map<string, Coordinate[]>()
  private readonly cellLat: number
  private readonly cellLng: number
  private readonly lngScale: number

  constructor(latitude: number, private readonly tolerance: number) {
    this.lngScale = METERS_PER_DEGREE * Math.max(0.05, Math.cos((latitude * Math.PI) / 180))
    this.cellLat = tolerance / METERS_PER_DEGREE
    this.cellLng = tolerance / this.lngScale
  }

  add(coordinate: Coordinate): void {
    const key = `${Math.floor(coordinate[0] / this.cellLng)}:${Math.floor(coordinate[1] / this.cellLat)}`
    const cell = this.cells.get(key)
    if (cell) cell.push(coordinate)
    else this.cells.set(key, [coordinate])
  }

  hasNear(sample: Coordinate): boolean {
    const x = Math.floor(sample[0] / this.cellLng)
    const y = Math.floor(sample[1] / this.cellLat)
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const cell = this.cells.get(`${x + dx}:${y + dy}`)
        if (!cell) continue
        for (const point of cell) if (nearMeters(sample, point, this.lngScale) <= this.tolerance) return true
      }
    }
    return false
  }
}

/** Recorded rides that finished before `track` started, excluding itself. */
export function priorRecordedRides(track: ReconTrack, rides: readonly ReconTrack[]): ReconTrack[] {
  if (track.startedAt === null) return []
  return rides.filter(
    (ride) => ride.id !== track.id && ride.playbackKind === "recorded" && ride.endedAt !== null && ride.endedAt <= track.startedAt!
  )
}

export function classifyExploration(
  track: ReconTrack,
  history: readonly ReconTrack[],
  tolerance = EXPLORATION_TOLERANCE_METERS
): ExplorationResult {
  const coordinates = track.geometry.coordinates
  const total = track.distanceMeters
  const allNew = (): ExplorationResult => ({
    segments: total > 0 ? [{ fromMeters: 0, toMeters: total, status: "new-to-you" }] : [],
    newToYouMeters: total,
    previouslyRiddenMeters: 0,
    comparedRideCount: history.length
  })
  if (coordinates.length < 2 || !(total > 0) || history.length === 0) return allNew()

  const index = new HistoryIndex(coordinates[0]![1], tolerance)
  for (const ride of history) {
    for (const sample of resampleAlong(ride.geometry.coordinates, EXPLORATION_SAMPLE_METERS, HISTORY_GAP_METERS)) index.add(sample)
  }

  // Classify the ride at each original vertex span, resampled so long
  // straight segments are judged along their length, not just at the ends.
  const cumulative = cumulativeDistancesMeters(coordinates)
  const flags: Array<{ at: number; ridden: boolean }> = []
  for (let vertex = 1; vertex < coordinates.length; vertex += 1) {
    const a = coordinates[vertex - 1]!
    const b = coordinates[vertex]!
    const length = cumulative[vertex]! - cumulative[vertex - 1]!
    const steps = Math.max(1, Math.ceil(length / EXPLORATION_SAMPLE_METERS))
    for (let step = vertex === 1 ? 0 : 1; step <= steps; step += 1) {
      const t = step / steps
      const sample: Coordinate = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      flags.push({ at: cumulative[vertex - 1]! + length * t, ridden: index.hasNear(sample) })
    }
  }

  const segments = mergeShortRuns(toRuns(flags, total))
  let newToYouMeters = 0
  for (const segment of segments) if (segment.status === "new-to-you") newToYouMeters += segment.toMeters - segment.fromMeters
  return { segments, newToYouMeters, previouslyRiddenMeters: total - newToYouMeters, comparedRideCount: history.length }
}

function toRuns(flags: ReadonlyArray<{ at: number; ridden: boolean }>, total: number): ExplorationSegment[] {
  const runs: ExplorationSegment[] = []
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index]!
    const status = flag.ridden ? "previously-ridden" : "new-to-you"
    // Boundaries sit halfway between samples that disagree.
    const from = index === 0 ? 0 : (flags[index - 1]!.at + flag.at) / 2
    const last = runs[runs.length - 1]
    if (last && last.status === status) continue
    if (last) last.toMeters = from
    runs.push({ fromMeters: from, toMeters: total, status })
  }
  return runs
}

function mergeShortRuns(runs: ExplorationSegment[]): ExplorationSegment[] {
  if (runs.length < 3) return runs
  const merged: ExplorationSegment[] = []
  for (const run of runs) {
    const previous = merged[merged.length - 1]
    if (previous && run.toMeters - run.fromMeters < MIN_RUN_METERS && run !== runs[runs.length - 1]) {
      previous.toMeters = run.toMeters
      continue
    }
    if (previous && previous.status === run.status) {
      previous.toMeters = run.toMeters
      continue
    }
    merged.push({ ...run })
  }
  return merged
}

/** Status at a distance along the ride; null when there is no segment there. */
export function statusAt(segments: readonly ExplorationSegment[], meters: number): ExplorationSegment["status"] | null {
  for (const segment of segments) if (meters >= segment.fromMeters && meters <= segment.toMeters) return segment.status
  return null
}
