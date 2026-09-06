import type { LatestRequestGate } from "@/lib/client/latest-request"
import { RoutingClientError, requestTripPlan } from "@/lib/client/routing-client"
import { refreshCorridorHints } from "@/lib/client/corridor-hints-client"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"
import type { Coordinate } from "@/lib/routing/types"
import type { PlanningPhase } from "@/stores/planner-store"

export interface PlannerRouteLifecycle {
  getIntentIdentity?(): string
  beginRouting(identity?: PlanningResultIdentity): void
  applyPlan(plan: TripPlan, identity?: PlanningResultIdentity): void
  mergeAlternatives(plan: TripPlan, identity?: PlanningResultIdentity): void
  failRouting(error: { code: string; message: string }): void
  /** Phase 6 lifecycle control. */
  beginPlanning(): void
  setPlanningPhase(phase: PlanningPhase): void
  cancelPlanning(): void
  cancelRideUpdate?(): void
}

export interface PlanningResultIdentity { intentIdentity: string; requestId: number }

interface RunLatestTripPlanOptions {
  request: TripPlanRequest
  gate: LatestRequestGate
  getPlanner(): PlannerRouteLifecycle
  requestPlan?(request: TripPlanRequest, signal?: AbortSignal): Promise<TripPlan>
  onWarning(message: string): void
  /** Owned by the calling session, never shared across planner instances. */
  controller?: AbortController
}

/** The alternatives endpoint receives at most this many primary coordinates. */
const MAX_PRIMARY_SAMPLES = 128

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
  onWarning,
  controller = new AbortController()
}: RunLatestTripPlanOptions): Promise<TripPlan | null> {
  const requestId = gate.begin()
  const intentIdentity = getPlanner().getIntentIdentity?.()
  const identity = intentIdentity === undefined ? undefined : { intentIdentity, requestId }
  /**
   * One fence, three ways to fail it: a newer request took the gate, this
   * lifecycle was aborted, or the rider changed the ride since it started.
   * Every later checkpoint in this lifecycle — primary, alternatives, and the
   * error path — asks this same question, so there is no combination of
   * partial guards that can let an old answer land on a newer ride.
   */
  const requestGate = gate
  const fencedGate: LatestRequestGate = {
    ...requestGate,
    isCurrent: (id) => requestGate.isCurrent(id)
      && !controller.signal.aborted
      && getPlanner().getIntentIdentity?.() === intentIdentity
  }
  gate = fencedGate
  getPlanner().beginRouting(identity)
  getPlanner().beginPlanning()
  getPlanner().setPlanningPhase("routing-primary")
  try {
    const primary = await requestPlan(
      { ...request, compare: false, candidateSet: "primary" },
      controller.signal
    )
    if (!gate.isCurrent(requestId)) return null
    if (identity) getPlanner().applyPlan(primary, identity)
    else getPlanner().applyPlan(primary)
    if (primary.warnings.length > 0) onWarning(primary.warnings.join(" "))
    // Progressive alternatives: same lifecycle id and abort controller,
    // never blocks or replaces the primary, never repaints after a newer
    // request takes ownership.
    getPlanner().setPlanningPhase("alternatives")
    void loadAlternatives({
      request,
      primary,
      requestId,
      gate,
      controller,
      requestPlan,
      getPlanner,
      identity
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
  identity?: PlanningResultIdentity
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
  getPlanner,
  identity
}: LoadAlternativesOptions): Promise<void> {
  const primaryRoute = primary.routes.find((route) => route.id === primary.selectedRouteId)
    ?? primary.routes[0]
  const geometry = samplePrimaryGeometry(primaryRoute?.geometry)
  if (geometry.length < 2) {
    // Without a sampled primary there is nothing to differentiate against;
    // the lifecycle is still done, never left hanging on "alternatives".
    getPlanner().setPlanningPhase("ready")
    return
  }
  try {
    const alternatives = await requestPlan({
      ...request,
      compare: false,
      candidateSet: "alternatives",
      planningId: primary.planningId ?? request.planningId,
      primaryRoute: { id: primaryRoute.id, geometry }
    }, controller.signal)
    if (!gate.isCurrent(requestId)) return
    if (alternatives.routes.length === 0) {
      // An empty successful alternative set is final, not an error.
      getPlanner().setPlanningPhase("ready")
      void refreshCorridorHints(request, fetch, controller.signal)
      return
    }
    if (identity) getPlanner().mergeAlternatives(alternatives, identity)
    else getPlanner().mergeAlternatives(alternatives)
    getPlanner().setPlanningPhase("ready")
    // Phase 5 merge: warm the adviser hint cache in the background so the
    // next timeboxed plan can use source-backed corridor hints locally.
    void refreshCorridorHints(request, fetch, controller.signal)
  } catch {
    // Alternatives are optional evidence; never fail the primary, but DO
    // finish the lifecycle so the UI does not spin on "Adding alternatives…"
    // forever when they time out or error.
    if (gate.isCurrent(requestId)) getPlanner().setPlanningPhase("ready")
  }
}
