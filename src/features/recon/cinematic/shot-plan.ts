import type { Coordinate } from "@/lib/routing/types"
import { normalizeDegrees, pointAtFraction, type DisplayPath } from "@/features/recon/replay/replay-timeline"
import { blendPose, chordBearing, modeTarget, pointOffset, zoomForSpan, type CameraPose } from "@/features/recon/replay/camera-director"

/**
 * Baseline Cinematic: an authored film of one ride, built only from the
 * existing map scene (terrain, sky, the ride line) and a choreographed camera.
 *
 * The plan is a pure function of the ride — its length, shape and where it
 * gets twisty — so the same ride always gets the same film while different
 * rides get different ones. Shot vocabulary: Establish, Dive, Chase, Track,
 * Lead, Reveal, Orbit, Pull-away. Twisty stretches get more screen time;
 * straight stretches are covered quickly.
 */

export type ShotKind = "establish" | "dive" | "chase" | "track" | "lead" | "reveal" | "orbit" | "pullaway"

export interface Shot {
  kind: ShotKind
  startSeconds: number
  endSeconds: number
}

export interface CinematicPlan {
  shots: Shot[]
  totalSeconds: number
  rideStartSeconds: number
  rideEndSeconds: number
  /** Rider position (fraction of distance) at a film time. */
  fractionAt(seconds: number): number
  /** Ground meters covered per film second at a film time. */
  groundSpeedAt(seconds: number): number
  shotAt(seconds: number): Shot
  poseAt(seconds: number, viewportPx: number, reducedMotion: boolean): CameraPose
}

