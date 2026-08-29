import { beforeEach, describe, expect, it } from "vitest"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"
import type { TripPlan } from "@/lib/routing/planner"
import type { PlannedRoute } from "@/lib/routing/types"

function plan(id = "route-1"): TripPlan {
  const route: PlannedRoute = {
    id,
    name: "Route",
    profile: "twisty",
    geometry: [[-76.9, 40.2], [-76.8, 40.3]],
    waypoints: [],
    instructions: [],
    distanceMiles: 20,
    durationMinutes: 40,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 60,
    turnCount: 12,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
  return { selectedRouteId: id, routes: [route], warnings: [] }
}

beforeEach(() => {
  usePlannerStore.setState(initialPlannerState)
})

describe("planner lifecycle phase", () => {
  it("keeps recorded replay explicitly selected beside its planned route", () => {
    const planned = plan("planned-route").routes[0]
    const actual = { ...planned, id: "planned-route-actual", name: "Route · actual ride" }
    const store = usePlannerStore.getState()
    store.applyPlan({ selectedRouteId: actual.id, routes: [planned, actual], warnings: [] })
    store.selectRoute(actual.id)

    expect(usePlannerStore.getState()).toMatchObject({ selectedRouteId: actual.id, selectionSource: "user" })
  })

  it("keeps an active reroute explicitly selected when returning to the HUD", () => {
    const original = plan("original-route").routes[0]
    const rerouted = { ...original, id: "rerouted-route", name: "Rerouted route" }
    const store = usePlannerStore.getState()
    store.applyPlan({ selectedRouteId: rerouted.id, routes: [original, rerouted], warnings: [] })
    store.selectRoute(rerouted.id)

    expect(usePlannerStore.getState()).toMatchObject({ selectedRouteId: rerouted.id, selectionSource: "user" })
  })

  it("retains the previous route (dimmed) while replanning and restores it on cancel", () => {
    const store = usePlannerStore.getState()
    store.applyPlan(plan("old-route"))

    store.beginRouting()
    let state = usePlannerStore.getState()
    expect(state.isRecalculating).toBe(true)
    expect(state.plan?.selectedRouteId).toBe("old-route")

    store.cancelPlanning()
    state = usePlannerStore.getState()
    expect(state.planningPhase).toBe("cancelled")
    expect(state.isRecalculating).toBe(false)
    expect(state.plan?.selectedRouteId).toBe("old-route")
    expect(state.status).toBe("idle")
  })

  it("clears the recalculation flag and ends the lifecycle when the primary applies", () => {
    const store = usePlannerStore.getState()
    store.beginRouting()
    store.setPlanningPhase("routing-primary")
    store.applyPlan(plan("new-route"))

    const state = usePlannerStore.getState()
    expect(state.isRecalculating).toBe(false)
    expect(state.plan?.selectedRouteId).toBe("new-route")
    expect(state.status).toBe("ready")
  })

  it("tracks the lifecycle start time and ends it on ready", () => {
    const store = usePlannerStore.getState()
    store.setPlanningPhase("interpreting")
    expect(usePlannerStore.getState().planningStartedAt).not.toBeNull()

    store.setPlanningPhase("ready")
    expect(usePlannerStore.getState().planningStartedAt).toBeNull()
    expect(usePlannerStore.getState().planningPhase).toBe("ready")
  })

  it("marks the lifecycle as error on routing failure while keeping the previous route", () => {
    const store = usePlannerStore.getState()
    store.applyPlan(plan("old-route"))
    store.beginRouting()
    store.failRouting({ code: "ROUTE_PLANNING_FAILED", message: "Could not route" })

    const state = usePlannerStore.getState()
    expect(state.planningPhase).toBe("error")
    expect(state.isRecalculating).toBe(false)
    expect(state.plan?.selectedRouteId).toBe("old-route")
    expect(state.status).toBe("error")
  })

  it("does not get stuck reporting progress after a cancelled plan is retried", () => {
    // Regression: cancelPlanning() used to leave planningPhase permanently at
    // "cancelled", which every later setPlanningPhase("interpreting") call
    // (the very next ride prompt, see usePlannerRideIntent.ts) silently
    // rejected as an illegal source transition. The rider's plan would still
    // run, but the lifecycle spinner/cancel UI would never reappear.
    const store = usePlannerStore.getState()
    store.setPlanningPhase("interpreting")
    store.cancelPlanning()
    expect(usePlannerStore.getState().planningPhase).toBe("cancelled")

    store.setPlanningPhase("interpreting")
    expect(usePlannerStore.getState().planningPhase).toBe("interpreting")
  })

  it("does not get stuck reporting progress after a failed plan is retried", () => {
    // Same regression as above, via the failRouting()/error path exercised by
    // runLatestTripPlan's direct routing-primary re-entry.
    const store = usePlannerStore.getState()
    store.setPlanningPhase("interpreting")
    store.setPlanningPhase("routing-primary")
    store.failRouting({ code: "ROUTE_PLANNING_FAILED", message: "Could not route" })
    expect(usePlannerStore.getState().planningPhase).toBe("error")

    store.setPlanningPhase("routing-primary")
    expect(usePlannerStore.getState().planningPhase).toBe("routing-primary")
  })
})
