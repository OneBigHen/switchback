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
    name: "Adversarial fixture",
    profile: "balanced",
    geometry: [[-75.1, 40.2], [-75.2, 40.3]],
    waypoints: [],
    instructions: [],
    distanceMiles: 50,
    durationMinutes: 90,
    ascentMeters: 500,
    descentMeters: 480,
    twistiness: 70,
    turnCount: 80,
    roadMix: { SECONDARY: 100 },
    surfaceMix: { ASPHALT: 100 },
    routingSource: "live",
    previewOnly: false,
    ...overrides
  }
}

function fingerprint(rideId: string, twistiness: number, confidence = 1): RideFingerprint {
  return {
    version: 1,
    rideId,
    source: "recorded-ride",
    distanceMiles: 50,
    durationMinutes: 90,
    twistiness,
    ascentMetersPerMile: null,
    gravelShare: null,
    highwayShare: null,
    confidence
  }
}

describe("ride memory adversarial evidence handling", () => {
  it("does not convert unknown-only provider classifications into confident zero shares", () => {
    const result = fingerprintPlannedRoute(route({
      surfaceMix: { MISSING: 100 },
      roadMix: { MISSING: 100 }
    }), { source: "recorded-ride" })

    expect(result.gravelShare).toBeNull()
    expect(result.highwayShare).toBeNull()
  })

  it("does not learn fake low-twistiness preferences from malformed route values", () => {
    const malformed = ["a", "b", "c"].map((id) => fingerprintPlannedRoute(route({
      id,
      twistiness: Number.NaN,
      ascentMeters: null,
      surfaceMix: {},
      roadMix: {}
    }), { source: "recorded-ride" }))

    const learned = deriveLearnedRiderProfile(malformed, baseline)
    expect(learned.axisSupport.twistiness).toMatchObject({ samples: 0, learned: false })
    expect(learned.vector.twistiness).toBe(baseline.twistiness)
  })

  it("deduplicates conflicting ride ids deterministically instead of trusting input order", () => {
    const low = fingerprint("duplicate", 0.1)
    const high = fingerprint("duplicate", 0.9)
    const fixed = [fingerprint("b", 0.2), fingerprint("c", 0.3)]

    const lowFirst = deriveLearnedRiderProfile([low, high, ...fixed], baseline)
    const highFirst = deriveLearnedRiderProfile([high, low, ...fixed], baseline)

    expect(lowFirst.rideCount).toBe(3)
    expect(highFirst.rideCount).toBe(3)
    expect(lowFirst.vector).toEqual(highFirst.vector)
    expect(lowFirst.axisSupport).toEqual(highFirst.axisSupport)
  })
})
