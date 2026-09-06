import { beforeEach, describe, expect, it, vi } from "vitest"
import { createPlanningSessionController } from "@/lib/client/planning-session-controller"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"
import type { PlannedRoute } from "@/lib/routing/types"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"

const request: TripPlanRequest = {
  profile: "twisty",
  targetMinutes: 120,
  points: [
    { lat: 40.2, lon: -76.9 },
    { lat: 40.3, lon: -76.8 }
  ]
}

const start = { lat: 40.2, lon: -76.9, label: "Start" }
const finish = { lat: 40.3, lon: -76.8, label: "Finish" }

function route(id: string): PlannedRoute {
  return {
    id,
    name: id,
    profile: "twisty",
    geometry: [[-76.9, 40.2], [-76.8, 40.2]],
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
}

function plan(id: string, candidateSet?: TripPlan["candidateSet"]): TripPlan {
  return {
    selectedRouteId: id,
    routes: [route(id)],
    warnings: [],
    planningId: id,
    ...(candidateSet ? { candidateSet } : {})
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => { resolve = promiseResolve })
  return { promise, resolve }
}

describe("planner intent and planning session integration", () => {
  beforeEach(() => {
    localStorage.clear()
    usePlannerStore.setState(initialPlannerState)
  })

  it("a failed update keeps the attempted ride current and the last usable route visible", async () => {
    const store = usePlannerStore.getState()
    store.editRide({ start, finish, avoidHighways: true }, "First ride")
    store.applyPlan(plan("usable"))
    const committedIdentity = usePlannerStore.getState().getIntentIdentity()
    store.editRide({ avoidHighways: false, targetMinutes: 90 }, "Attempted faster ride")
    const attemptedIdentity = usePlannerStore.getState().getIntentIdentity()

    const controller = createPlanningSessionController({ getPlanner: usePlannerStore.getState,
      requestPlan: async () => { throw new Error("unavailable") } })
    await controller.run(request, vi.fn())

    const failed = usePlannerStore.getState()
    // The rider's attempt is still what they asked for: it is not silently
    // rewritten, so Retry and Cancel both mean something.
    expect(failed.avoidHighways).toBe(false)
    expect(failed.targetMinutes).toBe(90)
    expect(failed.getIntentIdentity()).toBe(attemptedIdentity)
    // The previous route is still on screen and still belongs to the ride it
    // actually answered.
    expect(failed.plan?.selectedRouteId).toBe("usable")
    expect(failed.isRecalculating).toBe(false)
    expect(failed.committedRide?.identity).toBe(committedIdentity)
    expect(failed.status).toBe("error")
    // No fabricated rider revision was invented to restore the old ride.
    expect(failed.rideHistory.lastChange?.label).toBe("Attempted faster ride")
    expect(failed.rideHistory.past.at(-1)?.intent.targetMinutes).toBe(120)
  })

  it("editing again after a failed update clears the stale failure", async () => {
    const store = usePlannerStore.getState()
    store.editRide({ start, finish }, "First ride")
    store.applyPlan(plan("usable"))
    store.editRide({ targetMinutes: 90 }, "Attempted faster ride")
    const controller = createPlanningSessionController({ getPlanner: usePlannerStore.getState,
      requestPlan: async () => { throw new Error("unavailable") } })
    await controller.run(request, vi.fn())
    expect(usePlannerStore.getState().status).toBe("error")

    usePlannerStore.getState().editRide({ profile: "scenic" }, "Changed road character")

    const edited = usePlannerStore.getState()
    expect(edited.error).toBeNull()
    expect(edited.status).toBe("ready")
    expect(edited.plan?.selectedRouteId).toBe("usable")
  })

  it("cancelling a failed update restores the last usable ride and clears the error", async () => {
    const store = usePlannerStore.getState()
    store.editRide({ start, finish, avoidHighways: true }, "First ride")
    store.applyPlan(plan("usable"))
    const committedIdentity = usePlannerStore.getState().getIntentIdentity()
    store.editRide({ avoidHighways: false, targetMinutes: 90 }, "Attempted faster ride")
    const controller = createPlanningSessionController({ getPlanner: usePlannerStore.getState,
      requestPlan: async () => { throw new Error("unavailable") } })
    await controller.run(request, vi.fn())

    controller.cancel()

    const cancelled = usePlannerStore.getState()
    expect(cancelled.avoidHighways).toBe(true)
    expect(cancelled.targetMinutes).toBe(120)
    expect(cancelled.error).toBeNull()
    expect(cancelled.status).toBe("ready")
    expect(cancelled.plan?.selectedRouteId).toBe("usable")
    // The attempt is still in history, so cancelling is itself recoverable.
    expect(cancelled.rideHistory.past.at(-1)?.intent.targetMinutes).toBe(90)
    expect(cancelled.committedRide?.identity).toBe(committedIdentity)
  })

  it("cancelling an edit restores the committed intent through the real controller", async () => {
    usePlannerStore.getState().replaceRoutePoints({ start, finish, via: [] })
    const controller = createPlanningSessionController({
      getPlanner: () => usePlannerStore.getState(),
      requestPlan: vi.fn().mockResolvedValue(plan("committed"))
    })

    await expect(controller.run(request, vi.fn())).resolves.toMatchObject({
      planningId: "committed"
    })
    const committed = usePlannerStore.getState()
    const committedIdentity = committed.getIntentIdentity()
    const committedPlan = committed.plan

    usePlannerStore.getState().setPoint("finish", {
      lat: 40.4,
      lon: -76.7,
      label: "Attempted destination"
    })
    const edited = usePlannerStore.getState()
    const editedIdentity = edited.getIntentIdentity()
    expect(edited.finish?.label).toBe("Attempted destination")
    expect(edited.plan).toBe(committedPlan)
    expect(editedIdentity).not.toBe(committedIdentity)

    controller.cancel()

    const restored = usePlannerStore.getState()
    expect(restored.finish).toEqual(finish)
    expect(restored.plan).toBe(committedPlan)
    expect(restored.committedRide?.identity).toBe(committedIdentity)
    expect(restored.getIntentIdentity()).not.toBe(editedIdentity)
    expect(restored.rideHistory.lastChange?.label).toBe("Cancelled ride change")
  })

  it("fences a primary response after a direct revision edit without gate.invalidate", async () => {
    const primary = deferred<TripPlan>()
    const controller = createPlanningSessionController({
      getPlanner: () => usePlannerStore.getState(),
      requestPlan: vi.fn().mockReturnValue(primary.promise)
    })

    const pending = controller.run(request, vi.fn())
    const beforeIdentity = usePlannerStore.getState().getIntentIdentity()
    usePlannerStore.getState().setProfile("adventure")
    expect(usePlannerStore.getState().getIntentIdentity()).not.toBe(beforeIdentity)
    primary.resolve(plan("stale-primary"))

    await expect(pending).resolves.toBeNull()
    expect(usePlannerStore.getState().plan).toBeNull()
    expect(usePlannerStore.getState().resultIdentity).toBeNull()
  })

  it("fences alternatives after a direct revision edit without gate.invalidate", async () => {
    const alternatives = deferred<TripPlan>()
    const requestPlan = vi.fn()
      .mockResolvedValueOnce(plan("primary"))
      .mockReturnValueOnce(alternatives.promise)
    const controller = createPlanningSessionController({
      getPlanner: () => usePlannerStore.getState(),
      requestPlan
    })

    await expect(controller.run(request, vi.fn())).resolves.toMatchObject({ planningId: "primary" })
    await vi.waitFor(() => expect(requestPlan).toHaveBeenCalledTimes(2))
    const beforeEdit = usePlannerStore.getState()
    const beforeEditIdentity = beforeEdit.getIntentIdentity()
    const beforePlan = beforeEdit.plan
    usePlannerStore.getState().setProfile("adventure")
    expect(usePlannerStore.getState().getIntentIdentity()).not.toBe(beforeEditIdentity)

    alternatives.resolve(plan("late-alternative", "alternatives"))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(usePlannerStore.getState().plan).toBe(beforePlan)
    expect(usePlannerStore.getState().plan?.routes.map(({ id }) => id)).toEqual(["primary"])
  })
})
