import { describe, expect, it } from "vitest"
import { parseRidePromptLocally } from "@/lib/ai/ride-intent"
import { getLoopTimeboxMismatch, loopTimeboxAcceptanceKey } from "@/lib/planner/route-readiness"
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
      errorRatio: 80 / 90,
      direction: "shorter"
    })
  })

  it("accepts a route inside the planner's 15 percent timebox tolerance", () => {
    expect(getLoopTimeboxMismatch(route({ durationMinutes: 78, loopTargetMinutes: 90 }))).toBeNull()
  })

  it("names an over-long timeboxed loop as longer, never as a shorter ride", () => {
    expect(getLoopTimeboxMismatch(route({ durationMinutes: 120, loopTargetMinutes: 90 }))).toEqual({
      requestedMinutes: 90,
      actualMinutes: 120,
      errorRatio: 30 / 90,
      direction: "longer"
    })
  })

  it("binds a timebox acceptance to the result revision, not just the route id", () => {
    const candidate = route({ id: "loop-a", durationMinutes: 105, loopTargetMinutes: 90 })
    const accepted = loopTimeboxAcceptanceKey(candidate, "intent-1#4")

    expect(accepted).not.toBeNull()
    // Same id, same request: still the ride the rider looked at.
    expect(loopTimeboxAcceptanceKey(candidate, "intent-1#4")).toBe(accepted)
    // A replan that reuses the id is a different answer and must ask again.
    expect(loopTimeboxAcceptanceKey(candidate, "intent-1#5")).not.toBe(accepted)
    expect(loopTimeboxAcceptanceKey(candidate, "intent-2#4")).not.toBe(accepted)
    // So is a materially different duration under the same revision.
    expect(loopTimeboxAcceptanceKey(
      route({ id: "loop-a", durationMinutes: 140, loopTargetMinutes: 90 }),
      "intent-1#4"
    )).not.toBe(accepted)
  })

  it("has no acceptance key for a route that never missed its timebox", () => {
    expect(loopTimeboxAcceptanceKey(route({ durationMinutes: 92, loopTargetMinutes: 90 }), "intent-1#4")).toBeNull()
    expect(loopTimeboxAcceptanceKey(null, "intent-1#4")).toBeNull()
  })
})