import type { NavigationStatus } from "./navigation-engine"
import { turfBearing, turfPointAlong } from "./geo-math"
import type { Coordinate } from "@/lib/routing/types"

/**
 * Pure camera mathematics for the ride follow camera.
 *
 * Everything here is a plain function of the current navigation frame: no map,
 * no refs, no React. The controller owns the imperative side and calls into
 * this module, which keeps the parts that decide *where the camera should be*
 * cheap to test and impossible to make frame-rate dependent.
 */

/** Metres per second at the boundaries the product brief describes in mph. */
const MPS_15_MPH = 6.7
const MPS_35_MPH = 15.6
const MPS_55_MPH = 24.6
const MPS_80_MPH = 35.8

/** A rider is stationary enough that GPS course is noise, not direction. */
export const HEADING_NOISE_SPEED_MPS = 1.8

/**
 * How far off the route a fix can be while its matched tangent still describes
 * the road the rider is actually on. Beyond this the match is a projection
 * onto a road they may have left, so the camera stops believing it.
 */
export const MAX_TRUSTED_MATCH_DISTANCE_METERS = 30

export interface FollowCameraInputs {
  status: NavigationStatus
  /** Null when the fix carries no speed; treated as stationary. */
  speedMetersPerSecond: number | null
  /** Device course over ground. Null when unavailable. */
  headingDegrees: number | null
  accuracyMeters: number
  /** Bearing of the matched route segment, when route matching is trusted. */
  routeBearingDegrees?: number | null
  distanceToManeuverMeters: number
  /** GraphHopper turn sign; magnitude 3 is a sharp turn. */
  maneuverSign: number | null
  distanceFromRouteMeters: number
  /** The engine's own verdict that the match could be one of several roads. */
  matchAmbiguous: boolean
  /** The bearing the camera is already using, for smoothing and fallback. */
  previousBearingDegrees: number | null
}

export interface FollowCameraTarget {
  bearingDegrees: number
  pitchDegrees: number
  zoom: number
  lookaheadMeters: number
}

export function normalizeBearing(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0
  return ((degrees % 360) + 360) % 360
}

/**
 * The signed shortest rotation from one bearing to another, in (-180, 180].
 * This is what keeps 359° → 1° a 2° turn to the right rather than a 358°
 * spin to the left.
 */
export function shortestBearingDelta(from: number, to: number): number {
  const delta = ((normalizeBearing(to) - normalizeBearing(from) + 540) % 360) - 180
  // A delta of exactly -180 is the same rotation as +180; prefer the positive
  // form so the result stays in (-180, 180].
  return delta === -180 ? 180 : delta
}

/**
 * Circular interpolation between two bearings. `factor` is how far to move
 * toward the target, so 0 holds and 1 snaps.
 */
export function smoothBearing(from: number | null, to: number, factor: number): number {
  if (from === null || !Number.isFinite(from)) return normalizeBearing(to)
  const clamped = Math.max(0, Math.min(1, factor))
  return normalizeBearing(from + shortestBearingDelta(from, to) * clamped)
}

/**
 * Whether the matched route tangent describes the road the rider is on.
 *
 * A match is only as good as the fix behind it: an ambiguous match, a fix well
 * away from the route, or a status that means the engine has stopped tracking
 * all describe a tangent that points along a road the rider may already have
 * left. The camera must not keep steering by it. Note that the engine reuses
 * the previous frame's route fields on a weak-signal fix, so a stale tangent
 * is a real possibility rather than a theoretical one.
 */
export function isRouteMatchTrusted(inputs: FollowCameraInputs): boolean {
  if (inputs.status !== "navigating" && inputs.status !== "deviating") return false
  if (inputs.matchAmbiguous) return false
  return inputs.distanceFromRouteMeters <= MAX_TRUSTED_MATCH_DISTANCE_METERS
}

/**
 * Direction priority: a trustworthy matched route tangent first, because it is
 * where the road goes rather than where the last fix happened to point; then
 * the device's own course; and finally the bearing the camera already had, so
 * a stationary rider never spins on noise.
 */
export function resolveFollowBearing(inputs: FollowCameraInputs): number | null {
  if (
    isRouteMatchTrusted(inputs)
    && typeof inputs.routeBearingDegrees === "number"
    && Number.isFinite(inputs.routeBearingDegrees)
  ) {
    return normalizeBearing(inputs.routeBearingDegrees)
  }
  const speed = inputs.speedMetersPerSecond ?? 0
  if (inputs.headingDegrees !== null && Number.isFinite(inputs.headingDegrees) && speed >= HEADING_NOISE_SPEED_MPS) {
    return normalizeBearing(inputs.headingDegrees)
  }
  return inputs.previousBearingDegrees === null ? null : normalizeBearing(inputs.previousBearingDegrees)
}

function interpolate(value: number, points: readonly (readonly [number, number])[]): number {
  const first = points[0]!
  if (value <= first[0]) return first[1]
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index]!
    const [x0, y0] = points[index - 1]!
    if (value <= x1) return y0 + (y1 - y0) * ((value - x0) / (x1 - x0))
  }
  return points[points.length - 1]![1]
}

/**
 * How far ahead of the rider the camera looks. Faster riding needs more road
 * in front; a turn that is nearly here needs the turn itself in frame, so the
 * look-ahead collapses toward the maneuver rather than overshooting past it.
 */
