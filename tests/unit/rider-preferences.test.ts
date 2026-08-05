import { describe, expect, it } from "vitest"
import { explainRouteFit, signalWeight, updateRiderPreference } from "@/lib/intelligence/rider-preferences"
import type { PlannedRoute } from "@/lib/routing/types"

const twistyRoute: PlannedRoute = {
  id: "twisty",
  name: "Twisty",
  profile: "twisty",
  geometry: [[-77, 40], [-76.8, 40.2]],
  waypoints: [],
  instructions: [],
  distanceMiles: 80,
  durationMinutes: 130,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 90,
  turnCount: 60,
  roadMix: {},
  surfaceMix: { asphalt: 100 },
  routingSource: "live",
  previewOnly: false
}

describe("rider preferences (SB-010 signed model)", () => {
  it("learns only from explicit feedback and keeps each bike/profile distinct", () => {
    const first = updateRiderPreference(null, { route: twistyRoute, bikeId: "bike-scrambler", rating: 5, source: "rating" })
    const second = updateRiderPreference(first, {
      route: { ...twistyRoute, twistiness: 80, surfaceMix: { gravel: 55, asphalt: 45 } },
      bikeId: "bike-scrambler",
      rating: 4,
      source: "manual-edit"
    })

    expect(second).toMatchObject({ bikeId: "bike-scrambler", profile: "twisty", sampleCount: 2 })
    expect(second.preferredTwistiness).toBeGreaterThan(80)
    expect(second.preferredUnpavedPercent).toBeGreaterThan(0)
  })

  it("never moves affinity toward disliked features (SB-010 regression)", () => {
    // A 1-star rating on a very twisty route must NOT raise preferredTwistiness.
    const disliked = updateRiderPreference(null, { route: twistyRoute, bikeId: "bike-street", rating: 1, source: "rating" })
    expect(disliked.preferredTwistiness).toBe(0)
    expect(disliked.negative.weight).toBeGreaterThan(0)
    expect(disliked.positive.weight).toBe(0)
  })

  it("weighs signals by the signed scale", () => {
    const signal = (rating: 1 | 2 | 3 | 4 | 5) => ({ route: twistyRoute, bikeId: "b", rating, source: "rating" as const })
    expect(signalWeight(signal(5))).toBe(2)
    expect(signalWeight(signal(4))).toBe(1)
    expect(signalWeight(signal(3))).toBe(0)
    expect(signalWeight(signal(2))).toBe(-1)
    expect(signalWeight(signal(1))).toBe(-2)
  })

  it("reduces fit for a route resembling the negative centroid", () => {
    const preference = updateRiderPreference(null, { route: twistyRoute, bikeId: "bike-a", rating: 1, source: "rating" })
    // The same twisty route now scores below the neutral baseline.
    const explanation = explainRouteFit(preference, twistyRoute)
    expect(explanation.score).toBeLessThan(50)
    expect(explanation.reasons.join(" ")).toMatch(/resembles roads you rated low/i)
  })

  it("explains a recommendation and exposes confidence rather than hiding a preference guess", () => {
    const preference = updateRiderPreference(null, { route: twistyRoute, bikeId: "bike-scrambler", rating: 5, source: "rating" })
    const explanation = explainRouteFit(preference, twistyRoute)

    expect(explanation.score).toBeGreaterThan(90)
    expect(explanation.confidence).toBe("low")
    expect(explanation.reasons.join(" ")).toMatch(/twistiness/i)
  })
})
