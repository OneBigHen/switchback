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

  it("restores an applied but unverified route update through the canonical store seam", () => {
    usePlannerStore.getState().setProfile("twisty")
    usePlannerStore.getState().applyPlan(plan)
    const before = usePlannerStore.getState()
    const snapshot = {
      committedRide: before.committedRide!,
      plan: before.plan,
      selectedRouteId: before.selectedRouteId,
      selectionSource: before.selectionSource,
      resultIdentity: before.resultIdentity
    }

    usePlannerStore.getState().setProfile("adventure")
    const attemptedIdentity = usePlannerStore.getState().getIntentIdentity()
    // A successful planner response can replace committedRide before an
    // advisor-level route-difference check rejects it.
    usePlannerStore.getState().applyPlan(plan)
    expect(usePlannerStore.getState().profile).toBe("adventure")

    expect(usePlannerStore.getState().restoreRideUpdate(snapshot, attemptedIdentity)).toBe(true)
    const restored = usePlannerStore.getState()
    expect(restored.profile).toBe("twisty")
    expect(restored.plan).toBe(snapshot.plan)
    expect(restored.selectedRouteId).toBe(snapshot.selectedRouteId)
    expect(restored.committedRide?.identity).toBe(restored.rideHistory.identity)
  })

  it("does not restore an older advisor update over a newer rider intent", () => {
    usePlannerStore.getState().setProfile("twisty")
    usePlannerStore.getState().applyPlan(plan)
    const before = usePlannerStore.getState()
    const snapshot = {
      committedRide: before.committedRide!,
      plan: before.plan,
      selectedRouteId: before.selectedRouteId,
      selectionSource: before.selectionSource,
      resultIdentity: before.resultIdentity
    }

    usePlannerStore.getState().setProfile("adventure")
    const advisorIdentity = usePlannerStore.getState().getIntentIdentity()
    usePlannerStore.getState().setProfile("gravel")

    expect(usePlannerStore.getState().restoreRideUpdate(snapshot, advisorIdentity)).toBe(false)
    expect(usePlannerStore.getState().profile).toBe("gravel")
  })

  it("does not restore over a newer planning request for the same intent", () => {
    usePlannerStore.getState().setProfile("twisty")
    usePlannerStore.getState().applyPlan(plan)
    const before = usePlannerStore.getState()
    const snapshot = {
      committedRide: before.committedRide!,
      plan: before.plan,
      selectedRouteId: before.selectedRouteId,
      selectionSource: before.selectionSource,
      resultIdentity: before.resultIdentity,
      expectedRequestId: 11
    }

    usePlannerStore.getState().setProfile("adventure")
    const advisorIdentity = usePlannerStore.getState().getIntentIdentity()
    const firstRequest = { intentIdentity: advisorIdentity, requestId: 11 }
    usePlannerStore.getState().beginRouting(firstRequest)
    usePlannerStore.getState().applyPlan(plan, firstRequest)
    const newerRequest = { intentIdentity: advisorIdentity, requestId: 12 }
    usePlannerStore.getState().beginRouting(newerRequest)
    usePlannerStore.getState().applyPlan(plan, newerRequest)

    expect(usePlannerStore.getState().restoreRideUpdate(snapshot, advisorIdentity)).toBe(false)
    expect(usePlannerStore.getState().profile).toBe("adventure")
    expect(usePlannerStore.getState().resultIdentity?.requestId).toBe(12)
  })
})
