import type { BikeProfile } from "@/lib/routing/bike-profiles"
import {
  isActivelyClosed,
  isLegallyProhibitedForMotorcycle,
  type RoadAccessSnapshot
} from "@/lib/roads/road-access"
import type { RoadLock } from "@/lib/roads/road-locks"

/**
 * Decision precedence for motorcycle routing. A road lock must not
 * override anything above it; route-profile scoring sits at the bottom
 * and is the only layer a lock can lawfully influence.
 *
 *   1. Current legal access restrictions       (motorcycle=no, access=private)
 *   2. Current closures and conditional limits (seasonal, conditional)
 *   3. Hard physical compatibility with the bike (surface, tracktype)
 *   4. Must-use locks                            (rider's absolute corridor)
 *   5. Required stops                            (brewery / fuel / food)
 *   6. Preferred locks                           (rewarded, not enforced)
 *   7. Route-profile scoring                     (twisty, scenic, adventure)
 */
export const ROAD_LOCK_PRECEDENCE = [
  "legal-access",
  "active-closure",
  "bike-compatibility",
  "must-use-lock",
  "required-stops",
  "prefer-lock",
  "route-profile-scoring"
] as const

export type RoadLockPrecedenceLayer = (typeof ROAD_LOCK_PRECEDENCE)[number]

export interface RoadLockPrecedenceEvaluation {
  /** Layer that blocked the corridor, when applicable. */
  blockingLayer: RoadLockPrecedenceLayer | null
  /** True when the lock survives every higher-precedence layer. */
  lockSurvives: boolean
  /** Human-readable explanation. */
  reason: string
}

/**
 * Evaluate whether a road lock survives the layers above it. The lock
 * precedence is intentionally fixed: a manually selected road does not
 * become valid merely because the rider selected it.
 */
export function evaluateRoadLockPrecedence(
  lock: RoadLock,
  bike: BikeProfile | undefined,
  requiredStopPresent: boolean
): RoadLockPrecedenceEvaluation {
  const snapshot = lock.accessSnapshot

  if (isLegallyProhibitedForMotorcycle(snapshot)) {
    return {
      blockingLayer: "legal-access",
      lockSurvives: false,
      reason: "Lock conflicts with a current legal motorcycle access restriction (motorcycle=no, access=private, or pedestrian-only highway)."
    }
  }

  if (isActivelyClosed(snapshot)) {
    return {
      blockingLayer: "active-closure",
      lockSurvives: false,
      reason: "Lock conflicts with an active seasonal or conditional closure on this corridor."
    }
  }

  if (bike && !bikeMatchesSurface(bike, snapshot)) {
    return {
      blockingLayer: "bike-compatibility",
      lockSurvives: false,
      reason: `Lock conflicts with the ${bike.name} surface compatibility (surface=${snapshot.surface}, smoothness=${snapshot.smoothness}, tracktype=${snapshot.tracktype}).`
    }
  }

  if (lock.mode !== "must" && lock.mode !== "prefer") {
    return {
      blockingLayer: null,
      lockSurvives: false,
      reason: `Lock has unsupported mode ${String(lock.mode)}.`
    }
  }

  // Required stops sit above prefer locks but never contradict a must lock:
  // a required stop can route around a prefer corridor when unavoidable, but
  // cannot remove a must-use corridor the rider chose deliberately.
  if (lock.mode === "prefer" && requiredStopPresent) {
    return {
      blockingLayer: "required-stops",
      lockSurvives: true,
      reason: "Required stop may route around the preferred corridor if the stop cannot be reached through it."
    }
  }

  return {
    blockingLayer: null,
    lockSurvives: true,
    reason: lock.mode === "must"
      ? "Must-use lock is satisfied within legal, closure, and bike compatibility limits."
      : "Preferred lock rewards the corridor; the router may detour only when higher-precedence constraints require it."
  }
}

/**
 * Hard physical compatibility test for the bike layer of the
 * precedence model. Surfaces a single verdict so the route explanation
 * can name the offending surface, smoothness, or tracktype rather than
 * collapsing to "unpaved".
 */
export function bikeMatchesSurface(bike: BikeProfile, snapshot: RoadAccessSnapshot): boolean {
  if (!snapshot.routable) return false

  const surface = snapshot.surface
  const smoothness = snapshot.smoothness
  const tracktype = snapshot.tracktype

  // Street and Touring exclude tracks and unknown unpaved surfaces outright.
  if (bike.category === "street" || bike.category === "touring") {
    if (snapshot.highwayClass === "track" && !bike.allowMaintainedGravel) return false
    if (snapshot.highwayClass === "path") return false
    if (surface === "unknown" && bike.avoidUnknownSurface) {
      // Penalties are applied by the scoring layer; only hard-block when the
      // bike profile refuses uncertain surfaces entirely.
      return false
    }
    if (
      surface === "dirt" ||
      surface === "earth" ||
      surface === "gravel" ||
      surface === "fine_gravel" ||
      surface === "grass" ||
      surface === "sand" ||
      surface === "mud" ||
      surface === "ground"
    ) {
      if (!bike.allowMaintainedGravel) return false
    }
    if (smoothness === "bad" && bike.category === "street") return false
    if (smoothness === "very_bad" || smoothness === "horrible" || smoothness === "very_horrible" || smoothness === "impassable") {
      return false
    }
    return true
  }

  // Adventure permits maintained gravel, penalizes poor surfaces.
  if (bike.category === "adventure") {
    if (smoothness === "impassable") return false
    if (surface === "mud" || surface === "sand") {
      if (!bike.allowRoughTracks) return false
    }
    if (tracktype === "grade5" && !bike.allowRoughTracks) return false
    return true
  }

  // Dual-Sport permits the broadest track classes; legal access still governs.
  if (bike.category === "dual-sport") {
    if (smoothness === "impassable") return false
    return true
  }

  return true
}

/**
 * Build a list of locks that survive precedence for a given route. Used
 * by the planner as the authoritative lock set when scoring candidates.
 * Locks that do not survive precedence are surfaced with their reason
 * so the rider can either widen the match, convert to prefer, remove
 * the lock, or restore the previous route.
 */
export function partitionLocksByPrecedence(
  locks: readonly RoadLock[],
  bike: BikeProfile | undefined,
  requiredStopPresent: boolean
): {
  surviving: RoadLock[]
  blocked: Array<{ lock: RoadLock; evaluation: RoadLockPrecedenceEvaluation }>
} {
  const surviving: RoadLock[] = []
  const blocked: Array<{ lock: RoadLock; evaluation: RoadLockPrecedenceEvaluation }> = []
  for (const lock of locks) {
    const evaluation = evaluateRoadLockPrecedence(lock, bike, requiredStopPresent)
    if (evaluation.lockSurvives) {
      surviving.push(lock)
    } else {
      blocked.push({ lock, evaluation })
    }
  }
  return { surviving, blocked }
}
