import { describe, expect, it } from "vitest"
import { explainRouteFit, updateRiderPreference } from "@/lib/intelligence/rider-preferences"
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

describe("rider preferences", () => {
  it("learns only from explicit feedback and keeps each motorcycle/profile distinct", () => {
    const first = updateRiderPreference(null, { route: twistyRoute, motorcycleId: "scrambler", rating: 5, source: "rating" })
    const second = updateRiderPreference(first, {
      route: { ...twistyRoute, twistiness: 80, surfaceMix: { gravel: 55, asphalt: 45 } },
      motorcycleId: "scrambler",
      rating: 4,
      source: "manual-edit"
    })

    expect(second).toMatchObject({ motorcycleId: "scrambler", profile: "twisty", sampleCount: 2 })
    expect(second.preferredTwistiness).toBeGreaterThan(80)
    expect(second.preferredUnpavedPercent).toBeGreaterThan(0)
  })

  it("explains a recommendation and exposes confidence rather than hiding a preference guess", () => {
    const preference = updateRiderPreference(null, { route: twistyRoute, motorcycleId: "scrambler", rating: 5, source: "rating" })
    const explanation = explainRouteFit(preference, twistyRoute)

    expect(explanation.score).toBeGreaterThan(90)
    expect(explanation.confidence).toBe("low")
    expect(explanation.reasons.join(" ")).toMatch(/twistiness/i)
  })
})
