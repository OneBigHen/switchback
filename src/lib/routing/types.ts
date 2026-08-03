import type { PaUnpavedRoadEvidence } from "@/lib/roads/types"
import type { BikeProfile } from "@/lib/routing/bike-profiles"
import type { RoadLock, RoadLockSatisfaction } from "@/lib/roads/road-locks"

export type Coordinate = [longitude: number, latitude: number]

export type RouteProfileId = "quick" | "twisty" | "scenic" | "adventure"

/** Toll exposure policy: disclose on the route by default, or hard-avoid. */
export type TollPolicy = "allow-with-warning" | "avoid"

/** Which progressive API call this request/response belongs to. */
export type CandidateSet = "primary" | "alternatives"

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
  routingSource: "live" | "imported" | "preview"
  provider?: "graphhopper" | "valhalla"
  providerVersion?: string
  previewOnly: boolean
  overlapPercent?: number
  loopTargetMinutes?: number
  avoidHighways?: boolean
  avoidAreas?: AvoidArea[]
  segmentProfiles?: RouteProfileId[]
  officialUnpavedEvidence?: PaUnpavedRoadEvidence
  /**
   * Per-lock satisfaction results for this candidate, computed after the
   * engines return. A must-use lock that is not satisfied surfaces a
   * `MustLockUnresolved` warning on the route instead of silently
   * dropping the lock.
   */
  lockSatisfaction?: RoadLockSatisfaction[]
}
