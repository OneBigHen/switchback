import type { LatestRequestGate } from "@/lib/client/latest-request"
import { createLatestRequestGate } from "@/lib/client/latest-request"
import {
  cancelRoutingRequest,
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
  const invalidate = () => {
    baseGate.invalidate()
    cancelRoutingRequest()
    getPlanner().cancelPlanning()
  }
  const gate: LatestRequestGate = { ...baseGate, invalidate }

  return {
    gate,
    run: (request, onWarning) => runLatestTripPlan({
      request,
      gate,
      getPlanner,
      requestPlan,
      onWarning
    }),
    invalidate,
    cancel: invalidate
  }
}
