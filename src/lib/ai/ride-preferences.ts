import type { RideIntent } from "./ride-intent"
import type { RouteProfileId } from "@/lib/routing/types"

/**
 * Normalized rider-facing route character. These values describe intent only;
 * provider adapters must translate them into engine-specific routing policy.
 * The advisor never writes GraphHopper/Valhalla weights directly.
 */
export interface RidePreferenceVector {
  twistiness: number
  scenery: number
  gravel: number
  technicality: number
  elevation: number
  highwayAversion: number
}

export type RidePreferenceAxis = keyof RidePreferenceVector
export type RidePreferenceEditStrength = "much-less" | "less" | "more" | "much-more"
export type RidePreferenceEdits = Partial<Record<RidePreferenceAxis, RidePreferenceEditStrength>>

const PROFILE_BASELINES: Record<RouteProfileId, RidePreferenceVector> = {
  quick: {
    twistiness: 0.15,
    scenery: 0.2,
    gravel: 0,
    technicality: 0.1,
    elevation: 0.25,
    highwayAversion: 0.15
  },
  balanced: {
    twistiness: 0.45,
    scenery: 0.5,
    gravel: 0.15,
    technicality: 0.25,
    elevation: 0.4,
    highwayAversion: 0.45
  },
  twisty: {
    twistiness: 0.95,
    scenery: 0.55,
    gravel: 0.05,
    technicality: 0.55,
    elevation: 0.5,
    highwayAversion: 0.75
  },
  scenic: {
    twistiness: 0.65,
    scenery: 0.95,
    gravel: 0.1,
    technicality: 0.25,
    elevation: 0.6,
    highwayAversion: 0.85
  },
  adventure: {
    twistiness: 0.65,
    scenery: 0.7,
    gravel: 0.7,
    technicality: 0.45,
    elevation: 0.5,
    highwayAversion: 0.8
  },
  gravel: {
    twistiness: 0.55,
    scenery: 0.65,
    gravel: 0.95,
    technicality: 0.55,
    elevation: 0.5,
    highwayAversion: 0.9
  },
  "avoid-highways": {
    twistiness: 0.55,
    scenery: 0.6,
    gravel: 0.1,
    technicality: 0.25,
    elevation: 0.45,
    highwayAversion: 1
  },
  neural: {
    twistiness: 0.7,
    scenery: 0.65,
    gravel: 0.25,
    technicality: 0.45,
    elevation: 0.5,
    highwayAversion: 0.7
  }
}

const EDIT_DELTAS: Record<RidePreferenceEditStrength, number> = {
  "much-less": -0.3,
  less: -0.15,
  more: 0.15,
  "much-more": 0.3
}

const AXES = Object.keys(PROFILE_BASELINES.balanced) as RidePreferenceAxis[]

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))))
}

function assertPreferenceVector(vector: RidePreferenceVector): void {
  for (const axis of AXES) {
    const value = vector[axis]
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`Ride preference ${axis} must be between 0 and 1`)
    }
  }
}

/**
 * Bridge the existing coarse RideIntent contract into a richer deterministic
 * preference vector without changing current parser behavior.
 */
export function preferencesFromRideIntent(intent: Pick<RideIntent,
  "profile" | "preferGravel" | "avoidHighways"
>): RidePreferenceVector {
  const preferences = { ...PROFILE_BASELINES[intent.profile] }
  if (intent.preferGravel) preferences.gravel = Math.max(preferences.gravel, 0.7)
  if (intent.avoidHighways) preferences.highwayAversion = 1
  return preferences
}

/**
 * Apply a conversational refinement such as "more curves, less gravel".
 * Unmentioned axes are preserved exactly, so follow-up turns cannot silently
 * reset unrelated rider intent.
 */
export function applyRidePreferenceEdits(
  current: RidePreferenceVector,
  edits: RidePreferenceEdits
): RidePreferenceVector {
  assertPreferenceVector(current)
  const next = { ...current }

  for (const axis of AXES) {
    const edit = edits[axis]
    if (edit === undefined) continue
    const delta = EDIT_DELTAS[edit]
    if (delta === undefined) throw new Error(`Unknown ride preference edit: ${String(edit)}`)
    next[axis] = clampUnit(current[axis] + delta)
  }

  return next
}
