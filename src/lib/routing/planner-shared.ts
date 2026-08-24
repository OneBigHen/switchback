import { evaluateRoadLockSatisfaction } from "@/lib/roads/road-locks"
import type { RoadLock } from "@/lib/roads/road-locks"
import { partitionLocksByPrecedence } from "@/lib/roads/lock-precedence"
import type { NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"
import type { PlannedRoute, RouteRequest } from "./types"
import type {
  RouteCandidateEnricher,
  RouteCandidateEnrichmentResult,
  TripPlan
} from "./planner-contract"

const UNPAVED_SURFACES = new Set([
  "compacted",
  "dirt",
  "earth",
  "fine_gravel",
  "grass",
  "gravel",
  "ground",
  "mud",
  "sand",
  "unpaved"
])

function unpavedShare(route: PlannedRoute): number {
  return Object.entries(route.surfaceMix).reduce(
    (total, [surface, share]) => total + (UNPAVED_SURFACES.has(surface.toLowerCase()) ? share : 0),
    0
  )
}

export function selectedCandidateScore(route: PlannedRoute): number {
  if (route.routeScore) return route.routeScore.total

  // Compatibility for injected providers and old cached routes that predate
  // provider-side score attachment. Live GraphHopper/Valhalla routes use the
  // single provider-neutral utility above.
  const offroadProfile = route.profile === "adventure" || route.profile === "gravel"
  const mappedSurface = unpavedShare(route)
  const surfaceFit = offroadProfile ? mappedSurface : 100 - mappedSurface
  const highwayShare = (route.roadMix.motorway ?? 0) + (route.roadMix.trunk ?? 0)
  const evidence = route.officialUnpavedEvidence?.sharePercent ?? 0
  return route.twistiness * (offroadProfile ? 0.25 : 0.5) +
    surfaceFit * (offroadProfile ? 5 : 0.1) +
    evidence * (offroadProfile ? 8 : 0.1) +
    (100 - highwayShare) * 0.1 -
    route.durationMinutes * (route.profile === "quick" ? 1 : 0.08)
}

export function chooseSelectedCandidate(routes: PlannedRoute[]): PlannedRoute | null {
  return routes.filter(route => route.routeScore?.accepted !== false).reduce<PlannedRoute | null>((best, candidate) => {
    if (!best) return candidate
    return selectedCandidateScore(candidate) > selectedCandidateScore(best) ? candidate : best
  }, null)
}

export function tripPlanMetadata(
  request: NormalizedRouteRequest
): Pick<TripPlan, "planningId" | "candidateSet" | "targetMinutes"> {
  return {
    ...(request.planningId ? { planningId: request.planningId } : {}),
    ...(request.candidateSet ? { candidateSet: request.candidateSet } : {}),
    ...(request.targetMinutes != null ? { targetMinutes: request.targetMinutes } : {})
  }
}

export async function enrichCandidates(
  request: RouteRequest,
  routes: PlannedRoute[],
  enricher?: RouteCandidateEnricher
): Promise<RouteCandidateEnrichmentResult> {
  if (!enricher) return { routes, warnings: [] }
  try {
    return await enricher(request, routes)
  } catch {
    return {
      routes,
      warnings: ["Optional route intelligence was unavailable; base routing was preserved."]
    }
  }
}

export interface RoadLockPartitionResult {
  /** Request carrying only the locks that survived precedence. */
  request: NormalizedRouteRequest
  /** Surviving locks, used by the planner to attach per-candidate satisfaction. */
  survivingLocks: RoadLock[]
  /** Warnings explaining why each blocked lock was skipped. */
  warnings: string[]
}

/**
 * Partition the request's road locks by precedence. Blocked locks are
 * surfaced as warnings (never silently dropped); only surviving locks are
 * forwarded to the routing provider. The bike profile is preserved
 * on the submission request so GraphHopper still translates it into
 * custom_model rules.
 */
export function partitionLocksForRequest(request: NormalizedRouteRequest): RoadLockPartitionResult {
  const initialLocks = request.roadLocks ?? []
  if (initialLocks.length === 0) {
    return { request, survivingLocks: [], warnings: [] }
  }
  const partition = partitionLocksByPrecedence(initialLocks, request.bikeProfile, false)
  const warnings = partition.blocked.map((entry) => {
    const displayName = entry.lock.displayName?.trim() || entry.lock.id
    return `Road lock "${displayName}" was skipped: ${entry.evaluation.reason}`
  })
  if (partition.surviving.length === initialLocks.length) {
    return { request, survivingLocks: partition.surviving, warnings }
  }
  const { roadLocks: _omittedLocks, ...requestWithoutLocks } = request
  void _omittedLocks
  return {
    request: { ...requestWithoutLocks, roadLocks: partition.surviving },
    survivingLocks: partition.surviving,
    warnings
  }
}

/**
 * Attach per-lock satisfaction to a route when the provider did not
 * already (hybrid attaches it directly; segmented and timeboxed fallbacks
 * fall through to here). Surviving locks are the source of truth —
 * blocked locks are surfaced as route warnings, not as satisfaction rows.
 */
export function ensureLockSatisfaction(
  route: PlannedRoute,
  survivingLocks: readonly RoadLock[]
): PlannedRoute {
  if (survivingLocks.length === 0) return route
  if (route.lockSatisfaction && route.lockSatisfaction.length > 0) return route
  return {
    ...route,
    lockSatisfaction: survivingLocks.map((lock) =>
      evaluateRoadLockSatisfaction(lock, route.geometry)
    )
  }
}
