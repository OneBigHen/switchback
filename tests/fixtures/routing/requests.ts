import type { TripPlanRequest } from "@/lib/routing/planner"
import type { AvoidArea, RoadLock, Waypoint } from "@/lib/routing/types"
import { HATBORO, STOCKTON_NJ } from "./golden"

export const HARRISBURG: Waypoint = { lat: 40.2732, lon: -76.8867, label: "Harrisburg" }
export const LANCASTER: Waypoint = { lat: 40.0379, lon: -76.3055, label: "Lancaster" }

/** Direct A-to-B request with a destination time target and toll policy. */
export const directRequest: TripPlanRequest = {
  profile: "twisty",
  compare: true,
  planningId: "plan-fixture-direct-0001",
  candidateSet: "primary",
  targetMinutes: 120,
  tollPolicy: "allow-with-warning",
  points: [HARRISBURG, LANCASTER]
}

/** Timeboxed loop (native round trip) request. */
export const loopRequest: TripPlanRequest = {
  profile: "adventure",
  compare: true,
  planningId: "plan-fixture-loop-0001",
  candidateSet: "primary",
  points: [HARRISBURG],
  roundTrip: { targetMinutes: 120, seed: 17, heading: 17 },
  tollPolicy: "allow-with-warning"
}

/** Toll-avoiding destination request. */
export const avoidTollsRequest: TripPlanRequest = {
  profile: "quick",
  compare: true,
  planningId: "plan-fixture-toll-0001",
  candidateSet: "primary",
  targetMinutes: 90,
  tollPolicy: "avoid",
  points: [HATBORO, STOCKTON_NJ]
}

/** Destination request with a rider-drawn avoid zone. */
export const avoidAreaRequest: TripPlanRequest = {
  profile: "scenic",
  compare: true,
  planningId: "plan-fixture-area-0001",
  candidateSet: "primary",
  avoidAreas: [{
    id: "closed-bridge",
    name: "Closed bridge crossing",
    polygon: [[-75.14, 40.2], [-75.12, 40.2], [-75.12, 40.21], [-75.14, 40.21]]
  } satisfies AvoidArea],
  points: [HATBORO, STOCKTON_NJ]
}

/** Destination request carrying a must-use road lock and a bike profile. */
export const roadLockRequest: TripPlanRequest = {
  profile: "adventure",
  compare: true,
  planningId: "plan-fixture-lock-0001",
  candidateSet: "primary",
  bikeProfile: {
    name: "Dual Sport",
    category: "dual-sport",
    fuelRangeMiles: 150,
    reserveMiles: 30,
    allowMaintainedGravel: true,
    allowRoughTracks: true,
    avoidUnknownSurface: false
  },
  roadLocks: [{
    id: "lock-river-road",
    mode: "must",
    displayName: "River Road corridor",
    edgeIds: ["edge-1", "edge-2"],
    geometry: {
      type: "LineString",
      coordinates: [[-75.11, 40.19], [-75.10, 40.195], [-75.09, 40.2]]
    },
    orderedAnchors: [[-75.11, 40.19], [-75.09, 40.2]],
    fallbackToleranceMeters: 50,
    source: "manual",
    confidence: "matched",
    sourceRegionId: "pennsylvania",
    sourceGraphVersion: "gh-11-1",
    createdAt: "2026-07-22T00:00:00.000Z",
    accessSnapshot: {
      highwayClass: "tertiary",
      motorcycleAccess: "yes",
      generalAccess: "yes",
      surface: "asphalt",
      smoothness: "good",
      tracktype: "grade1",
      routable: true,
      activeConditions: []
    }
  } satisfies RoadLock],
  points: [HATBORO, STOCKTON_NJ]
}

/** Alternatives request carrying the sampled primary route (≤128 coords). */
export const alternativesRequest: TripPlanRequest = {
  profile: "twisty",
  compare: false,
  planningId: "plan-fixture-direct-0001",
  candidateSet: "alternatives",
  targetMinutes: 120,
  tollPolicy: "allow-with-warning",
  points: [HATBORO, STOCKTON_NJ],
  primaryRoute: {
    id: "twisty-primary",
    geometry: [[-75.11, 40.19], [-75.10, 40.195], [-75.09, 40.2], [-75.08, 40.21]]
  }
}

/** Every fixture must carry a lifecycle id of at least this length. */
export const FIXTURE_PLANNING_IDS = [
  directRequest.planningId,
  loopRequest.planningId,
  avoidTollsRequest.planningId,
  avoidAreaRequest.planningId,
  roadLockRequest.planningId,
  alternativesRequest.planningId
] as const
