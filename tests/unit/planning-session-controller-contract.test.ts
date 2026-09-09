import { describe, expect, it, vi } from "vitest"
import { createPlanningSessionController } from "@/lib/client/planning-session-controller"
import type { PlannerRouteLifecycle } from "@/lib/client/trip-planning-coordinator"

function plannerLifecycle(): PlannerRouteLifecycle {
  return {
    beginRouting: vi.fn(),
    applyPlan: vi.fn(),
    mergeAlternatives: vi.fn(),
    failRouting: vi.fn(),
    beginPlanning: vi.fn(),
    setPlanningPhase: vi.fn(),
    cancelPlanning: vi.fn(),
    cancelRideUpdate: vi.fn()
  }
}

describe("planning session controller contract", () => {
  it("exposes one bounded command facade while preserving legacy method identity", () => {
    const planner = plannerLifecycle()
    const session = createPlanningSessionController({ getPlanner: () => planner })

    expect(session.commands.run).toBe(session.run)
    expect(session.commands.invalidate).toBe(session.invalidate)
    expect(session.commands.cancel).toBe(session.cancel)
  })

  it("keeps Cancel semantics owned by the same session commands", () => {
    const planner = plannerLifecycle()
    const session = createPlanningSessionController({ getPlanner: () => planner })

    session.commands.cancel()

    expect(planner.cancelPlanning).toHaveBeenCalledOnce()
    expect(planner.cancelRideUpdate).toHaveBeenCalledOnce()
  })
})
