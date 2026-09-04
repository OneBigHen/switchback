import type { PaUnpavedRoadEvidence } from "@/lib/roads/types"
import type { IntrinsicFeatureProvenanceMap } from "@/lib/roads/intrinsic-features"
import type { BikeProfile } from "@/lib/routing/bike-profiles"
import type { RoadLock, RoadLockSatisfaction } from "@/lib/roads/road-locks"
import type { RouteScore as NormalizedRouteScore } from "@/lib/domain/contracts"
import type { RouteUtilityBreakdown } from "@/lib/recommendation/route-score"
import type { GpxIntelligenceReport } from "@/lib/gpx/intelligence"
import type { CorridorAdherence, CorridorOptionRole } from "./sketch-corridor"

export type Coordinate = [longitude: number, latitude: number]

/**
 * Product-facing motorcycle profiles. Some profiles intentionally reuse an
 * existing GraphHopper primitive; their route-quality weights and hard
 * request rules remain distinct at the Switchback boundary.
 */
export type RouteProfileId =
  | "quick"
  | "balanced"
  | "twisty"
  | "scenic"
  | "adventure"
  | "gravel"
  | "avoid-highways"
  | "neural"

/** Toll exposure policy: disclose on the route by default, or hard-avoid. */
export type TollPolicy = "allow-with-warning" | "avoid"

/** Which progressive API call this request/response belongs to. */
export type CandidateSet = "primary" | "alternatives"

/** How a route candidate entered the bounded search. */
export type RouteCandidateSource =
  | "direct"
  | "native"
  | "rig"
  | "loop-seed"
  | "heading-sector"
  | "community"
  | "road-character"

export interface CanonicalRouteSegmentRef {
  canonicalSegmentUid: string
  lengthMeters: number
}

/** Where a planning request came from; every source shares one pipeline (SB-001). */
export type RouteRequestSource =
  | "manual"
  | "intent"
  | "replan"
  | "offline-recovery"
  | "free-ride"

export interface Waypoint {
  lat: number
  lon: number
  label?: string
  locked?: boolean
}

export interface AvoidArea {
  id: string
  name?: string
  polygon: Coordinate[]
}

export interface RouteRequest {
  profile: RouteProfileId
  points: Waypoint[]
  /** Client-generated unique id for this exact request. */
  requestId?: string
  /** Provenance; defaults to "manual" when normalized (SB-001). */
  source?: RouteRequestSource
  avoidHighways?: boolean
  avoidAreas?: AvoidArea[]
  segmentProfiles?: RouteProfileId[]
  loopTargetMinutes?: number
  roundTrip?: {
    targetMinutes: number
    seed?: number
    heading?: number
  }
  /**
   * Client-generated lifecycle id shared across the primary and
   * alternatives calls of one planning session. Echoed on responses.
   */
  planningId?: string
  /** Primary-first progressive delivery; defaults to `primary`. */
  candidateSet?: CandidateSet
  /** Destination (A-to-B) time target in minutes; preserved through
   *  free-text parsing and request construction. */
  targetMinutes?: number
  /** Defaults to `allow-with-warning`; `avoid` rejects toll exposure. */
  tollPolicy?: TollPolicy
  /**
   * Active road locks for this plan. Locks preserve rider intent across
   * replans and graph updates: a `must` lock invalidates the route when
   * the corridor cannot be legally included, while a `prefer` lock
   * rewards the corridor without forbidding detours. Legal access and
   * active closures always override locks (see lock-precedence.ts).
   */
  roadLocks?: RoadLock[]
  /**
   * Selected bike profile. Translated into GraphHopper custom_model
   * surface/smoothness/tracktype rules so the engine refuses edges the
   * bike cannot physically ride (e.g. Street excluding tracks). The
   * planner additionally applies `bikeMatchesSurface` as a precedence
   * layer over road locks.
   */
  bikeProfile?: BikeProfile
  /**
   * The rider's free-draw stroke, resampled to at most
   * `MAX_CORRIDOR_SAMPLES` coordinates. It is a *soft* corridor: the planner
   * scores deviation from it and offers options at several adherence levels,
   * but never treats it as hard geometry. Absent for every non-sketch request.
   */
  sketchCorridor?: Coordinate[]
}

