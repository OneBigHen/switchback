import type { LatestRequestGate } from "@/lib/client/latest-request"
import { createLatestRequestGate } from "@/lib/client/latest-request"
import {
  runLatestTripPlan,
  type PlannerRouteLifecycle
} from "@/lib/client/trip-planning-coordinator"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"

interface PlanningSessionControllerOptions {
  getPlanner(): PlannerRouteLifecycle
  requestPlan?(request: TripPlanRequest, signal?: AbortSignal): Promise<TripPlan>
}

export interface PlanningSessionController {
  readonly gate: LatestRequestGate
  run(request: TripPlanRequest, onWarning: (message: string) => void): Promise<TripPlan | null>
  invalidate(): void
  cancel(): void
}

/** Owns the request generation and cancellation boundary for one planner UI. */
export function createPlanningSessionController({
  getPlanner,
  requestPlan
}: PlanningSessionControllerOptions): PlanningSessionController {
  const baseGate = createLatestRequestGate()
  let activeController: AbortController | null = null
  const invalidate = () => {
    baseGate.invalidate()
    activeController?.abort()
    activeController = null
    getPlanner().cancelPlanning()
  }
  const gate: LatestRequestGate = { ...baseGate, invalidate }

  return {
    gate,
    run: (request, onWarning) => {
      // Fence callbacks first: abort listeners may run synchronously.
      baseGate.invalidate()
      activeController?.abort()
      activeController = new AbortController()
      return runLatestTripPlan({
        request,
        gate,
        getPlanner,
        requestPlan,
        onWarning,
        controller: activeController
      })
    },
    invalidate,
    cancel: () => {
      invalidate()
      getPlanner().cancelRideUpdate?.()
    }
  }
}
