import { beforeEach, describe, expect, it } from "vitest"
import type { TripPlan } from "@/lib/routing/planner"
import type { PlannedRoute } from "@/lib/routing/types"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"

const route: PlannedRoute = {
  id: "committed-route",
  name: "Committed route",
  profile: "twisty",
  geometry: [[-76.8, 40.2], [-76.7, 40.3]],
  waypoints: [],
  instructions: [],
  distanceMiles: 21,
  durationMinutes: 39,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 74,
  turnCount: 27,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

const plan: TripPlan = {
  selectedRouteId: route.id,
  routes: [route],
  warnings: []
}

describe("planner cancel identity", () => {
  beforeEach(() => usePlannerStore.setState(initialPlannerState))

  it("restores the exact committed ride identity so the retained route is startable again", () => {
    usePlannerStore.getState().setProfile("twisty")
    usePlannerStore.getState().applyPlan(plan)
    const committedPlan = usePlannerStore.getState().plan
    const committedIdentity = usePlannerStore.getState().rideHistory.identity

    usePlannerStore.getState().setProfile("adventure")
    expect(usePlannerStore.getState().rideHistory.identity).not.toBe(committedIdentity)
    expect(usePlannerStore.getState().committedRide?.identity).toBe(committedIdentity)

    usePlannerStore.getState().cancelRideUpdate()

    const restored = usePlannerStore.getState()
    expect(restored.profile).toBe("twisty")
    expect(restored.plan).toBe(committedPlan)
    expect(restored.status).toBe("ready")
    expect(restored.pendingResultIdentity).toBeNull()
    expect(restored.committedRide?.identity).toBe(restored.rideHistory.identity)
  })

  it("does not manufacture divergence when cancel is pressed with no uncommitted change", () => {
    usePlannerStore.getState().setProfile("twisty")
    usePlannerStore.getState().applyPlan(plan)
    const identity = usePlannerStore.getState().rideHistory.identity

    usePlannerStore.getState().cancelRideUpdate()

    const settled = usePlannerStore.getState()
    expect(settled.rideHistory.identity).toBe(identity)
    expect(settled.committedRide?.identity).toBe(identity)
    expect(settled.plan).not.toBeNull()
  })
})
