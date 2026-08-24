import type { PlannedRoute, RouteProfileId, RouteRequest } from "./types"
import { rankDiverseCandidates, routeSimilarity } from "@/lib/recommendation/route-diversity"
import { PA_NJ_ROUTE_POLICY_V1 } from "@/lib/recommendation/route-policy"
import { normalizeRouteRequest, type NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"
import { evaluateEligibility } from "@/lib/domain/routing/eligibility"
import type {
  PlanningOptions,
  RouteCandidateEnricher,
  RouteProvider,
  TripPlan,
  TripPlanRequest
} from "./planner-contract"
import {
  chooseSelectedCandidate,
  enrichCandidates,
  ensureLockSatisfaction,
  partitionLocksForRequest,
  selectedCandidateScore,
  tripPlanMetadata
} from "./planner-shared"
import { planSegmentedTrip } from "./planner-segmented"
import { planDestinationTimebox, requestTimeboxedRoutes } from "./planner-timebox"

export type {
  PlanningOptions,
  RouteCandidateEnricher,
  RouteCandidateEnrichmentResult,
  RouteProvider,
  RoutingResult,
  TripPlan,
  TripPlanRequest
} from "./planner-contract"

/** Alternatives endpoint: at most two meaningfully different routes. */
const MAX_ALTERNATIVES = PA_NJ_ROUTE_POLICY_V1.maxAlternatives
/** Alternatives endpoint: shared 12-second total deadline. */
const ALTERNATIVES_DEADLINE_MS = 12_000
/** Meaningfully different means at most 85% sampled-geometry overlap. */
const ALTERNATIVES_MAX_OVERLAP = PA_NJ_ROUTE_POLICY_V1.duplicateSimilarityThreshold * 100
const MAX_COMPARISON_OVERLAP = 90
/**
 * Stable comparison order. The first four preserve the original product
 * comparison contract; the newer profiles remain available after them.
 */
const COMPARISON_PROFILE_ORDER: readonly RouteProfileId[] = [
  "quick",
  "twisty",
  "scenic",
  "adventure",
  "balanced",
  "gravel",
  "avoid-highways",
  "neural"
]

function chooseDistinctCandidate(
  candidates: PlannedRoute[],
  existing: PlannedRoute[],
  maxOverlap = MAX_COMPARISON_OVERLAP,
  strict = false
): { route: PlannedRoute; overlapPercent: number; worstOverlap: number } | null {
  const eligibleCandidates = candidates.filter(route => route.routeScore?.accepted !== false)
  if (eligibleCandidates.length === 0) return null
  const ranked = rankDiverseCandidates(eligibleCandidates, existing, {
    maxSimilarity: maxOverlap / 100,
    strict,
    utility: selectedCandidateScore
  })
  const best = ranked[0]
  if (!best) return null
  const similarities = existing.map((current) => routeSimilarity(best.route, current))
  const worstOverlap = Math.max(0, ...similarities.map((similarity) => similarity.overlapShare * 100))
  return {
    route: best.route,
    overlapPercent: Math.round(similarities[0]?.overlapShare ? similarities[0].overlapShare * 100 : 0),
    worstOverlap
  }
}

function variedComparisonRequest(
  request: NormalizedRouteRequest,
  profile: RouteRequest["profile"],
  index: number
): NormalizedRouteRequest {
  if (!request.roundTrip) return { ...request, profile }
  return {
    ...request,
    profile,
    roundTrip: {
      ...request.roundTrip,
      seed: (request.roundTrip.seed ?? 0) + (index + 1) * 101,
      heading: ((request.roundTrip.heading ?? 0) + (index + 1) * 73) % 360
    }
  }
}

export async function planMotorcycleTrip(
  request: TripPlanRequest,
  provider: RouteProvider,
  enricher?: RouteCandidateEnricher,
  options: PlanningOptions = {}
): Promise<TripPlan> {
  // Every provider call below receives the single normalized contract: all
  // constraint fields are explicit and every mode shares one pipeline (SB-001).
  const normalized = normalizeRouteRequest(request)
  if (normalized.candidateSet === "alternatives") {
    return planAlternativeRoutes(normalized, provider, enricher, options)
  }
  if (normalized.targetMinutes != null && !normalized.roundTrip && !normalized.loopTargetMinutes
    && !normalized.segmentProfiles?.length && normalized.points.length >= 2) {
    return planDestinationTimebox(normalized, provider, options)
  }
  return planPrimaryRoute(normalized, provider, options)
}

/**
 * Primary path: one selected route for the requested profile. Comparison
 * profiles, PASDA evidence, and elevation enrichment never delay the first
 * usable route — they belong to the separate alternatives/evidence call.
 */
async function planPrimaryRoute(
  request: NormalizedRouteRequest,
  provider: RouteProvider,
  options: PlanningOptions = {}
): Promise<TripPlan> {
  const started = performance.now()
  if (request.segmentProfiles?.length) {
    const plan = await planSegmentedTrip(request, provider, undefined, options)
    return {
      ...plan,
      ...tripPlanMetadata(request),
      timingMs: { primary: performance.now() - started }
    }
  }
  const partitioned = partitionLocksForRequest(request)
  const selectedAttempt = await requestTimeboxedRoutes(
    partitioned.request,
    provider,
    undefined,
    options
  )
  const selected = chooseSelectedCandidate(selectedAttempt.result.routes)
  if (!selected) {
    throw new Error("The selected profile returned no routes")
  }

  const routes: PlannedRoute[] = [
    ensureLockSatisfaction({ ...selected, overlapPercent: 100 }, partitioned.survivingLocks)
  ]
  const warnings: string[] = [
    ...partitioned.warnings,
    ...(selectedAttempt.warning ? [selectedAttempt.warning] : [])
  ]
  return {
    ...tripPlanMetadata(request),
    selectedRouteId: selected.id,
    routes,
    warnings,
    timingMs: { primary: performance.now() - started }
  }
}

/**
 * Alternatives path: at most two meaningfully different routes (≤85%
 * sampled-geometry overlap against the primary and every accepted
 * alternative) drawn from the other profiles. Profiles run with concurrency
 * one under a shared 12-second deadline; enrichment (PASDA, elevation) runs
 * here as background evidence and never changes the selected primary.
 */
async function planAlternativeRoutes(
  request: NormalizedRouteRequest,
  provider: RouteProvider,
  enricher?: RouteCandidateEnricher,
  options: PlanningOptions = {}
): Promise<TripPlan> {
  const started = performance.now()
  if (!request.primaryRoute) {
    throw new Error("Alternatives requests require the sampled primary route.")
  }
  const primaryId = request.primaryRoute.id
  if (request.roundTrip || request.loopTargetMinutes || request.segmentProfiles?.length) {
    return {
      ...tripPlanMetadata(request),
      selectedRouteId: primaryId,
      routes: [],
      warnings: ["Alternatives are only available for point-to-point destination rides."],
      timingMs: { alternatives: performance.now() - started }
    }
  }
  const deadline: AbortSignal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(ALTERNATIVES_DEADLINE_MS)])
    : AbortSignal.timeout(ALTERNATIVES_DEADLINE_MS)

  const partitioned = partitionLocksForRequest(request)
  const primaryAnchor: PlannedRoute = {
    id: primaryId,
    name: "Primary route",
    profile: request.profile,
    geometry: request.primaryRoute.geometry,
    waypoints: [],
    instructions: [],
    distanceMiles: 0,
    durationMinutes: 0,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 0,
    turnCount: 0,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
  const accepted: PlannedRoute[] = []
  const warnings: string[] = [...partitioned.warnings]
  const profiles = COMPARISON_PROFILE_ORDER.filter((profile) => profile !== request.profile)

  // Comparison profiles race two-at-a-time through a sliding window, but
  // results are accepted strictly in profile order. The window only shifts
  // after a full pair is processed, so the two-alternative cap stops
  // launching sibling profiles at exactly the same point as the old serial
  // loop — while overlapping two requests instead of queueing six.
  const pending = new Map<number, Promise<Awaited<ReturnType<typeof requestTimeboxedRoutes>> | null>>()
  const launch = (index: number): void => {
    if (index >= profiles.length || pending.has(index)) return
    pending.set(index, requestTimeboxedRoutes(
      // Comparison profiles are NOT timeboxed: strip the destination time
      // target so they run at the normal alternative weight (1.8x) instead
      // of the heavy 4.0x corridor factor, keeping them quick.
      { ...variedComparisonRequest(request, profiles[index]!, 0), targetMinutes: undefined },
      provider,
      undefined,
      { signal: deadline }
    ).then(
      (result) => result,
      () => null
    ))
  }
  launch(0)
  launch(1)
  for (let index = 0; index < profiles.length && accepted.length < MAX_ALTERNATIVES && !deadline.aborted; index += 1) {
    const profile = profiles[index]!
    const result = await pending.get(index)
    if (result?.warning) warnings.push(result.warning)
    if (result) {
      // Hard eligibility first (SB-002): an ineligible candidate — preview
      // geometry, no real geometry, or an unresolved must road — never
      // reaches the comparison set, no matter how close it matches.
      const eligible = result.result.routes.filter((route) => {
        const report = evaluateEligibility(route)
        if (!report.eligible) {
          warnings.push(`${profile} comparison skipped: ${report.failures[0]?.message}`)
        }
        return report.eligible
      })
      const distinct = chooseDistinctCandidate(
        eligible,
        [...accepted, primaryAnchor],
        ALTERNATIVES_MAX_OVERLAP,
        true
      )
      if (!distinct) {
        warnings.push(`Dropped duplicate ${profile} route.`)
      } else {
        // Enrichment (PASDA/elevation evidence) runs only on the candidate
        // that actually made the cut, not on every comparison profile's full
        // result set — it is background evidence, never the primary route.
        const enriched = await enrichCandidates(request, [distinct.route], enricher)
        warnings.push(...enriched.warnings)
        accepted.push(
          ensureLockSatisfaction(
            { ...(enriched.routes[0] ?? distinct.route), overlapPercent: distinct.overlapPercent },
            partitioned.survivingLocks
          )
        )
      }
    } else {
      warnings.push(`${profile} comparison unavailable.`)
    }
    // Shift the window only after the second profile of each pair has been
    // fully processed, and only while the two-alternative cap is still open;
    // acceptance for the current pair is what gates new launches. Both
    // members of the next pair are launched so no profile is ever skipped.
    if (index % 2 === 1 && accepted.length < MAX_ALTERNATIVES && !deadline.aborted) {
      launch(index + 1)
      launch(index + 2)
    }
  }

  return {
    ...tripPlanMetadata(request),
    selectedRouteId: primaryId,
    routes: accepted,
    warnings,
    timingMs: { alternatives: performance.now() - started }
  }
}
