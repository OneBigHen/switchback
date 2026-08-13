import { describe, expect, it, vi } from "vitest"
import { createPlanningSessionController } from "@/lib/client/planning-session-controller"
import type { TripPlan } from "@/lib/routing/planner"

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
    let resolve!: (value: TripPlan) => void
    let signal!: AbortSignal
    const requestPlan = vi.fn((_request: unknown, requestSignal?: AbortSignal) => {
      signal = requestSignal!
      return new Promise<TripPlan>((finish) => { resolve = finish })
    })
    const controller = createPlanningSessionController({
      getPlanner: () => state,
      requestPlan
    })

    const pending = controller.run(request, vi.fn())
    controller.cancel()
    resolve(plan)

    await expect(pending).resolves.toBeNull()
    expect(signal.aborted).toBe(true)
    expect(state.applyPlan).not.toHaveBeenCalled()
    expect(state.failRouting).not.toHaveBeenCalled()
  })
})
