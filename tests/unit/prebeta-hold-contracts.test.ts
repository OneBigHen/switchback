import { describe, expect, it } from "vitest"
import { parseRidePromptLocally } from "@/lib/ai/ride-intent"
import { getLoopTimeboxMismatch } from "@/lib/planner/route-readiness"
import type { PlannedRoute } from "@/lib/routing/types"

function route(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "route-a",
    name: "Candidate",
    profile: "scenic",
    distanceMiles: 5,
    durationMinutes: 10,
    geometry: [],
    surfaceMix: {},
    twistiness: 50,
    ...overrides
  } as PlannedRoute
}

describe("pre-beta HOLD route truth contracts", () => {
  it("treats named loop locality as the explicit origin", () => {
    const intent = parseRidePromptLocally("Plan a 90-minute scenic loop with some gravel near Austin")
    expect(intent.mode).toBe("loop")
    expect(intent.targetMinutes).toBe(90)
    expect(intent.startQuery).toBe("Austin")
  })

  it("does not turn near me into a fake geocoding query", () => {
    const intent = parseRidePromptLocally("Plan a scenic loop near me")
    expect(intent.mode).toBe("loop")
    expect(intent.startQuery).toBeNull()
  })

  it("marks a radically short timeboxed route as requiring rider acceptance", () => {
    expect(getLoopTimeboxMismatch(route({ durationMinutes: 10, loopTargetMinutes: 90 }))).toEqual({
      requestedMinutes: 90,
      actualMinutes: 10,
      errorRatio: 80 / 90
    })
  })

  it("accepts a route inside the planner's 15 percent timebox tolerance", () => {
    expect(getLoopTimeboxMismatch(route({ durationMinutes: 78, loopTargetMinutes: 90 }))).toBeNull()
  })
})