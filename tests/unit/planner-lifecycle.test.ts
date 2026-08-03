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
})
