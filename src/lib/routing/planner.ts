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
import {
  CORRIDOR_OPTION_PRESENTATION,
  corridorAdherence,
  corridorShapingAnchors,
  sketchCorridorContext,
  type CorridorAdherence,
  type CorridorOptionRole,
  type CorridorScoringContext
} from "./sketch-corridor"
import type { Waypoint } from "./types"
import type { RoadLockPartitionResult } from "./planner-shared"

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

/**
 * Free-draw option set. A stroke is intent, so the options differ in how
 * literally they read it — not merely in riding profile. `anchors` is how many
 * interior shaping points the engine is handed: more anchors pin the drawn line
 * harder, fewer let the router find better roads inside the same corridor.
 *
 * Ordered; the first accepted candidate per role wins, so the later entries are
 * fallbacks for when an earlier variant fails or duplicates the primary.
 */
interface CorridorVariant {
  role: CorridorOptionRole
  anchors: number
  profile: RouteProfileId
}

function corridorVariants(profile: RouteProfileId): CorridorVariant[] {
  const fun: RouteProfileId = profile === "twisty" ? "scenic" : "twisty"
  const secondFun: RouteProfileId = profile === "scenic" || fun === "scenic" ? "avoid-highways" : "scenic"
  const lean: RouteProfileId = profile === "quick" ? "balanced" : "quick"
  return [
    { role: "better-roads", anchors: 3, profile: fun },
    { role: "leaner", anchors: 1, profile: lean },
    { role: "better-roads", anchors: 2, profile: secondFun },
    { role: "leaner", anchors: 1, profile: "balanced" }
  ]
}

/**
 * The candidate's measured fit against the drawn stroke. Providers already
 * attach it while scoring; recomputing it here is the fallback for injected
 * providers and cached routes that predate provider-side attachment — the same
 * compatibility seam `selectedCandidateScore` keeps.
 */
function attachedCorridorFit(
  route: PlannedRoute,
  corridor: CorridorScoringContext
): CorridorAdherence {
  return route.routeScore?.corridorFit
    ?? corridorAdherence(route.geometry, corridor.samples, corridor.envelopeMeters)
}

function corridorWaypoint(coordinate: [number, number], index: number): Waypoint {
  return {
    lat: Number(coordinate[1].toFixed(6)),
    lon: Number(coordinate[0].toFixed(6)),
    label: `Corridor anchor ${index + 1}`
  }
}

/**
 * Build one variant's provider request from the corridor rather than from the
 * sketch's original hard vias. Endpoints are always the rider's: only the
 * shaping points in between are relaxed.
 */
function corridorVariantRequest(
  request: NormalizedRouteRequest,
  variant: CorridorVariant,
  index: number
): NormalizedRouteRequest | null {
  const corridor = request.sketchCorridor ?? []
  const start = request.points[0]
  if (!start) return null
  // A seeded round trip carries one point and cannot take shaping vias; vary
  // the loop's own seed instead so the option is still a different loop.
  if (request.roundTrip) return variedComparisonRequest(request, variant.profile, index)

  const isLoop = request.loopTargetMinutes != null
  // A shaped loop must return to its start and needs at least one interior
  // point to be a loop at all.
  const anchorCount = isLoop ? Math.max(1, variant.anchors) : variant.anchors
  const anchors = corridorShapingAnchors(corridor, anchorCount).map(corridorWaypoint)
  const finish = isLoop ? start : request.points.at(-1)
  if (!finish) return null
  return {
    ...request,
    profile: variant.profile,
    points: [start, ...anchors, finish],
    // Comparison variants are never timeboxed: the destination time target
    // would re-apply the heavy corridor factor and slow every option down.
    targetMinutes: undefined
  }
}

/**
 * Alternatives for a free-draw stroke. The stroke is a *soft* corridor: rather
 * than re-running comparison profiles against six pinned vias — which collapse
 * every candidate onto one line and yield zero alternatives — each option
 * re-reads the corridor at a different adherence level and scores the result
 * against the drawing (see sketch-corridor.ts).
 */
