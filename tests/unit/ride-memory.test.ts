import { describe, expect, it } from "vitest"
import type { RidePreferenceVector } from "@/lib/ai/ride-preferences"
import type { PlannedRoute } from "@/lib/routing/types"
import {
  deriveLearnedRiderProfile,
  fingerprintPlannedRoute,
  type RideFingerprint
} from "@/lib/rides/ride-memory"

const baseline: RidePreferenceVector = {
  twistiness: 0.45,
  scenery: 0.6,
  gravel: 0.15,
  technicality: 0.3,
  elevation: 0.4,
  highwayAversion: 0.5
}

function route(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "route-1",
    name: "Fixture ride",
    profile: "balanced",
    geometry: [[-75.1, 40.2], [-75.2, 40.3]],
    waypoints: [],
    instructions: [],
    distanceMiles: 50,
    durationMinutes: 90,
    ascentMeters: 600,
    descentMeters: 590,
    twistiness: 70,
    turnCount: 80,
    roadMix: { SECONDARY: 75, TERTIARY: 20, MOTORWAY: 5 },
    surfaceMix: { ASPHALT: 80, GRAVEL: 15, DIRT: 5 },
    routingSource: "live",
    previewOnly: false,
    ...overrides
  }
}

function fingerprint(overrides: Partial<RideFingerprint> = {}): RideFingerprint {
  return {
    version: 1,
    rideId: "ride-1",
    source: "recorded-ride",
    distanceMiles: 50,
    durationMinutes: 90,
    twistiness: 0.7,
    ascentMetersPerMile: 12,
    gravelShare: 0.2,
    highwayShare: 0.05,
    confidence: 1,
    ...overrides
  }
}

describe("ride memory fingerprints", () => {
  it("captures measured route character and distinguishes metadata-identical rides", () => {
    const twisty = fingerprintPlannedRoute(route(), { source: "recorded-ride" })
    const tame = fingerprintPlannedRoute(route({
      id: "route-2",
      twistiness: 25,
      ascentMeters: 150,
      surfaceMix: { ASPHALT: 100 },
      roadMix: { SECONDARY: 55, PRIMARY: 15, MOTORWAY: 30 }
    }), { source: "recorded-ride" })

    expect(twisty).toMatchObject({
      distanceMiles: 50,
      durationMinutes: 90,
      twistiness: 0.7,
      ascentMetersPerMile: 12,
      gravelShare: 0.2,
      highwayShare: 0.05
    })
    expect(twisty.twistiness).toBeGreaterThan(tame.twistiness)
    expect(twisty.gravelShare).toBeGreaterThan(tame.gravelShare ?? -1)
    expect(tame.highwayShare).toBeGreaterThan(twisty.highwayShare ?? 1)
  })

  it("keeps missing surface and road-class evidence explicitly unknown", () => {
    const result = fingerprintPlannedRoute(route({
      surfaceMix: {},
      roadMix: {},
      ascentMeters: null
    }), { source: "recorded-ride" })

    expect(result.gravelShare).toBeNull()
    expect(result.highwayShare).toBeNull()
    expect(result.ascentMetersPerMile).toBeNull()
    expect(result.confidence).toBeLessThan(1)
  })
})

describe("learned rider profile", () => {
  it("preserves baseline axes until enough measured rides support learning", () => {
    const result = deriveLearnedRiderProfile([
      fingerprint({ rideId: "one", twistiness: 0.9 }),
      fingerprint({ rideId: "two", twistiness: 0.8 })
    ], baseline)

    expect(result.vector).toEqual(baseline)
    expect(result.axisSupport.twistiness).toMatchObject({ samples: 2, learned: false })
    expect(result.axisSupport.scenery).toMatchObject({ samples: 0, learned: false })
    expect(result.axisSupport.technicality).toMatchObject({ samples: 0, learned: false })
  })

  it("uses robust aggregation so one outlier cannot dominate learned character", () => {
    const result = deriveLearnedRiderProfile([
      fingerprint({ rideId: "a", twistiness: 0.72 }),
      fingerprint({ rideId: "b", twistiness: 0.68 }),
      fingerprint({ rideId: "c", twistiness: 0.7 }),
      fingerprint({ rideId: "d", twistiness: 0.74 }),
      fingerprint({ rideId: "outlier", twistiness: 0 })
    ], baseline)

    expect(result.vector.twistiness).toBeCloseTo(0.7, 3)
    expect(result.axisSupport.twistiness.learned).toBe(true)
    expect(result.vector.scenery).toBe(baseline.scenery)
    expect(result.vector.technicality).toBe(baseline.technicality)
  })

  it("learns only supported axes and bounds every learned preference to 0..1", () => {
    const result = deriveLearnedRiderProfile([
      fingerprint({ rideId: "a", gravelShare: 0.65, highwayShare: 0.02, ascentMetersPerMile: 60 }),
      fingerprint({ rideId: "b", gravelShare: 0.7, highwayShare: 0.04, ascentMetersPerMile: 55 }),
      fingerprint({ rideId: "c", gravelShare: 0.75, highwayShare: 0.01, ascentMetersPerMile: 50 })
    ], baseline)

    expect(result.vector.gravel).toBeCloseTo(0.7, 3)
    expect(result.vector.highwayAversion).toBeCloseTo(0.98, 3)
    expect(result.vector.elevation).toBe(1)
    for (const value of Object.values(result.vector)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it("increases confidence when additional rides support the same learned axis", () => {
    const three = deriveLearnedRiderProfile([
      fingerprint({ rideId: "1" }),
      fingerprint({ rideId: "2" }),
      fingerprint({ rideId: "3" })
    ], baseline)
    const six = deriveLearnedRiderProfile([
      fingerprint({ rideId: "1" }),
      fingerprint({ rideId: "2" }),
      fingerprint({ rideId: "3" }),
      fingerprint({ rideId: "4" }),
      fingerprint({ rideId: "5" }),
      fingerprint({ rideId: "6" })
    ], baseline)

    expect(six.confidence).toBeGreaterThan(three.confidence)
    expect(six.axisSupport.twistiness.confidence).toBeGreaterThan(three.axisSupport.twistiness.confidence)
  })
})
