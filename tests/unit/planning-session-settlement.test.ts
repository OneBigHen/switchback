import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPlanningSessionController } from "@/lib/client/planning-session-controller"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"
import type { PlannedRoute } from "@/lib/routing/types"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"

const request: TripPlanRequest = {
  profile: "twisty",
  points: [
    { lat: 40.2, lon: -76.9 },
    { lat: 40.3, lon: -76.8 }
  ]
}

const route: PlannedRoute = {
  id: "stale-route",
  name: "Stale route",
  profile: "twisty",
  geometry: [[-76.9, 40.2], [-76.8, 40.3]],
  waypoints: [],
  instructions: [],
  distanceMiles: 20,
  durationMinutes: 35,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 70,
  turnCount: 12,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

const plan: TripPlan = { selectedRouteId: route.id, routes: [route], warnings: [] }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => { resolve = promiseResolve })
  return { promise, resolve }
}

describe("planning session settlement", () => {
  beforeEach(() => {
    localStorage.clear()
    usePlannerStore.setState(initialPlannerState)
  })

  it("settles lifecycle state when a direct ride revision fences the active request", async () => {
    const pendingPlan = deferred<TripPlan>()
    const controller = createPlanningSessionController({
      getPlanner: usePlannerStore.getState,
      requestPlan: vi.fn().mockReturnValue(pendingPlan.promise)
    })

    const pending = controller.run(request, vi.fn())
    await vi.waitFor(() => expect(usePlannerStore.getState().status).toBe("routing"))

    usePlannerStore.getState().setProfile("adventure")
    pendingPlan.resolve(plan)

    await expect(pending).resolves.toBeNull()
    expect(usePlannerStore.getState().status).not.toBe("routing")
    expect(usePlannerStore.getState().planningPhase).not.toBe("routing-primary")
    expect(usePlannerStore.getState().planningPhase).not.toBe("alternatives")
    expect(usePlannerStore.getState().pendingResultIdentity).toBeNull()
  })
})
