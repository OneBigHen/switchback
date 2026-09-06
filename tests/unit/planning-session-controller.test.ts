import { describe, expect, it, vi } from "vitest"
import { createPlanningSessionController } from "@/lib/client/planning-session-controller"
import type { TripPlan } from "@/lib/routing/planner"
import type { PlannedRoute } from "@/lib/routing/types"

const request = {
  profile: "scenic" as const,
  targetMinutes: 120,
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function route(id: string): PlannedRoute {
  return {
    id,
    name: id,
    profile: "scenic",
    geometry: [[-76.9, 40.2], [-76.8, 40.2]],
    waypoints: [],
    instructions: [],
    distanceMiles: 20,
    durationMinutes: 35,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 50,
    turnCount: 12,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

function fixturePlan(
  id: string,
  routes: PlannedRoute[] = [],
  candidateSet?: TripPlan["candidateSet"]
): TripPlan {
  return {
    selectedRouteId: routes[0]?.id ?? id,
    routes,
    warnings: [],
    planningId: id,
    ...(candidateSet ? { candidateSet } : {})
  }
}

function planner() {
  return {
    beginRouting: vi.fn(),
    applyPlan: vi.fn(),
    mergeAlternatives: vi.fn(),
    failRouting: vi.fn(),
    beginPlanning: vi.fn(),
    setPlanningPhase: vi.fn(),
    cancelPlanning: vi.fn()
  }
}

describe("planning session controller", () => {
  it("cancelling one planner does not abort another planner", async () => {
    const signals: AbortSignal[] = []
    const resolvers: Array<(value: TripPlan) => void> = []
    const requestPlan = (_request: unknown, signal?: AbortSignal) => {
      signals.push(signal!)
      return new Promise<TripPlan>((resolve) => resolvers.push(resolve))
    }
    const first = createPlanningSessionController({ getPlanner: planner, requestPlan })
    const secondState = planner()
    const second = createPlanningSessionController({ getPlanner: () => secondState, requestPlan })
    const a = first.run(request, vi.fn())
    const b = second.run(request, vi.fn())
    expect(signals[0].aborted).toBe(false)
    first.cancel()
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    resolvers.forEach((resolve) => resolve(plan))
    await expect(a).resolves.toBeNull()
    await expect(b).resolves.toBe(plan)
  })

  it("aborts slow A before applying fast B in the same planning session", async () => {
    const state = planner()
    const slowA = fixturePlan("A")
    const fastB = fixturePlan("B")
    const slowRequest = deferred<TripPlan>()
    let slowSignal!: AbortSignal
    const requestPlan = vi.fn((_request: unknown, signal?: AbortSignal) => {
      if (requestPlan.mock.calls.length === 1) {
        slowSignal = signal!
        signal?.addEventListener("abort", () => {
          slowRequest.resolve(slowA)
        }, { once: true })
        return slowRequest.promise
      }
      return Promise.resolve(fastB)
    })
    const controller = createPlanningSessionController({
      getPlanner: () => state,
      requestPlan
    })

    const slow = controller.run({ ...request, targetMinutes: 120 }, vi.fn())
    const fast = controller.run({ ...request, targetMinutes: 180 }, vi.fn())

    await expect(fast).resolves.toBe(fastB)
    await expect(slow).resolves.toBeNull()
    expect(slowSignal.aborted).toBe(true)
    expect(state.applyPlan).toHaveBeenCalledOnce()
    expect(state.applyPlan).toHaveBeenCalledWith(fastB)
    expect(state.failRouting).not.toHaveBeenCalled()
  })

  it("does not merge late A alternatives after B primary owns the session", async () => {
    const state = planner()
    const primaryA = fixturePlan("A", [route("A-primary")])
    const primaryB = fixturePlan("B")
    const alternativesA = fixturePlan("A", [route("A-alternative")], "alternatives")
    const pendingAlternatives = deferred<TripPlan>()
    const pendingPrimaryB = deferred<TripPlan>()
    let alternativesSignal!: AbortSignal
    const requestPlan = vi.fn((incoming: { candidateSet?: string }, signal?: AbortSignal) => {
      if (requestPlan.mock.calls.length === 1) return Promise.resolve(primaryA)
      if (incoming.candidateSet === "alternatives") {
        alternativesSignal = signal!
        return pendingAlternatives.promise
      }
      return pendingPrimaryB.promise
    })
    const controller = createPlanningSessionController({
      getPlanner: () => state,
      requestPlan
    })

    const first = controller.run({ ...request, targetMinutes: 120 }, vi.fn())
    await expect(first).resolves.toBe(primaryA)
    const second = controller.run({ ...request, targetMinutes: 180 }, vi.fn())
    pendingPrimaryB.resolve(primaryB)

    await expect(second).resolves.toBe(primaryB)
    expect(alternativesSignal.aborted).toBe(true)

    // Response order is A primary, B primary, then the stale A alternatives.
    pendingAlternatives.resolve(alternativesA)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(state.applyPlan).toHaveBeenNthCalledWith(1, primaryA)
    expect(state.applyPlan).toHaveBeenNthCalledWith(2, primaryB)
    expect(state.mergeAlternatives).not.toHaveBeenCalled()
  })

  it("delegates the route lifecycle and owns cancellation", async () => {
    const state = planner()
    const requestPlan = vi.fn().mockResolvedValue(plan)
    const controller = createPlanningSessionController({
      getPlanner: () => state,
      requestPlan
    })
    const warning = vi.fn()

    await expect(controller.run(request, warning)).resolves.toBe(plan)

    expect(requestPlan).toHaveBeenCalledOnce()
    expect(state.applyPlan).toHaveBeenCalledWith(plan)
    expect(warning).toHaveBeenCalledWith("Optional elevation is unavailable.")
    controller.cancel()
    expect(state.cancelPlanning).toHaveBeenCalledOnce()
  })

  it("makes a cancelled request stale before aborting provider work", async () => {
    const state = planner()
    let signal!: AbortSignal
    const staleAtAbort: boolean[] = []
    const cancelledRequest = deferred<TripPlan>()
    const requestPlan = vi.fn((_request: unknown, requestSignal?: AbortSignal) => {
      signal = requestSignal!
      requestSignal?.addEventListener("abort", () => {
        staleAtAbort.push(controller.gate.isCurrent(1))
        cancelledRequest.reject(new DOMException("aborted", "AbortError"))
      }, { once: true })
      return cancelledRequest.promise
    })
    const controller = createPlanningSessionController({
      getPlanner: () => state,
      requestPlan
    })

    const pending = controller.run(request, vi.fn())
    controller.cancel()

    await expect(pending).resolves.toBeNull()
    expect(staleAtAbort).toEqual([false])
    expect(signal.aborted).toBe(true)
    expect(controller.gate.isCurrent(1)).toBe(false)
  })
})
