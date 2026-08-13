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

export const PA_NJ_GOLDEN_CORPUS_VERSION = "pa-nj-golden-corpus-v1"

/**
 * Owner-defined relational expectations. The corpus names the review cases;
 * it deliberately stores no copied route geometry or invented field facts.
 */
export const PA_NJ_GOLDEN_CORPUS = [
  {
    id: "hatboro-new-hope-stockton",
    label: "Hatboro → New Hope/Stockton",
    assertion: "target-band-and-corridor",
    targetMinutes: 120,
    maxStateTransitions: 1,
    corridorFamily: "upper-bucks-delaware"
  },
  {
    id: "hatboro-loop",
    label: "Hatboro loop",
    assertion: "loop-target-band",
    targetMinutes: 120,
    maxStateTransitions: 0
  },
  {
    id: "hatboro-jim-thorpe",
    label: "Hatboro → Jim Thorpe",
    assertion: "target-band-and-backroad-preference",
    targetMinutes: 180,
    maxStateTransitions: 0
  },
  {
    id: "pa-forest-gravel",
    label: "PA forest/gravel",
    assertion: "gravel-evidence-precedes-utility",
    targetMinutes: 180
  },
  {
    id: "known-boring-connector",
    label: "Known boring connector",
    assertion: "loses-to-reviewed-character-route"
  },
  {
    id: "known-excellent-gravel",
    label: "Known excellent gravel",
    assertion: "wins-for-gravel-profile"
  },
  {
    id: "known-excellent-paved-twisty",
    label: "Known excellent paved twisty",
    assertion: "wins-for-twisty-profile"
  },
  {
    id: "explicit-forbidden-private",
    label: "Explicit forbidden/private example",
    assertion: "hard-rejects-explicit-access"
  },
  {
    id: "seasonal-official",
    label: "Seasonal official example",
    assertion: "conditional-is-warning-not-permission"
  },
  {
    id: "ambiguous-surface",
    label: "Ambiguous surface example",
    assertion: "unknown-surface-stays-explicit"
  },
  {
    id: "cross-pa-nj",
    label: "Cross PA/NJ",
    assertion: "one-required-crossing-no-extra-recrossing",
    maxStateTransitions: 1
  }
] as const