const ESTABLISH_SECONDS = 5
const DIVE_SECONDS = 3
const ORBIT_SECONDS = 5
const PULLAWAY_SECONDS = 4
const TRANSITION_SECONDS = 1.3
const RIDE_RECIPE: ShotKind[] = ["chase", "track", "chase", "lead", "chase", "track"]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function smooth(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

/** Deterministic small hash so each ride starts its recipe somewhere different. */
export function rideSeed(id: string): number {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export interface CinematicInput {
  id: string
  path: DisplayPath
  /** Per-bin twistiness along the ride (null = unknown, treated as calm). */
  twistiness: ReadonlyArray<number | null>
}

export function buildCinematicPlan({ id, path, twistiness }: CinematicInput): CinematicPlan {
  const miles = path.totalDistanceMeters / 1609.344
  const rideSeconds = clamp(30 + miles * 1.6, 36, 130)
  const rideStartSeconds = ESTABLISH_SECONDS + DIVE_SECONDS
  const rideEndSeconds = rideStartSeconds + rideSeconds
  const totalSeconds = rideEndSeconds + ORBIT_SECONDS + PULLAWAY_SECONDS

  // Film time spent per bin grows with curvature: hairpins linger.
  const bins = Math.max(1, twistiness.length)
  const weights = Array.from({ length: bins }, (_, index) => 1 + (twistiness[index] ?? 0) / 35)
  const cumulative = [0]
  for (const weight of weights) cumulative.push(cumulative[cumulative.length - 1]! + weight)
  const totalWeight = cumulative[cumulative.length - 1]!

  const rideFraction = (u: number): number => {
    // Eased so the rider pulls away from the start and rolls into the finish.
    const target = (0.15 * smooth(u) + 0.85 * clamp(u, 0, 1)) * totalWeight
    let bin = 0
    while (bin < bins - 1 && cumulative[bin + 1]! < target) bin += 1
    const within = (target - cumulative[bin]!) / weights[bin]!
    return clamp((bin + within) / bins, 0, 1)
  }

  const fractionAt = (seconds: number): number => {
    if (seconds <= rideStartSeconds) return 0
    if (seconds >= rideEndSeconds) return 1
    return rideFraction((seconds - rideStartSeconds) / rideSeconds)
  }

  // Ride shots: equal slices, recipe rotated by the ride's seed, with a
  // Reveal placed on the slice that holds the twistiest stretch.
  const shots: Shot[] = [
    { kind: "establish", startSeconds: 0, endSeconds: ESTABLISH_SECONDS },
    { kind: "dive", startSeconds: ESTABLISH_SECONDS, endSeconds: rideStartSeconds }
  ]
  const sliceCount = clamp(Math.round(rideSeconds / 10), 3, 12)
  const sliceSeconds = rideSeconds / sliceCount
  const twistiestBin = twistiness.reduce<number>((best, value, index) => ((value ?? -1) > (twistiness[best] ?? -1) ? index : best), 0)
  const hasTwist = (twistiness[twistiestBin] ?? 0) >= 22
  const seed = rideSeed(id)
  let revealSlice = -1
  if (hasTwist) {
    let closest = Infinity
    for (let slice = 0; slice < sliceCount; slice += 1) {
      const mid = fractionAt(rideStartSeconds + (slice + 0.5) * sliceSeconds)
      const distance = Math.abs(mid - twistiestBin / bins)
      if (distance < closest) {
        closest = distance
        revealSlice = slice
      }
    }
  }
  for (let slice = 0; slice < sliceCount; slice += 1) {
    const kind = slice === revealSlice ? "reveal" : slice === 0 ? "chase" : RIDE_RECIPE[(seed + slice) % RIDE_RECIPE.length]!
    shots.push({ kind, startSeconds: rideStartSeconds + slice * sliceSeconds, endSeconds: rideStartSeconds + (slice + 1) * sliceSeconds })
  }
  shots.push({ kind: "orbit", startSeconds: rideEndSeconds, endSeconds: rideEndSeconds + ORBIT_SECONDS })
  shots.push({ kind: "pullaway", startSeconds: rideEndSeconds + ORBIT_SECONDS, endSeconds: totalSeconds })

  const shotAt = (seconds: number): Shot => shots.find((shot) => seconds < shot.endSeconds) ?? shots[shots.length - 1]!

  const groundSpeedAt = (seconds: number): number => {
    const delta = 0.25
    return (Math.abs(fractionAt(seconds + delta) - fractionAt(seconds - delta)) / (2 * delta)) * path.totalDistanceMeters
  }

  const whole = wholeRideFrame(path)

  const shotPose = (shot: Shot, seconds: number, viewportPx: number, reducedMotion: boolean): CameraPose => {
    const u = clamp((seconds - shot.startSeconds) / Math.max(0.001, shot.endSeconds - shot.startSeconds), 0, 1)
    const fraction = fractionAt(seconds)
    const speed = groundSpeedAt(seconds)
    const rider = pointAtFraction(path, fraction).coordinate
    const travel = chordBearing(path, fraction, 120, 480) ?? whole.bearing
    const drift = reducedMotion ? 0 : 1
    switch (shot.kind) {
      case "establish":
        return {
          center: whole.center,
          bearing: normalizeDegrees(whole.bearing - 25 + 30 * u * drift),
          pitch: 38 + 14 * u * drift,
          zoom: zoomForSpan(whole.spanMeters * 1.25, whole.center[1], viewportPx) + 0.25 * u * drift
        }
      case "dive":
        // Land exactly where the first riding shot will frame the road.
        return { ...modeTarget("chase", { path, fraction, groundSpeedMps: groundSpeedAt(rideStartSeconds + 1) }, viewportPx, 0, travel), pitch: 66 }
      case "chase":
        return modeTarget("chase", { path, fraction, groundSpeedMps: speed }, viewportPx, 0, travel)
      case "lead":
        return modeTarget("lead", { path, fraction, groundSpeedMps: speed }, viewportPx, 0, travel)
      case "track": {
        // Side-on dolly: the camera runs alongside, looking across the road.
        const span = clamp(speed * 6, 900, 4_000)
        return {
          center: pointOffset(path, fraction, span * 0.12),
          bearing: normalizeDegrees(travel + 78 - 18 * u * drift),
          pitch: 62,
          zoom: zoomForSpan(span, rider[1], viewportPx)
        }
      }
      case "reveal": {
        // Rise and pull back to show the twisty road unfolding ahead.
        const span = 1_200 + 5_500 * smooth(u) * drift
        return {
          center: pointOffset(path, fraction, span * 0.3),
          bearing: travel,
          pitch: 66 - 16 * smooth(u) * drift,
          zoom: zoomForSpan(span, rider[1], viewportPx)
        }
      }
      case "orbit": {
        const end = path.coordinates[path.coordinates.length - 1]!
        return {
          center: end,
          bearing: normalizeDegrees(travel + 30 + 70 * u * drift),
          pitch: 60,
          zoom: zoomForSpan(1_600, end[1], viewportPx)
        }
      }
      case "pullaway":
        return {
          center: whole.center,
          bearing: normalizeDegrees(whole.bearing + 10),
          pitch: 50 - 14 * smooth(u) * drift,
          zoom: zoomForSpan(whole.spanMeters * (1.1 + 0.4 * smooth(u) * drift), whole.center[1], viewportPx)
        }
    }
  }

  const poseAt = (seconds: number, viewportPx: number, reducedMotion: boolean): CameraPose => {
    const index = shots.indexOf(shotAt(seconds))
    const current = shotPose(shots[index]!, seconds, viewportPx, reducedMotion)
    const sinceCut = seconds - shots[index]!.startSeconds
    // Reduced motion cuts between shots instead of flying.
    if (reducedMotion || index === 0 || sinceCut >= TRANSITION_SECONDS) return current
    const previous = shotPose(shots[index - 1]!, seconds, viewportPx, reducedMotion)
    return blendPose(previous, current, smooth(sinceCut / TRANSITION_SECONDS))
  }

  return { shots, totalSeconds, rideStartSeconds, rideEndSeconds, fractionAt, groundSpeedAt, shotAt, poseAt }
}

function wholeRideFrame(path: DisplayPath): { center: Coordinate; spanMeters: number; bearing: number } {
  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const [lng, lat] of path.coordinates) {
    west = Math.min(west, lng)
    east = Math.max(east, lng)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  const center: Coordinate = [(west + east) / 2, (south + north) / 2]
  const widthMeters = (east - west) * 111_320 * Math.cos((center[1] * Math.PI) / 180)
  const heightMeters = (north - south) * 111_320
  const start = path.coordinates[0]!
  const middle = pointAtFraction(path, 0.5).coordinate
  const bearing = start[0] === middle[0] && start[1] === middle[1] ? 0 : normalizeDegrees((Math.atan2(middle[0] - start[0], middle[1] - start[1]) * 180) / Math.PI)
  return { center, spanMeters: Math.max(1_500, widthMeters, heightMeters), bearing }
}
