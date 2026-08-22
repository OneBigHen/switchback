import { afterEach, describe, expect, it } from "vitest"
import { featureFlags } from "@/lib/domain/feature-flags"
import {
  createGraphHopperRequest,
  expandMustLockWaypoints,
  estimateRoundTripDistanceMeters
} from "@/lib/routing/graphhopper-request"
import { createManualRoadLock, createGpxRoadLock } from "@/lib/roads/road-locks"
import type { RoadAccessSnapshot } from "@/lib/roads/road-access"
import type { Coordinate } from "@/lib/routing/types"

const details = ["road_class", "surface", "track_type", "max_speed", "toll", "road_environment", "urban_density", "curvature"]
const start = { lat: 40.2732, lon: -76.8867 }
const finish = { lat: 40.0379, lon: -76.3055 }
const accessSnapshot: RoadAccessSnapshot = {
  highwayClass: "secondary",
  motorcycleAccess: "yes",
  generalAccess: "yes",
  surface: "asphalt",
  smoothness: "good",
  tracktype: "unknown",
  maxweightTonnes: null,
  seasonalUndated: false,
  activeConditions: [],
  routable: true
}
const lockLine: Coordinate[] = [[-76.61, 39.29], [-76.62, 39.3]]

function mustLock() {
  return createManualRoadLock({
    mode: "must",
    displayName: "PA-125",
    edgeIds: ["must-edge"],
    geometry: lockLine,
    orderedAnchors: [lockLine[0]!, lockLine[1]!],
    accessSnapshot,
    sourceRegionId: "maryland",
    sourceGraphVersion: "gh-11"
  })
}

function preferLock() {
  return createGpxRoadLock({
    mode: "prefer",
    displayName: "Ridge Road",
    edgeIds: ["prefer-edge"],
    geometry: lockLine,
    orderedAnchors: [lockLine[0]!, lockLine[1]!],
    accessSnapshot,
    sourceRegionId: "maryland",
    sourceGraphVersion: "gh-11"
  })
}

function unmatchedMustLock() {
  return createManualRoadLock({
    mode: "must",
    displayName: "Unmatched road",
    edgeIds: [],
    geometry: lockLine,
    orderedAnchors: [lockLine[0]!, lockLine[1]!],
    accessSnapshot,
    sourceRegionId: "manual",
    sourceGraphVersion: "manual"
  })
}

describe("GraphHopper request policy", () => {
  afterEach(() => {
    featureFlags.roadRequirements = true
  })

  it("builds the complete normal point-to-point request", () => {
    expect(createGraphHopperRequest({ profile: "twisty", points: [start, finish] })).toEqual({
      profile: "motorcycle_twisty",
      points: [[-76.8867, 40.2732], [-76.3055, 40.0379]],
      points_encoded: false,
      instructions: true,
      calc_points: true,
      elevation: false,
      locale: "en-US",
      details,
      algorithm: "alternative_route",
      "alternative_route.max_paths": 3,
      "alternative_route.max_weight_factor": 1.8,
      "alternative_route.max_share_factor": 0.62
    })
  })

  it("builds the complete round-trip request", () => {
    expect(estimateRoundTripDistanceMeters("twisty", 120)).toBe(122_310)
    expect(createGraphHopperRequest({
      profile: "twisty",
      points: [{ ...start, label: "Home" }],
      roundTrip: { targetMinutes: 120, seed: 17, heading: 80 }
    })).toEqual({
      profile: "motorcycle_twisty",
      points: [[-76.8867, 40.2732]],
      points_encoded: false,
      instructions: true,
      calc_points: true,
      elevation: false,
      locale: "en-US",
      details,
      algorithm: "round_trip",
      "round_trip.distance": 122_310,
      "round_trip.seed": 17,
      headings: [80]
    })
  })

  it("adds the highway avoidance policy without changing the base request", () => {
    expect(createGraphHopperRequest({ profile: "quick", avoidHighways: true, points: [start, finish] })).toEqual({
      profile: "motorcycle_fastest",
      points: [[-76.8867, 40.2732], [-76.3055, 40.0379]],
      points_encoded: false,
      instructions: true,
      calc_points: true,
      elevation: false,
      locale: "en-US",
      details,
      custom_model: {
        priority: [{ if: "road_class == MOTORWAY || road_class == TRUNK", multiply_by: "0" }]
      },
      algorithm: "alternative_route",
      "alternative_route.max_paths": 3,
      "alternative_route.max_weight_factor": 1.8,
      "alternative_route.max_share_factor": 0.62
    })
  })

  it("keeps must/prefer lock rules ordered and expands must anchors", () => {
    const request = { profile: "twisty" as const, points: [start, finish], roadLocks: [mustLock(), preferLock()] }
    const body = createGraphHopperRequest(request)
    expect(body.custom_model).toMatchObject({
      priority: [
        { if: "in_switchback_lock_0", multiply_by: "1.8" },
        { if: "in_switchback_lock_1", multiply_by: "1.6" }
      ]
    })
    expect((body.custom_model as { areas: { features: unknown[] } }).areas.features).toHaveLength(2)

    expect(expandMustLockWaypoints({
      ...request,
      points: [
        { ...start, label: "Start" },
        { ...finish, label: "Finish" }
      ],
      roadLocks: [mustLock()]
    })).toMatchObject({
      wireToOriginal: [0, -1, -1, 1],
      points: [
        { label: "Start" },
        { label: "Must-use PA-125: entry" },
        { label: "Must-use PA-125: exit" },
        { label: "Finish" }
      ]
    })
  })

  it("does not send an unresolved empty-edge must lock to GraphHopper", () => {
    const request = {
      profile: "twisty" as const,
      points: [start, finish],
      roadLocks: [unmatchedMustLock()]
    }

    expect(createGraphHopperRequest(request)).not.toHaveProperty("custom_model")
    expect(expandMustLockWaypoints(request)).toEqual({
      points: [start, finish],
      wireToOriginal: [0, 1]
    })
  })
})