export interface RouteInstruction {
  distanceMeters: number
  timeMilliseconds: number
  sign: number
  text: string
  streetName: string
  interval: [number, number]
  speedLimitKmh?: number | null
}

export interface PlannedRoute {
  id: string
  name: string
  profile: RouteProfileId
  geometry: Coordinate[]
  waypoints: Waypoint[]
  instructions: RouteInstruction[]
  distanceMiles: number
  durationMinutes: number
  ascentMeters: number | null
  descentMeters: number | null
  twistiness: number
  turnCount: number
  roadMix: Record<string, number>
  surfaceMix: Record<string, number>
  /** Distribution of GraphHopper `road_environment` detail over the route. */
  roadEnvironmentMix?: Record<string, number>
  /** Distribution of GraphHopper `urban_density` detail over the route. */
  urbanDensityMix?: Record<string, number>
  /** Share (0..1) of route distance on curved road (curvature detail < 0.98). */
  curvatureDetailShare?: number
  /**
   * Toll exposure derived from the graph's `toll` detail. `known` is false
   * when the provider omitted the detail — never a falsely clean "no toll".
   */
  tollEvidence?: {
    known: boolean
    /** Percentage of route miles on tolled edges; null while unknown. */
    tollSharePercent: number | null
  }
  routingSource: "live" | "imported" | "preview"
  provider?: "graphhopper" | "valhalla"
  providerVersion?: string
  candidateSource?: RouteCandidateSource
  /** Compact directed-segment refs; geometry remains owned by the route cache. */
  canonicalSegmentRefs?: CanonicalRouteSegmentRef[]
  /** Explicit provider/version evidence, including a real fallback decision. */
  provenance?: {
    provider: "graphhopper" | "valhalla"
    version: string
    fallback: boolean
    fallbackFrom?: "graphhopper"
  }
  previewOnly: boolean
  /** Provider-neutral score plus its pre-utility gate result. */
  routeScore?: NormalizedRouteScore & {
    accepted?: boolean
    rejectionReasons?: string[]
    utility?: RouteUtilityBreakdown
    corridorFit?: CorridorAdherence
  }
  overlapPercent?: number
  /**
   * Which free-draw option this candidate answers. Only set for plans that
   * carried a `sketchCorridor`; absent everywhere else.
   */
  corridorOption?: CorridorOptionRole
  /** Measured fit against the rider's drawn stroke, when one was supplied. */
  corridorAdherence?: CorridorAdherence
  loopTargetMinutes?: number
  avoidHighways?: boolean
  avoidAreas?: AvoidArea[]
  segmentProfiles?: RouteProfileId[]
  officialUnpavedEvidence?: PaUnpavedRoadEvidence
  /** Provenance for normalized intrinsic road features; unknown stays explicit. */
  featureProvenance?: IntrinsicFeatureProvenanceMap
  /** Bounded analysis attached to imported GPX geometry; no geometry is duplicated. */
  gpxIntelligence?: GpxIntelligenceReport
  /** Imported tracks stay breadcrumb-only until the rider explicitly matches them. */
  navigationMode?: "turn-by-turn" | "track-only" | "continuous-track"
  /** First geometry index belonging to the GPX leg of a joined approach. */
  gpxLegStartIndex?: number
  /** Parent/source identity for a joined GPX derivative; source geometry is not copied. */
  gpxParentRouteId?: string
  derivativeProvenance?: {
    parentRouteId: string
    parentRevision: string
    changedSegmentPercent: number
    creator: "rider"
    modifiedAt: string
    visibility: "private"
  }
  /**
   * Per-lock satisfaction results for this candidate, computed after the
   * engines return. A must-use lock that is not satisfied surfaces a
   * `MustLockUnresolved` warning on the route instead of silently
   * dropping the lock.
   */
  lockSatisfaction?: RoadLockSatisfaction[]
}
