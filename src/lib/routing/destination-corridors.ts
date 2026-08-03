import type { Coordinate } from "./types"
import { haversine } from "./scoring"
import type { CurvatureSegment } from "@/lib/curvature/repository"

/**
 * Phase 4: timeboxed destination corridors.
 *
 * The planner needs to know how much enjoyable detour time is available, then
 * propose a small set of shaping anchors inside a time-derived envelope. These
 * are pure functions so the envelope, feasibility, and anchor bounds are
 * deterministic and unit-testable without a router.
 */

export interface TimeboxBaseline {
  /** Duration of the direct requested-profile route, minutes. */
  directMinutes: number
  /** Distance of the direct route, miles. */
  directMiles: number
  /** Estimated target distance: direct miles × target ÷ direct minutes. */
  estimatedTargetDistanceMiles: number
  /** Extra ride time available beyond the direct route, minutes. */
  availableDetourMinutes: number
  /**
   * A direct route longer than 110% of the target cannot be improved by a
   * scenic detour; return the closest safe route with a warning instead.
   */
  feasible: boolean
}

export function estimateTimeboxBaseline(
  directMinutes: number,
  directMiles: number,
  targetMinutes: number
): TimeboxBaseline {
  const estimatedTargetDistanceMiles = directMinutes > 0
    ? directMiles * (targetMinutes / directMinutes)
    : 0
  return {
    directMinutes,
    directMiles,
    estimatedTargetDistanceMiles,
    availableDetourMinutes: Math.max(0, targetMinutes - directMinutes),
    feasible: directMinutes <= targetMinutes * 1.1
  }
}

export interface CorridorEnvelope {
  /**
   * Anchor path-distance sum (start→anchor + anchor→finish) may be at most
   * 105% of the estimated target distance.
   */
  maxPathDistanceMiles: number
  /**
   * Lateral deviation from the direct baseline is capped at
   * min(40 miles, max(8 miles, 35% of estimated target distance)).
   */
  maxLateralMiles: number
}

export function corridorEnvelope(estimatedTargetDistanceMiles: number): CorridorEnvelope {
  return {
    maxPathDistanceMiles: estimatedTargetDistanceMiles * 1.05,
    maxLateralMiles: Math.min(40, Math.max(8, estimatedTargetDistanceMiles * 0.35))
  }
}

/** Distance between two coordinates in miles. */
export function distanceMiles(first: Coordinate, second: Coordinate): number {
  return haversine(first, second) / 1609.344
}

/** Perpendicular distance of a point from the start→finish line, in miles. */
export function lateralDistanceMiles(
  point: Coordinate,
  start: Coordinate,
  finish: Coordinate
): number {
  const lineLength = haversine(start, finish)
  if (lineLength < 1) return distanceMiles(point, start)
  // Project onto the baseline with a local equirectangular plane.
  const toRad = Math.PI / 180
  const cosLat = Math.cos((start[1] + finish[1]) / 2 * toRad)
  const [ax, ay] = [start[0] * cosLat, start[1]]
  const [bx, by] = [finish[0] * cosLat, finish[1]]
  const [px, py] = [point[0] * cosLat, point[1]]
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return haversine([cx / cosLat, cy], point) / 1609.344
}

/**
 * Locked anchor gate: the anchor must not require an impossible path or an
 * out-of-corridor lateral swing.
 */
export function anchorWithinEnvelope(
  start: Coordinate,
  finish: Coordinate,
  anchor: Coordinate,
  envelope: CorridorEnvelope
): boolean {
  const pathSum = distanceMiles(start, anchor) + distanceMiles(anchor, finish)
  if (pathSum > envelope.maxPathDistanceMiles) return false
  const lateral = lateralDistanceMiles(anchor, start, finish)
  if (lateral > envelope.maxLateralMiles) return false
  return true
}

/**
 * Share of route distance spent losing forward progress toward the finish:
 * a segment counts as backtracking when its projection onto the start→finish
 * axis is negative. Hairpins on a climbing switchback keep net positive
 * progress, so they do not inflate this; a genuine out-and-back spur does.
 * Hard gate: more than 15% is rejected.
 */
export function backtrackingShare(geometry: Coordinate[]): number {
  if (geometry.length < 3) return 0
  const start = geometry[0]!
  const finish = geometry[geometry.length - 1]!
  const totalDistance = haversine(start, finish)
  if (totalDistance < 1) return 0
  const toRad = Math.PI / 180
  const cosLat = Math.cos((start[1] + finish[1]) / 2 * toRad)
  // Unit vector along the start→finish axis (local equirectangular plane).
  const dx = (finish[0] - start[0]) * cosLat
  const dy = finish[1] - start[1]
  const length = Math.hypot(dx, dy)

  let backtracking = 0
  let total = 0
  for (let index = 0; index < geometry.length - 1; index += 1) {
    const first = geometry[index]!
    const second = geometry[index + 1]!
    const distance = haversine(first, second)
    total += distance
    const sx = (second[0] - first[0]) * cosLat
    const sy = second[1] - first[1]
    const projection = (sx * dx + sy * dy) / length
    if (projection < 0) backtracking += distance
  }
  return total > 0 ? backtracking / total : 0
}

/**
 * Share of route distance that revisits an already-traveled corridor: sample
 * the line every ~150 m and count samples within 100 m of an earlier sample.
 * Parallel-but-distinct roads stay separate; a route that crosses or returns
 * along the same road is flagged. Hard gate: more than 20% is rejected.
 */
