import type { LatestRequestGate } from "@/lib/client/latest-request"
import { RoutingClientError, requestTripPlan } from "@/lib/client/routing-client"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"
import type { Coordinate } from "@/lib/routing/types"

interface PlannerRouteLifecycle {
  beginRouting(): void
  applyPlan(plan: TripPlan): void
  mergeAlternatives(plan: TripPlan): void
  failRouting(error: { code: string; message: string }): void
}

interface RunLatestTripPlanOptions {
  request: TripPlanRequest
  gate: LatestRequestGate
  getPlanner(): PlannerRouteLifecycle
  requestPlan?(request: TripPlanRequest, signal?: AbortSignal): Promise<TripPlan>
  onWarning(message: string): void
}

/** The alternatives endpoint receives at most this many primary coordinates. */
const MAX_PRIMARY_SAMPLES = 128

/**
 * One abort controller per planning lifecycle. A newer prompt, clear, or
 * replan aborts the previous lifecycle's provider work instead of letting
 * it run to completion.
 */
let activeController: AbortController | null = null

export function cancelRoutingRequest(): void {
  activeController?.abort()
  activeController = null
}

function samplePrimaryGeometry(
  geometry: Coordinate[] | undefined,
  max = MAX_PRIMARY_SAMPLES
): Coordinate[] {
  if (!geometry || geometry.length <= max) return geometry ?? []
  const step = (geometry.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, index) => geometry[Math.round(index * step)]!)
}

const defaultRequestPlan = (
  request: TripPlanRequest,
  signal?: AbortSignal
): Promise<TripPlan> => requestTripPlan(request, fetch, signal)

export async function runLatestTripPlan({
  request,
  gate,
  getPlanner,
  requestPlan = defaultRequestPlan,
  onWarning
}: RunLatestTripPlanOptions): Promise<TripPlan | null> {
  const requestId = gate.begin()
  cancelRoutingRequest()
  const controller = new AbortController()
  activeController = controller
  getPlanner().beginRouting()
  try {
    const primary = await requestPlan(
      { ...request, compare: false, candidateSet: "primary" },
      controller.signal
    )
    if (!gate.isCurrent(requestId)) return null
    getPlanner().applyPlan(primary)
    if (primary.warnings.length > 0) onWarning(primary.warnings.join(" "))
    // Progressive alternatives: same lifecycle id and abort controller,
    // never blocks or replaces the primary, never repaints after a newer
    // request takes ownership.
    void loadAlternatives({
      request,
      primary,
      requestId,
      gate,
      controller,
      requestPlan,
      getPlanner
    })
    return primary
  } catch (caught) {
    if (!gate.isCurrent(requestId)) return null
    const failure = caught instanceof RoutingClientError
      ? caught
      : new RoutingClientError("This trip could not be routed.", "ROUTE_PLANNING_FAILED", 500)
    getPlanner().failRouting({ code: failure.code, message: failure.message })
    return null
  }
}

interface LoadAlternativesOptions {
  request: TripPlanRequest
  primary: TripPlan
  requestId: number
  gate: LatestRequestGate
  controller: AbortController
  requestPlan(request: TripPlanRequest, signal?: AbortSignal): Promise<TripPlan>
  getPlanner(): PlannerRouteLifecycle
}

async function loadAlternatives({
  request,
  primary,
  requestId,
  gate,
  controller,
  requestPlan,
  getPlanner
}: LoadAlternativesOptions): Promise<void> {
  const primaryRoute = primary.routes.find((route) => route.id === primary.selectedRouteId)
    ?? primary.routes[0]
  const geometry = samplePrimaryGeometry(primaryRoute?.geometry)
  if (geometry.length < 2) return
  try {
    const alternatives = await requestPlan({
      ...request,
      compare: false,
      candidateSet: "alternatives",
      planningId: primary.planningId ?? request.planningId,
      primaryRoute: { id: primaryRoute.id, geometry }
    }, controller.signal)
    if (!gate.isCurrent(requestId)) return
    if (alternatives.routes.length === 0) return
    getPlanner().mergeAlternatives(alternatives)
  } catch {
    // Alternatives are optional evidence; never fail the primary or surface
    // cancellation noise after a newer request has taken ownership.
  }
}