export function lookaheadMeters(inputs: FollowCameraInputs): number {
  const speed = Math.max(0, inputs.speedMetersPerSecond ?? 0)
  const base = interpolate(speed, [
    [0, 40],
    [MPS_15_MPH, 80],
    [MPS_35_MPH, 160],
    [MPS_55_MPH, 300],
    [MPS_80_MPH, 450]
  ])
  const distance = inputs.distanceToManeuverMeters
  if (!Number.isFinite(distance) || distance <= 0) return base
  // Keep the maneuver inside the frame once it is closer than the look-ahead,
  // and give a sharp turn more room than a gentle one.
  const severity = Math.abs(inputs.maneuverSign ?? 0) >= 3 ? 0.7 : 0.85
  return Math.max(40, Math.min(base, distance * severity))
}

/**
 * Zoom follows speed, then gives way to whatever the rider needs to see:
 * an imminent turn's geometry, or the wider context when the camera can no
 * longer be trusted to be pointing at the right thing.
 */
export function followZoom(inputs: FollowCameraInputs): number {
  const speed = Math.max(0, inputs.speedMetersPerSecond ?? 0)
  let zoom = interpolate(speed, [
    [0, 16.8],
    [MPS_15_MPH, 16.2],
    [MPS_35_MPH, 15.6],
    [MPS_55_MPH, 15.0],
    [MPS_80_MPH, 14.4]
  ])
  const sharp = Math.abs(inputs.maneuverSign ?? 0) >= 2
  if (sharp && inputs.distanceToManeuverMeters > 0 && inputs.distanceToManeuverMeters < 180) {
    // Close enough to matter: reveal the intersection rather than the region.
    zoom += 0.6
  }
  if (inputs.status === "off-route") zoom -= 1.2
  else if (inputs.status === "uncertain" || inputs.status === "weak-signal") zoom -= 0.8
  else if (inputs.status === "deviating") zoom -= 0.4
  if (inputs.accuracyMeters > 40) zoom -= 0.4
  if (inputs.status === "arrived") zoom = Math.min(zoom, 16.4)
  // Pull back further the further off-route the rider actually is.
  if (inputs.distanceFromRouteMeters > 150) zoom -= 0.6
  return Math.max(12.5, Math.min(17.5, zoom))
}

/**
 * Pitch is readability, not cinema. A confident cruise earns the tilt; doubt
 * flattens the map so the rider can see where they actually are.
 */
export function followPitch(inputs: FollowCameraInputs): number {
  switch (inputs.status) {
    case "arrived": return 20
    case "off-route": return 28
    case "uncertain":
    case "weak-signal": return 30
    case "deviating": return 42
    default: break
  }
  if (inputs.accuracyMeters > 40) return 35
  const sharp = Math.abs(inputs.maneuverSign ?? 0) >= 2
  if (sharp && inputs.distanceToManeuverMeters > 0 && inputs.distanceToManeuverMeters < 150) {
    // Flatten slightly into a turn so the road past the corner stays visible.
    return 46
  }
  return 55
}

export function resolveFollowCameraTarget(inputs: FollowCameraInputs): FollowCameraTarget {
  const bearing = resolveFollowBearing(inputs)
  return {
    bearingDegrees: bearing ?? normalizeBearing(inputs.previousBearingDegrees ?? 0),
    pitchDegrees: followPitch(inputs),
    zoom: followZoom(inputs),
    lookaheadMeters: lookaheadMeters(inputs)
  }
}

export interface CameraDeadband {
  bearingDegrees: number
  pitchDegrees: number
  zoom: number
  centerMeters: number
}

/**
 * Below these thresholds a camera update is invisible, and every camera move
 * costs a `moveend` — which is what drives the viewport-scoped map layer
 * fetches. A camera that updates on noise starves the layers it is meant to
 * be flying over.
 */
export const DEFAULT_CAMERA_DEADBAND: CameraDeadband = {
  bearingDegrees: 0.75,
  pitchDegrees: 0.75,
  zoom: 0.05,
  centerMeters: 2
}

export interface CameraState {
  bearingDegrees: number
  pitchDegrees: number
  zoom: number
  centerDistanceMeters: number
}

export function cameraUpdateExceedsDeadband(
  previous: CameraState | null,
  next: CameraState,
  deadband: CameraDeadband = DEFAULT_CAMERA_DEADBAND
): boolean {
  if (!previous) return true
  if (Math.abs(shortestBearingDelta(previous.bearingDegrees, next.bearingDegrees)) >= deadband.bearingDegrees) return true
  if (Math.abs(next.pitchDegrees - previous.pitchDegrees) >= deadband.pitchDegrees) return true
  if (Math.abs(next.zoom - previous.zoom) >= deadband.zoom) return true
  return next.centerDistanceMeters >= deadband.centerMeters
}

/**
 * The point on the route the camera should be aiming at: `lookaheadMeters`
 * further along than the rider's matched position. Returns null when the
 * route cannot supply one, so the caller can fall back to the rider.
 */
export function routeLookaheadCoordinate(
  geometry: readonly Coordinate[],
  matchedDistanceMeters: number,
  lookahead: number
): Coordinate | null {
  if (geometry.length < 2) return null
  const target = Math.max(0, matchedDistanceMeters) + Math.max(0, lookahead)
  return turfPointAlong(geometry as Coordinate[], target)
}

/**
 * The direction the road is heading at a point along it, measured over a
 * short span so a single noisy vertex cannot swing the camera. Normalized to
 * the compass convention the navigation engine uses, not turf's signed range.
 */
export function routeTangentBearing(
  geometry: readonly Coordinate[],
  distanceMeters: number,
  spanMeters = 25
): number | null {
  if (geometry.length < 2) return null
  const behind = turfPointAlong(geometry as Coordinate[], Math.max(0, distanceMeters - spanMeters))
  const ahead = turfPointAlong(geometry as Coordinate[], Math.max(0, distanceMeters) + spanMeters)
  if (!behind || !ahead) return null
  if (behind[0] === ahead[0] && behind[1] === ahead[1]) return null
  return normalizeBearing(turfBearing(behind, ahead))
}