async function planCorridorAlternatives(
  request: NormalizedRouteRequest,
  corridor: CorridorScoringContext,
  primaryAnchor: PlannedRoute,
  deadline: AbortSignal,
  provider: RouteProvider,
  enricher: RouteCandidateEnricher | undefined,
  partitioned: RoadLockPartitionResult
): Promise<{ routes: PlannedRoute[]; warnings: string[] }> {
  const variants = corridorVariants(request.profile)
  const accepted: PlannedRoute[] = []
  const warnings: string[] = []
  const filledRoles = new Set<CorridorOptionRole>()

  const attempt = (index: number): Promise<Awaited<ReturnType<typeof requestTimeboxedRoutes>> | null> | null => {
    const variant = variants[index]
    if (!variant) return null
    const variantRequest = corridorVariantRequest(request, variant, index)
    if (!variantRequest) return null
    return requestTimeboxedRoutes(variantRequest, provider, undefined, { signal: deadline })
      .then((result) => result, () => null)
  }

  // Two variants in flight at a time, accepted strictly in order — the same
  // bounded concurrency the profile comparison path uses.
  const pending = new Map<number, ReturnType<typeof attempt>>()
  pending.set(0, attempt(0))
  pending.set(1, attempt(1))
  for (let index = 0; index < variants.length && accepted.length < MAX_ALTERNATIVES && !deadline.aborted; index += 1) {
    const variant = variants[index]!
    const label = CORRIDOR_OPTION_PRESENTATION[variant.role].label
    const result = await pending.get(index)
    if (index % 2 === 1 && accepted.length < MAX_ALTERNATIVES && !deadline.aborted) {
      if (!pending.has(index + 1)) pending.set(index + 1, attempt(index + 1))
      if (!pending.has(index + 2)) pending.set(index + 2, attempt(index + 2))
    }
    // One option per role: later variants for a filled role are fallbacks only.
    if (filledRoles.has(variant.role)) continue
    if (!result) {
      warnings.push(`${label} option unavailable.`)
      continue
    }
    if (result.warning) warnings.push(result.warning)
    const eligible = result.result.routes.filter((route) => {
      const report = evaluateEligibility(route)
      if (!report.eligible) warnings.push(`${label} option skipped: ${report.failures[0]?.message}`)
      return report.eligible
    })
    const distinct = chooseDistinctCandidate(
      eligible,
      [...accepted, primaryAnchor],
      ALTERNATIVES_MAX_OVERLAP,
      true
    )
    if (!distinct) {
      warnings.push(`${label} matched the traced route too closely to offer.`)
      continue
    }
    const enriched = await enrichCandidates(request, [distinct.route], enricher)
    warnings.push(...enriched.warnings)
    const chosen = enriched.routes[0] ?? distinct.route
    filledRoles.add(variant.role)
    accepted.push(ensureLockSatisfaction({
      ...chosen,
      name: label,
      overlapPercent: distinct.overlapPercent,
      corridorOption: variant.role,
      corridorAdherence: attachedCorridorFit(chosen, corridor)
    }, partitioned.survivingLocks))
  }
  return { routes: accepted, warnings }
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

  // A stroke-driven primary is the "Traced" option by definition; naming it so
  // here means the option set reads as one family instead of one route plus
  // two strangers.
  const primaryCorridor = sketchCorridorContext(request.sketchCorridor)
  const traced = primaryCorridor
    ? {
        ...selected,
        name: CORRIDOR_OPTION_PRESENTATION.traced.label,
        corridorOption: "traced" as const,
        corridorAdherence: attachedCorridorFit(selected, primaryCorridor)
      }
    : selected
  const routes: PlannedRoute[] = [
    ensureLockSatisfaction({ ...traced, overlapPercent: 100 }, partitioned.survivingLocks)
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
  const corridor = sketchCorridorContext(request.sketchCorridor)
  const hasCorridor = corridor !== undefined
  // A drawn stroke is answerable in every shape — including loops, where the
  // corridor varies the loop itself rather than only the riding profile. The
  // profile-comparison path still only makes sense point-to-point.
  if (!hasCorridor && (request.roundTrip || request.loopTargetMinutes || request.segmentProfiles?.length)) {
    return {
      ...tripPlanMetadata(request),
      selectedRouteId: primaryId,
      routes: [],
      warnings: ["Alternatives are only available for point-to-point destination rides."],
      timingMs: { alternatives: performance.now() - started }
    }
  }
  if (hasCorridor && request.segmentProfiles?.length) {
    return {
      ...tripPlanMetadata(request),
      selectedRouteId: primaryId,
      routes: [],
      warnings: ["Free-draw options are unavailable while each leg has its own riding style."],
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
  if (corridor) {
    const corridorPlan = await planCorridorAlternatives(
      request,
      corridor,
      primaryAnchor,
      deadline,
      provider,
      enricher,
      partitioned
    )
    return {
      ...tripPlanMetadata(request),
      selectedRouteId: primaryId,
      routes: corridorPlan.routes,
      warnings: [...partitioned.warnings, ...corridorPlan.warnings],
      timingMs: { alternatives: performance.now() - started }
    }
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
