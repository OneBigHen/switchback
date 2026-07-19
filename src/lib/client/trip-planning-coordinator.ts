import type { LatestRequestGate } from "@/lib/client/latest-request"
import { RoutingClientError, requestTripPlan } from "@/lib/client/routing-client"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"

interface PlannerRouteLifecycle {
  beginRouting(): void
  applyPlan(plan: TripPlan): void
  failRouting(error: { code: string; message: string }): void
}

interface RunLatestTripPlanOptions {
  request: TripPlanRequest
  gate: LatestRequestGate
  getPlanner(): PlannerRouteLifecycle
  requestPlan?(request: TripPlanRequest): Promise<TripPlan>
  onWarning(message: string): void
}

export async function runLatestTripPlan({
  request,
  gate,
  getPlanner,
  requestPlan = requestTripPlan,
  onWarning
}: RunLatestTripPlanOptions): Promise<TripPlan | null> {
  const requestId = gate.begin()
  getPlanner().beginRouting()
  try {
    const plan = await requestPlan(request)
    if (!gate.isCurrent(requestId)) return null
    getPlanner().applyPlan(plan)
    if (plan.warnings.length > 0) onWarning(plan.warnings.join(" "))
    return plan
  } catch (caught) {
    if (!gate.isCurrent(requestId)) return null
    const failure = caught instanceof RoutingClientError
      ? caught
      : new RoutingClientError("This trip could not be routed.", "ROUTE_PLANNING_FAILED", 500)
    getPlanner().failRouting({ code: failure.code, message: failure.message })
    return null
  }
}
