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

export interface PlanningSessionCommands {
  run(request: TripPlanRequest, onWarning: (message: string) => void): Promise<TripPlan | null>
  invalidate(): void
  cancel(): void
}

export interface PlanningSessionController extends PlanningSessionCommands {
  readonly gate: LatestRequestGate
  /**
   * Bounded command surface for presentation/controllers. Legacy direct methods
   * remain aliases while PlannerShell is migrated lifecycle-by-lifecycle.
   */
  readonly commands: PlanningSessionCommands
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
  const run: PlanningSessionCommands["run"] = (request, onWarning) => {
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
  }
  const cancel = () => {
    invalidate()
    getPlanner().cancelRideUpdate?.()
  }
  const commands: PlanningSessionCommands = { run, invalidate, cancel }

  return {
    gate,
    ...commands,
    commands
  }
}
