import type { Coordinate } from "@/lib/routing/types"

/**
 * OSM-tagged motorcycle access value, normalized to the values that the
 * GraphHopper motorcycle access parser consumes. `unknown` indicates the
 * tag is absent on this edge; routing then falls back to default access
 * rules (typically permissive for public highways) rather than
 * overriding the lock.
 */
export type MotorcycleAccessValue =
  | "yes"
  | "designated"
  | "permissive"
  | "destination"
  | "delivery"
  | "private"
  | "no"
  | "unknown"

/**
 * Road surface material. Mirrors the OSM `surface=*` keys GraphHopper
 * surfaces in path details. `unknown` is preserved so a route's data
 * quality can be reported honestly rather than conflated with `unpaved`.
 */
export type RoadSurfaceTag =
  | "asphalt"
  | "concrete"
  | "paving_stones"
  | "sett"
  | "compacted"
  | "gravel"
  | "fine_gravel"
  | "dirt"
  | "earth"
  | "ground"
  | "grass"
  | "sand"
  | "mud"
  | "metal"
  | "wood"
  | "unhewn_cobblestone"
  | "cobblestone"
  | "pebblestone"
  | "unknown"

/** OSM `smoothness=*` value, grouped by physical comfort for a motorcycle. */
export type RoadSmoothnessTag =
  | "excellent"
  | "good"
  | "intermediate"
  | "bad"
  | "very_bad"
  | "horrible"
  | "very_horrible"
  | "impassable"
  | "unknown"

/** OSM `tracktype=*` value, grade 1 (solid) through grade 5 (virtual). */
export type RoadTracktypeTag = "grade1" | "grade2" | "grade3" | "grade4" | "grade5" | "unknown"

/** OSM `highway=*` value as far as routing is concerned. */
export type HighwayClass =
  | "motorway"
  | "trunk"
  | "primary"
  | "secondary"
  | "tertiary"
  | "unclassified"
  | "residential"
  | "track"
  | "path"
  | "service"
  | "living_street"
  | "cycleway"
  | "footway"
  | "pedestrian"
  | "bridleway"
  | "steps"
  | "unknown"

/**
 * Conditional access window parsed from `access:conditional`,
 * `motor_vehicle:conditional`, or `motorcycle:conditional`. We model a
 * single-window open/close pair plus the raw OSM condition text so the
 * route explanation can quote what the data actually said.
 */
export interface RoadAccessCondition {
  /** Source tag key, e.g. `motorcycle:conditional`. */
  sourceKey: string
  /** Raw OSM condition expression (e.g. `"no @ (Nov-Apr)"`). */
  raw: string
  /** Whether the parsed condition currently closes access. */
  isOpen: boolean
  /** Reason phrase surfaced to the rider. */
  reason: string
}

/**
 * Snapshot of every tag on a road segment that bears on legal or
 * physical motorcycle access. This is the unit consulted by the lock
 * precedence model so that locks never override motorcycle=no or active
 * closures, regardless of how the rider acquired the lock.
 */
export interface RoadAccessSnapshot {
  highwayClass: HighwayClass
  motorcycleAccess: MotorcycleAccessValue
  /** General `access=*` when motorcycle-specific value is absent. */
  generalAccess: MotorcycleAccessValue
  surface: RoadSurfaceTag
  smoothness: RoadSmoothnessTag
  tracktype: RoadTracktypeTag
  /** OSM `maxweight=*` tonnage, parsed when present. */
  maxweightTonnes: number | null
  /** Whether `seasonal=yes` was set without an explicit date range. */
  seasonalUndated: boolean
  /** Parsed conditional restrictions, evaluated against the ride time. */
  activeConditions: RoadAccessCondition[]
  /** Whether the underlying edge was reachable on the routing graph. */
  routable: boolean
}

const NO_ACCESS_VALUES: ReadonlySet<MotorcycleAccessValue> = new Set(["no", "private"])

/**
 * Returns true when the snapshot describes a road that no motorcycle may
 * legally use regardless of rider preference or lock. This is the
 * absolute precedence floor that road locks cannot override.
 */
export function isLegallyProhibitedForMotorcycle(snapshot: RoadAccessSnapshot): boolean {
  if (NO_ACCESS_VALUES.has(snapshot.motorcycleAccess)) return true
  if (snapshot.motorcycleAccess === "unknown" && NO_ACCESS_VALUES.has(snapshot.generalAccess)) {
    return true
  }
  if (snapshot.highwayClass === "footway" || snapshot.highwayClass === "pedestrian" || snapshot.highwayClass === "bridleway") {
    // motorcycle=no is implicit on these; only override when the data explicitly allows.
    return snapshot.motorcycleAccess !== "yes" && snapshot.motorcycleAccess !== "designated" && snapshot.motorcycleAccess !== "permissive"
  }
  return false
}

/**
 * Returns true when the snapshot has an active conditional or seasonal
 * closure that should override a road lock at this moment in time.
 */
export function isActivelyClosed(snapshot: RoadAccessSnapshot): boolean {
  if (snapshot.activeConditions.some((condition) => !condition.isOpen)) return true
  return false
}

/**
 * Returns true when the road surface is roughly rideable by a street
 * motorcycle (paved or firm). Used by the bike-profile layer of the
 * precedence model, not by road locks directly.
 */
export function isPavementLike(surface: RoadSurfaceTag): boolean {
  switch (surface) {
    case "asphalt":
    case "concrete":
    case "paving_stones":
    case "sett":
    case "unhewn_cobblestone":
    case "cobblestone":
    case "pebblestone":
    case "metal":
    case "wood":
      return true
    default:
      return false
  }
}

/** Convenience coordinate triple used by the road lock LineString. */
export type RoadLockAnchor = Coordinate
