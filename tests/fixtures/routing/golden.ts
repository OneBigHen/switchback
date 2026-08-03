import type { RideIntent } from "@/lib/ai/ride-intent"
import type { Waypoint } from "@/lib/routing/types"

/**
 * Golden scenario for the routing-intelligence rework.
 *
 * Phase 1 asserts ONLY the intent contract below (already implemented).
 * The geographic/performance expectations in `evaluator` are recorded for
 * later phases (4/7) — they are deliberately NOT asserted here.
 */
export const GOLDEN_PROMPT = "2 hour fun ride from Hatboro to Stockton NJ"

export const HATBORO: Waypoint = { lat: 40.1745, lon: -75.1059, label: "Hatboro" }
export const STOCKTON_NJ: Waypoint = { lat: 40.4082, lon: -74.9792, label: "Stockton NJ" }

/**
 * The locked Phase 1 intent contract for the golden prompt.
 * `profile` is "twisty" because unqualified "fun" means maximum twisties.
 */
export const GOLDEN_INTENT_CONTRACT = {
  mode: "destination",
  profile: "twisty",
  rideCharacter: "fun",
  targetMinutes: 120,
  tollPolicy: "allow-with-warning",
  ambiguous: false,
  startQuery: "Hatboro",
  destinationQuery: "Stockton NJ",
  avoidHighways: false,
  stopQuery: null,
  preferGravel: false
} as const satisfies Partial<RideIntent>

/**
 * Future expectations — evaluator metadata only. Later phases assert these;
 * Phase 1 must not pretend the routing quality work exists yet.
 */
export const GOLDEN_EVALUATOR = {
  /** Accepted target band: ±10% of 120 minutes. */
  targetBandMinutes: [108, 132] as const,
  /** Preferred corridor family: Upper Bucks / Delaware corridor over Philadelphia. */
  corridorFamily: "upper-bucks-delaware",
  /** The selected route should favor the PA side and avoid unnecessary recrossing. */
  maxStateTransitions: 1,
  /** Tolls must be disclosed (never silently hidden). */
  tollDisclosureRequired: true
} as const
