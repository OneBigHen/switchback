import { describe, expect, it, vi } from "vitest"
import { createLatestRequestGate } from "@/lib/client/latest-request"
import { runLatestTripPlan } from "@/lib/client/trip-planning-coordinator"
import { RoutingClientError } from "@/lib/client/routing-client"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"

const request: TripPlanRequest = {
  profile: "scenic",
  points: [
    { lat: 40.2, lon: -76.9 },
    { lat: 40.3, lon: -76.8 }
  ]
}

const plan: TripPlan = {
  selectedRouteId: "route-1",
  routes: [],
  warnings: ["Optional elevation is unavailable."]
}

function planner() {
  return {
    beginRouting: vi.fn(),
    applyPlan: vi.fn(),
    failRouting: vi.fn()
  }
}

describe("trip planning coordinator", () => {
  it("applies only the newest successful plan and surfaces its provider warning", async () => {
    const gate = createLatestRequestGate()
    const state = planner()
    const notify = vi.fn()

    const result = await runLatestTripPlan({
      request,
      gate,
      getPlanner: () => state,
      requestPlan: vi.fn().mockResolvedValue(plan),
      onWarning: notify
    })

    expect(result).toBe(plan)
    expect(state.beginRouting).toHaveBeenCalledOnce()
    expect(state.applyPlan).toHaveBeenCalledWith(plan)
    expect(notify).toHaveBeenCalledWith("Optional elevation is unavailable.")
  })

  it("does not overwrite planner state when a newer request has superseded it", async () => {
    const gate = createLatestRequestGate()
    const state = planner()
    let finish!: (value: TripPlan) => void
    const requestPlan = vi.fn(() => new Promise<TripPlan>((resolve) => { finish = resolve }))

    const pending = runLatestTripPlan({
      request,
      gate,
      getPlanner: () => state,
      requestPlan,
      onWarning: vi.fn()
    })
    gate.invalidate()
    finish(plan)

    await expect(pending).resolves.toBeNull()
    expect(state.applyPlan).not.toHaveBeenCalled()
  })

  it("normalizes unexpected routing failures for the planner", async () => {
    const gate = createLatestRequestGate()
    const state = planner()

    await expect(runLatestTripPlan({
      request,
      gate,
      getPlanner: () => state,
      requestPlan: vi.fn().mockRejectedValue(new Error("socket reset")),
      onWarning: vi.fn()
    })).resolves.toBeNull()

    expect(state.failRouting).toHaveBeenCalledWith({
      code: "ROUTE_PLANNING_FAILED",
      message: "This trip could not be routed."
    })
  })

  it("keeps provider failures actionable", async () => {
    const gate = createLatestRequestGate()
    const state = planner()

    await runLatestTripPlan({
      request,
      gate,
      getPlanner: () => state,
      requestPlan: vi.fn().mockRejectedValue(new RoutingClientError("GraphHopper is unavailable.", "ROUTER_UNREACHABLE", 503)),
      onWarning: vi.fn()
    })

    expect(state.failRouting).toHaveBeenCalledWith({
      code: "ROUTER_UNREACHABLE",
      message: "GraphHopper is unavailable."
    })
  })

  it("does not surface failure when a newer request has superseded it", async () => {
    const gate = createLatestRequestGate()
    const state = planner()
    let raise!: (reason: unknown) => void
    const requestPlan = vi.fn(
      () => new Promise<TripPlan>((_, rejectFn) => { raise = rejectFn })
    )

    const pending = runLatestTripPlan({
      request,
      gate,
      getPlanner: () => state,
      requestPlan,
      onWarning: vi.fn()
    })
    gate.invalidate()
    raise(new Error("socket reset"))

    await expect(pending).resolves.toBeNull()
    expect(state.failRouting).not.toHaveBeenCalled()
  })

  it("does not apply planner failure when an obsolete request rejects after a newer request has taken ownership", async () => {
    const gate = createLatestRequestGate()
    const state = planner()
    let raise!: (reason: unknown) => void
    const requestPlan = vi.fn()
    requestPlan
      .mockImplementationOnce(
        () => new Promise<TripPlan>((_, rejectFn) => { raise = rejectFn })
      )
      .mockResolvedValueOnce(plan)

    const stale = runLatestTripPlan({
      request,
      gate,
      getPlanner: () => state,
      requestPlan,
      onWarning: vi.fn()
    })

    // A newer request starts, takes ownership, and settles first.
    await expect(
      runLatestTripPlan({
        request,
        gate,
        getPlanner: () => state,
        requestPlan,
        onWarning: vi.fn()
      })
    ).resolves.toEqual(plan)
    expect(state.applyPlan).toHaveBeenCalledWith(plan)

    // The obsolete older request now rejects; it must not apply planner failure.
    raise(new Error("socket reset"))
    await expect(stale).resolves.toBeNull()
    expect(state.failRouting).not.toHaveBeenCalled()
  })
})