export function selfOverlapShare(geometry: Coordinate[]): number {
  if (geometry.length < 3) return 0
  const SAMPLE_METERS = 150
  const NEAR_METERS = 100

  const samples: Coordinate[] = []
  samples.push(geometry[0]!)
  let carry = 0
  for (let index = 0; index < geometry.length - 1; index += 1) {
    const first = geometry[index]!
    const second = geometry[index + 1]!
    const segmentDistance = haversine(first, second)
    if (segmentDistance === 0) continue
    let position = SAMPLE_METERS - carry
    while (position < segmentDistance) {
      const ratio = position / segmentDistance
      samples.push([first[0] + (second[0] - first[0]) * ratio, first[1] + (second[1] - first[1]) * ratio])
      position += SAMPLE_METERS
    }
    carry = Math.max(0, segmentDistance - (position - SAMPLE_METERS))
  }
  if (samples[samples.length - 1] !== geometry[geometry.length - 1]) {
    samples.push(geometry[geometry.length - 1]!)
  }

  let overlapping = 0
  for (let index = 1; index < samples.length; index += 1) {
    const point = samples[index]!
    let near = false
    for (let prior = 0; prior < index; prior += 1) {
      if (haversine(samples[prior]!, point) < NEAR_METERS) {
        near = true
        break
      }
    }
    if (near) overlapping += 1
  }
  return samples.length > 1 ? overlapping / (samples.length - 1) : 0
}

export interface AnchorSet {
  /** Stable identifier for the candidate. */
  id: string
  /** Rider-facing label of the corridor source. */
  label: string
  /** Shaping anchors between start and finish (endpoints excluded). */
  anchors: Coordinate[]
  /** Where the corridor came from: curvature DB, known-good GPX, research hint. */
  source: "curvature" | "gpx" | "hint"
  /** Evidence strength used by scoring (validated corridor miles). */
  evidenceMiles: number
}

export interface CorridorSourceCandidates {
  curvatureSegments: CurvatureSegment[]
  gpxRoutes: Array<{ id: string; label: string; geometry: Coordinate[] }>
  /** Phase 5 hints; empty until the adviser lands. */
  hints: Array<{ id: string; label: string; anchor: Coordinate }>
}

const MAX_ANCHOR_SETS = 4
const MAX_ANCHORS_PER_SET = 3
/** Nearby anchors are merged into one candidate within ~3 miles. */
const ANCHOR_MERGE_MILES = 3

/**
 * Rank corridor sources and merge them into at most four distinct anchor
 * sets inside the envelope. Deterministic: curvature first (by score), then
 * GPX, then hints; nearby anchors collapse into one candidate.
 */
export function buildAnchorSets(
  start: Coordinate,
  finish: Coordinate,
  envelope: CorridorEnvelope,
  sources: CorridorSourceCandidates
): AnchorSet[] {
  const candidates: AnchorSet[] = []

  const distinct = (anchor: Coordinate): boolean =>
    candidates.every((candidate) =>
      candidate.anchors.every((existing) =>
        distanceMiles(existing, anchor) > ANCHOR_MERGE_MILES
      )
    )

  // Curvature segments, best-scoring first.
  const curvature = [...sources.curvatureSegments]
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_ANCHOR_SETS * 3)
  for (const segment of curvature) {
    if (candidates.length >= MAX_ANCHOR_SETS) break
    const midpoint = segment.geometry[Math.floor((segment.geometry.length - 1) / 2)]
    if (!midpoint || !anchorWithinEnvelope(start, finish, midpoint, envelope)) continue
    if (!distinct(midpoint)) continue
    const anchors = segment.geometry
      .filter((coordinate, index) =>
        index > 0 && index < segment.geometry.length - 1 && anchorWithinEnvelope(start, finish, coordinate, envelope))
      .slice(0, MAX_ANCHORS_PER_SET)
    candidates.push({
      id: `curvature-${segment.id}`,
      label: segment.name,
      anchors: anchors.length > 0 ? anchors : [midpoint],
      source: "curvature",
      evidenceMiles: segment.geometry.length * 0.5
    })
  }

  // Known-good GPX routes: full geometry, midpoint anchor.
  for (const route of sources.gpxRoutes) {
    if (candidates.length >= MAX_ANCHOR_SETS) break
    const midpoint = route.geometry[Math.floor((route.geometry.length - 1) / 2)]
    if (!midpoint || !anchorWithinEnvelope(start, finish, midpoint, envelope)) continue
    if (!distinct(midpoint)) continue
    const span = Math.max(1, Math.floor(route.geometry.length / 3))
    const anchors = [route.geometry[span], route.geometry[span * 2]]
      .filter((coordinate): coordinate is Coordinate => Boolean(coordinate))
      .filter((coordinate) => anchorWithinEnvelope(start, finish, coordinate, envelope))
    candidates.push({
      id: `gpx-${route.id}`,
      label: route.label,
      anchors: anchors.length > 0 ? anchors : [midpoint],
      source: "gpx",
      evidenceMiles: distanceMiles(route.geometry[0]!, route.geometry[route.geometry.length - 1]!)
    })
  }

  // Validated research hints (Phase 5).
  for (const hint of sources.hints) {
    if (candidates.length >= MAX_ANCHOR_SETS) break
    if (!anchorWithinEnvelope(start, finish, hint.anchor, envelope)) continue
    if (!distinct(hint.anchor)) continue
    candidates.push({
      id: `hint-${hint.id}`,
      label: hint.label,
      anchors: [hint.anchor],
      source: "hint",
      evidenceMiles: 0
    })
  }

  return candidates
}
