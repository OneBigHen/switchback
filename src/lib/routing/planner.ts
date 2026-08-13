import type { CandidateSet, Coordinate, PlannedRoute, RouteProfileId, RouteRequest, Waypoint } from "./types"
import { rankDiverseCandidates, routeSimilarity } from "@/lib/recommendation/route-diversity"
import { PA_NJ_ROUTE_POLICY_V1 } from "@/lib/recommendation/route-policy"
import {
  partitionLocksByPrecedence
} from "@/lib/roads/lock-precedence"
import { evaluateRoadLockSatisfaction } from "@/lib/roads/road-locks"
import { normalizeRouteRequest, type NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"
import { evaluateEligibility } from "@/lib/domain/routing/eligibility"
import type { RoadLock } from "@/lib/roads/road-locks"
import {
  buildAnchorSets,
  corridorEnvelope,
  estimateTimeboxBaseline,
  type AnchorSet,
  type CorridorSourceCandidates
} from "./destination-corridors"
import { generateCorridorCandidates, generateLoopCandidates } from "./candidate-generator"
import {
  countStateTransitions,
  minimumStateTransitions,
  routeQualityReport
} from "./route-quality"

export interface TripPlanRequest extends RouteRequest {
  compare?: boolean
  /**
   * Required for `candidateSet: "alternatives"`: the primary route id plus
   * its geometry sampled to at most 128 coordinates. The alternatives
   * endpoint is stateless — it must work after a server cache miss.
   */
  primaryRoute?: { id: string; geometry: Coordinate[] }
}

export interface TripPlan {
  /** Echoed from the request so the client can merge only matching lifecycles. */
  requestId?: string
  planningId?: string
  candidateSet?: CandidateSet
  selectedRouteId: string
  routes: PlannedRoute[]
  warnings: string[]
  /** Destination time target echoed from the request. */
  targetMinutes?: number
  /** Server-side phase timings in milliseconds when measured. */
  timingMs?: Record<string, number>
}

/**
 * Compatibility-first echo of the progressive-API metadata. Later phases
 * (2/3/4) fill the response contract; Phase 1 only guarantees the fields
 * are present on the wire when the request carries them.
 */
function tripPlanMetadata(request: NormalizedRouteRequest): Pick<TripPlan, "planningId" | "candidateSet" | "targetMinutes"> {
  return {
    ...(request.planningId ? { planningId: request.planningId } : {}),
    ...(request.candidateSet ? { candidateSet: request.candidateSet } : {}),
    ...(request.targetMinutes != null ? { targetMinutes: request.targetMinutes } : {})
  }
}

export interface RoutingResult {
  engine: "graphhopper" | "valhalla" | "hybrid"
  engineVersion: string
  routes: PlannedRoute[]
  warnings?: string[]
}

/** Lifecycle-scoped planning options threaded from the API boundary. */
export interface PlanningOptions {
  /** Cancellation signal; aborts provider fetches without a user-visible error. */
  signal?: AbortSignal
  /**
   * Phase 4: resolves corridor sources (curvature database, known-good GPX,
   * research hints) for destination timeboxing. Injected by the API wiring
   * so the planner stays pure; absent sources degrade to an empty set.
   */
  resolveCorridors?: (request: RouteRequest) => Promise<CorridorSourceCandidates>
}

export type RouteProvider = (
  request: NormalizedRouteRequest,
  options?: PlanningOptions
) => Promise<RoutingResult>

export interface RouteCandidateEnrichmentResult {
  routes: PlannedRoute[]
  warnings: string[]
}

export type RouteCandidateEnricher = (
  request: RouteRequest,
  routes: PlannedRoute[]
) => Promise<RouteCandidateEnrichmentResult>

interface TimeboxedProviderResult {
  result: RoutingResult
  warning: string | null
}

const ROUND_TRIP_DURATION_TOLERANCE = 0.15
const MAX_COMPARISON_OVERLAP = 90
/** Alternatives endpoint: at most two meaningfully different routes. */
const MAX_ALTERNATIVES = PA_NJ_ROUTE_POLICY_V1.maxAlternatives
/** Alternatives endpoint: shared 12-second total deadline. */
const ALTERNATIVES_DEADLINE_MS = 12_000
/** Meaningfully different means at most 85% sampled-geometry overlap. */
const ALTERNATIVES_MAX_OVERLAP = PA_NJ_ROUTE_POLICY_V1.duplicateSimilarityThreshold * 100
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

function selectedCandidateScore(route: PlannedRoute): number {
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

function chooseSelectedCandidate(routes: PlannedRoute[]): PlannedRoute | null {
  return routes.filter(route => route.routeScore?.accepted !== false).reduce<PlannedRoute | null>((best, candidate) => {
    if (!best) return candidate
    return selectedCandidateScore(candidate) > selectedCandidateScore(best) ? candidate : best
  }, null)
}

function mergeDistribution(
  routes: PlannedRoute[],
  property: "roadMix" | "surfaceMix"
): Record<string, number> {
  const weighted = new Map<string, number>()
  const totalMiles = routes.reduce((sum, route) => sum + route.distanceMiles, 0)
  if (totalMiles <= 0) return {}
  for (const route of routes) {
    for (const [key, share] of Object.entries(route[property])) {
      weighted.set(key, (weighted.get(key) ?? 0) + share * route.distanceMiles / totalMiles)
    }
  }
  return Object.fromEntries([...weighted.entries()].map(([key, share]) => [key, Number(share.toFixed(2))]))
}

async function planSegmentedTrip(
  request: NormalizedRouteRequest,
  provider: RouteProvider,
  enricher?: RouteCandidateEnricher,
  options: PlanningOptions = {}
): Promise<TripPlan> {
  const segmentProfiles = request.segmentProfiles ?? []
  if (segmentProfiles.length !== request.points.length - 1) {
    throw new Error("Choose one riding style for every route leg.")
  }
  if (request.roundTrip || request.loopTargetMinutes) {
    throw new Error("Per-leg riding styles are available for A-to-B routes, not timeboxed loops.")
  }

  const legs = await Promise.all(segmentProfiles.map(async (profile, index) => {
    // Every leg inherits the full normalized constraint set: bike profile,
    // surface/rough-track policy, toll policy, avoid areas, and surviving
    // road requirements — never just the profile and points (SB-003).
    const result = await provider({
      ...request,
      profile,
      points: [request.points[index]!, request.points[index + 1]!]
    }, options)
    const selected = chooseSelectedCandidate(result.routes)
    if (!selected) throw new Error(`The ${profile} leg returned no route.`)
    return selected
  }))

  let geometry: PlannedRoute["geometry"] = []
  let geometryOffset = 0
  const instructions = legs.flatMap((leg) => {
    const adjusted = leg.instructions.map((instruction) => ({
      ...instruction,
      interval: [instruction.interval[0] + geometryOffset, instruction.interval[1] + geometryOffset] as [number, number]
    }))
    geometry = geometry.length === 0 ? [...leg.geometry] : [...geometry, ...leg.geometry.slice(1)]
    geometryOffset = Math.max(0, geometry.length - 1)
    return adjusted
  })
  const distanceMiles = Number(legs.reduce((sum, leg) => sum + leg.distanceMiles, 0).toFixed(2))
  const durationMinutes = Number(legs.reduce((sum, leg) => sum + leg.durationMinutes, 0).toFixed(2))
  const composed: PlannedRoute = {
    id: `mixed-${legs.map((leg) => leg.id).join("-")}`,
    name: `Custom ${segmentProfiles.map((profile) => profile[0].toUpperCase() + profile.slice(1)).join(" / ")} route`,
    profile: request.profile,
    geometry,
    waypoints: request.points.map((point) => ({ ...point })),
    instructions,
    distanceMiles,
    durationMinutes,
    ascentMeters: legs.some((leg) => leg.ascentMeters == null)
      ? null
      : legs.reduce((sum, leg) => sum + (leg.ascentMeters ?? 0), 0),
    descentMeters: legs.some((leg) => leg.descentMeters == null)
      ? null
      : legs.reduce((sum, leg) => sum + (leg.descentMeters ?? 0), 0),
    twistiness: Number((legs.reduce((sum, leg) => sum + leg.twistiness * leg.distanceMiles, 0) / Math.max(distanceMiles, 0.01)).toFixed(1)),
    turnCount: legs.reduce((sum, leg) => sum + leg.turnCount, 0),
    roadMix: mergeDistribution(legs, "roadMix"),
    surfaceMix: mergeDistribution(legs, "surfaceMix"),
    routingSource: "live",
    previewOnly: false,
    avoidHighways: request.avoidHighways,
    avoidAreas: request.avoidAreas?.map((area) => ({ ...area, polygon: [...area.polygon] })),
    segmentProfiles: [...segmentProfiles]
  }
  const enriched = await enrichCandidates(request, [composed], enricher)
  const selected = enriched.routes[0] ?? composed
  return {
    ...tripPlanMetadata(request),
    selectedRouteId: selected.id,
    routes: [{ ...selected, overlapPercent: 100 }],
    warnings: [
      ...(request.compare ? ["Per-leg riding styles create one deliberate route, so comparison alternatives are hidden."] : []),
      ...enriched.warnings
    ]
  }
}

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

function durationDifference(route: PlannedRoute, targetMinutes: number): number {
  return Math.abs(route.durationMinutes - targetMinutes)
}

function closestDurationCandidate(
  routes: PlannedRoute[],
  targetMinutes: number
): PlannedRoute | null {
  return routes.filter(route => route.routeScore?.accepted !== false).sort((left, right) =>
    durationDifference(left, targetMinutes) - durationDifference(right, targetMinutes) ||
    selectedCandidateScore(right) - selectedCandidateScore(left)
  )[0] ?? null
}

function preserveLoopRequestMetadata(
  route: PlannedRoute,
  request: RouteRequest,
  targetMinutes: number
): PlannedRoute {
  return {
    ...route,
    loopTargetMinutes: targetMinutes,
    avoidHighways: request.avoidHighways
  }
}

async function enrichCandidates(
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

async function requestInitialTimeboxedRoute(
  request: NormalizedRouteRequest,
  provider: RouteProvider,
  options: PlanningOptions = {}
): Promise<RoutingResult> {
  if (!request.roundTrip) return provider(request, options)
  const originalSeed = request.roundTrip.seed ?? 0
  const originalMinutes = Math.max(20, request.roundTrip.targetMinutes ?? 60)
  // A sparse road network cannot always support the full requested loop
  // length (GraphHopper: "Could not find a valid point after 3 tries"),
  // which surfaced to riders as a generic "couldn't be routed" failure.
  // Walk the requested distance down in steps so the rider still gets a
  // loop; the timebox caller warns when the achieved loop is shorter than
  // the target instead of failing outright.
  const distanceSteps = [1, 0.75, 0.5, 0.35, 0.25]
  let lastError: unknown
  for (const step of distanceSteps) {
    const minutes = Math.max(20, Math.round(originalMinutes * step))
    const loopCandidates = generateLoopCandidates({
      ...request,
      roundTrip: { ...request.roundTrip, targetMinutes: minutes, seed: originalSeed }
    }, { maxCandidates: 7 })
    for (const candidate of loopCandidates) {
      try {
        return await provider(candidate.request, options)
      } catch (caught) {
        lastError = caught
      }
    }
  }
  throw lastError
}

async function requestTimeboxedRoutes(
  request: NormalizedRouteRequest,
  provider: RouteProvider,
  enricher?: RouteCandidateEnricher,
  options: PlanningOptions = {}
): Promise<TimeboxedProviderResult> {
  const initial = await requestInitialTimeboxedRoute(request, provider, options)
  const roundTrip = request.roundTrip
  const targetMinutes = roundTrip?.targetMinutes ?? request.loopTargetMinutes
  if (!targetMinutes) {
    const enriched = await enrichCandidates(request, initial.routes, enricher)
    return {
      result: { ...initial, routes: enriched.routes },
      warning: [...(initial.warnings ?? []), ...enriched.warnings].join(" ") || null
    }
  }

  const initialCandidate = closestDurationCandidate(initial.routes, targetMinutes)
  if (!initialCandidate) {
    return { result: initial, warning: initial.warnings?.join(" ") || null }
  }
  const relativeError = durationDifference(initialCandidate, targetMinutes) / targetMinutes
  // Adventure loops explore several time-matched seeds for gravel-rich
  // variety even when the first seed already meets the timebox; this stays
  // within the primary candidate budget and never waits on enrichment.
  const exploreAdventureAlternatives = Boolean(
    roundTrip && request.profile === "adventure"
  )
  if (relativeError <= ROUND_TRIP_DURATION_TOLERANCE && !exploreAdventureAlternatives) {
    const enriched = await enrichCandidates(request, [initialCandidate], enricher)
    return {
      result: {
        ...initial,
        routes: enriched.routes.map((route) => preserveLoopRequestMetadata(route, request, targetMinutes))
      },
      warning: [...(initial.warnings ?? []), ...enriched.warnings].join(" ") || null
    }
  }
  if (!roundTrip) {
    const enriched = await enrichCandidates(request, initial.routes, enricher)
    const closest = closestDurationCandidate(enriched.routes, targetMinutes) ?? initialCandidate
    return {
      result: {
        ...initial,
        routes: [preserveLoopRequestMetadata(closest, request, targetMinutes)]
      },
      warning: [
        `${request.profile} loop is ${Math.round(closest.durationMinutes)} minutes; fixed shaping stops miss the ${targetMinutes}-minute target.`,
        ...(initial.warnings ?? []),
        ...enriched.warnings
      ].join(" ")
    }
  }

  // GraphHopper's round-trip distance is intentionally approximate and custom
  // road preferences can amplify the miss. Feed the measured duration back
  // into the distance estimate, then sample nearby seeds to avoid a
  // single pathological loop topology.
  const adjustedMinutes = Math.max(20, Math.min(
    480,
    relativeError <= ROUND_TRIP_DURATION_TOLERANCE
      ? targetMinutes
      : Math.round(targetMinutes * targetMinutes / Math.max(1, initialCandidate.durationMinutes))
  ))
  const retryIndexes = relativeError <= ROUND_TRIP_DURATION_TOLERANCE
    ? [1, 2, 3]
    : [0, 1, 2]
  const retries = await Promise.allSettled(
    retryIndexes.map((index) => requestInitialTimeboxedRoute({
      ...request,
      roundTrip: {
        ...roundTrip,
        targetMinutes: adjustedMinutes,
        seed: (roundTrip.seed ?? 0) + index * 101,
        heading: ((roundTrip.heading ?? 0) + index * 73) % 360
      }
    }, provider, options))
  )
  const candidates = [
    ...initial.routes,
    ...retries.flatMap((retry) => retry.status === "fulfilled" ? retry.value.routes : [])
  ]
  let closest = closestDurationCandidate(candidates, targetMinutes) ?? initialCandidate
  let remainingError = durationDifference(closest, targetMinutes) / targetMinutes
  let feedbackMinutes = adjustedMinutes
  for (let attempt = 0; attempt < 2 && remainingError > ROUND_TRIP_DURATION_TOLERANCE; attempt += 1) {
    const finalAdjustedMinutes = Math.max(20, Math.min(480, Math.round(
      feedbackMinutes * targetMinutes / Math.max(1, closest.durationMinutes)
    )))
    if (finalAdjustedMinutes === feedbackMinutes) break
    feedbackMinutes = finalAdjustedMinutes
    try {
      const finalAttempt = await requestInitialTimeboxedRoute({
        ...request,
        roundTrip: {
          ...roundTrip,
          targetMinutes: finalAdjustedMinutes
        }
      }, provider, options)
      candidates.push(...finalAttempt.routes)
      closest = closestDurationCandidate(candidates, targetMinutes) ?? closest
      remainingError = durationDifference(closest, targetMinutes) / targetMinutes
    } catch {
      // The best earlier candidate remains usable and will carry a warning.
      break
    }
  }
  const bestDifference = durationDifference(closest, targetMinutes)
  const contenderDifference = Math.max(
    targetMinutes * ROUND_TRIP_DURATION_TOLERANCE,
    bestDifference + 5
  )
  const contenders = candidates
    .filter((candidate) => durationDifference(candidate, targetMinutes) <= contenderDifference)
    .sort((left, right) =>
      durationDifference(left, targetMinutes) - durationDifference(right, targetMinutes)
    )
    .slice(0, 4)
  const enriched = await enrichCandidates(request, contenders, enricher)
  const timeMatchedCandidates = enriched.routes.filter((candidate) =>
    durationDifference(candidate, targetMinutes) / targetMinutes <= ROUND_TRIP_DURATION_TOLERANCE
  )
  closest = timeMatchedCandidates.length > 0
    ? chooseSelectedCandidate(timeMatchedCandidates) ?? closest
    : closestDurationCandidate(enriched.routes, targetMinutes) ?? closest
  remainingError = durationDifference(closest, targetMinutes) / targetMinutes
  const warning = remainingError > ROUND_TRIP_DURATION_TOLERANCE
    ? `${request.profile} loop is ${Math.round(closest.durationMinutes)} minutes; the road network could not safely match the ${targetMinutes}-minute target more closely.`
    : null
  return {
    result: {
      ...initial,
      routes: [preserveLoopRequestMetadata(closest, request, targetMinutes)]
    },
    warning: [warning, ...(initial.warnings ?? []), ...enriched.warnings].filter(Boolean).join(" ") || null
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

interface RoadLockPartitionResult {
  /** Request carrying only the locks that survived precedence. */
  request: NormalizedRouteRequest
  /** Surviving locks, used by the planner to attach per-candidate satisfaction. */
  survivingLocks: RoadLock[]
  /** Warnings explaining why each blocked lock was skipped. */
  warnings: string[]
}

/**
 * Partition the request's road locks by precedence. Blocked locks are
 * surfaced as warnings (never silently dropped); only surviving locks
 * are forwarded to the routing provider. The bike profile is preserved
 * on the submission request so GraphHopper still translates it into
 * custom_model rules.
 */
function partitionLocksForRequest(request: NormalizedRouteRequest): RoadLockPartitionResult {
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
function ensureLockSatisfaction(
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
 * Phase 4 destination timebox: shape the primary A-to-B route so it lands
 * inside the requested duration instead of selecting an arbitrary provider
 * alternative. Direct baseline first; bounded corridor envelope; at most four
 * candidates; at most one refinement pass; hard gates then maximum-twisties
 * score. A direct route already inside ±10% is returned as-is.
 */
async function planDestinationTimebox(
  request: NormalizedRouteRequest,
  provider: RouteProvider,
  options: PlanningOptions = {}
): Promise<TripPlan> {
  const started = performance.now()
  const targetMinutes = request.targetMinutes!
  const start = request.points[0]!
  const finish = request.points[request.points.length - 1]!
  const startCoord: Coordinate = [start.lon, start.lat]
  const finishCoord: Coordinate = [finish.lon, finish.lat]
  const baselinePoints: Waypoint[] = [start, finish]

  const baselineAttempt = await requestTimeboxedRoutes(
    { ...request, points: baselinePoints },
    provider,
    undefined,
    options
  )
  const baseline = chooseSelectedCandidate(baselineAttempt.result.routes)
  if (!baseline) throw new Error("The selected profile returned no routes")

  const feasibility = estimateTimeboxBaseline(baseline.durationMinutes, baseline.distanceMiles, targetMinutes)
  if (!feasibility.feasible) {
    return {
      ...tripPlanMetadata(request),
      selectedRouteId: baseline.id,
      routes: [baseline],
      warnings: [
        `The direct ${request.profile} route is ${baseline.durationMinutes} minutes, which already exceeds the ${targetMinutes}-minute target; no scenic detour can shorten it.`,
        ...(baselineAttempt.warning ? [baselineAttempt.warning] : [])
      ],
      timingMs: { primary: performance.now() - started }
    }
  }
  if (Math.abs(baseline.durationMinutes - targetMinutes) / targetMinutes <= 0.1) {
    return {
      ...tripPlanMetadata(request),
      selectedRouteId: baseline.id,
      routes: [baseline],
      warnings: [...(baselineAttempt.warning ? [baselineAttempt.warning] : [])],
      timingMs: { primary: performance.now() - started }
    }
  }

  const deadline: AbortSignal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(PRIMARY_CORRIDOR_DEADLINE_MS)])
    : AbortSignal.timeout(PRIMARY_CORRIDOR_DEADLINE_MS)
  const corridorOptions = { ...options, signal: deadline }

  let envelope = corridorEnvelope(feasibility.estimatedTargetDistanceMiles)
  let anchorSets = await resolveAnchorSets(request, options, startCoord, finishCoord, envelope)
  let candidates = await routeAnchorSets(request, provider, anchorSets, corridorOptions)

  // One refinement pass: when every candidate misses the target, re-derive
  // the envelope from the best measured duration and re-route it once.
  const inTolerance = (route: PlannedRoute) =>
    Math.abs(route.durationMinutes - targetMinutes) / targetMinutes <= 0.1
  if (candidates.length > 0 && !candidates.some(inTolerance)) {
    const best = closestDurationCandidate(candidates, targetMinutes)
    if (best) {
      const refinedBaseline = estimateTimeboxBaseline(best.durationMinutes, best.distanceMiles, targetMinutes)
      envelope = corridorEnvelope(refinedBaseline.estimatedTargetDistanceMiles)
      anchorSets = await resolveAnchorSets(request, options, startCoord, finishCoord, envelope)
      const refined = await routeAnchorSets(request, provider, anchorSets, corridorOptions)
      if (refined.length > 0) candidates = refined
    }
  }

  const partitioned = partitionLocksForRequest(request)
  const withLocks = (route: PlannedRoute) =>
    ensureLockSatisfaction({ ...route, overlapPercent: 100 }, partitioned.survivingLocks)

  const scored = candidates.map((route) => ({
    route: withLocks(route),
    report: routeQualityReport({
      route,
      targetMinutes,
      start: startCoord,
      finish: finishCoord,
      tollPolicy: request.tollPolicy ?? "allow-with-warning",
      stateTransitions: countStateTransitions(route.geometry),
      minimumStateTransitions: minimumStateTransitions(startCoord, finishCoord),
      evidenceMiles: anchorSets.find((set) => set.label === route.name)?.evidenceMiles ?? 0
    })
  }))

  const passing = scored
    .filter((entry) => entry.report.passedGates)
    .sort((left, right) => right.report.score - left.report.score)

  if (passing.length > 0) {
    const best = passing[0]!
    return {
      ...tripPlanMetadata(request),
      selectedRouteId: best.route.id,
      routes: [best.route],
      warnings: [
        ...partitioned.warnings,
        ...(baselineAttempt.warning ? [baselineAttempt.warning] : []),
        ...best.report.explanation
      ],
      timingMs: { primary: performance.now() - started }
    }
  }

  // No candidate passed every gate: return the eligible direct baseline with
  // honest feasibility wording. A shaped candidate that failed quality gates
  // must never be selected or described as safe (SB-004).
  const gateFailures = scored.length > 0 ? scored[0]!.report.failures : {}
  const gateSummary = Object.values(gateFailures).join(" ")
  return {
    ...tripPlanMetadata(request),
    selectedRouteId: baseline.id,
    routes: [baseline],
    warnings: [
      ...partitioned.warnings,
      gateSummary
        ? `No shaped route passed the quality gates (${gateSummary}); returning the direct route (${baseline.durationMinutes} min).`
        : `No shaped route met the ${targetMinutes}-minute target; returning the direct route (${baseline.durationMinutes} min).`
    ],
    timingMs: { primary: performance.now() - started }
  }
}

const PRIMARY_CORRIDOR_DEADLINE_MS = 6_000
const MAX_CONCURRENT_CORRIDOR_ROUTES = 2

async function resolveAnchorSets(
  request: NormalizedRouteRequest,
  options: PlanningOptions,
  start: Coordinate,
  finish: Coordinate,
  envelope: { maxPathDistanceMiles: number; maxLateralMiles: number }
): Promise<AnchorSet[]> {
  const sources = options.resolveCorridors
    ? await options.resolveCorridors(request).catch(() => emptyCorridorSources())
    : emptyCorridorSources()
  return buildAnchorSets(start, finish, envelope, sources)
}

function emptyCorridorSources(): CorridorSourceCandidates {
  return { curvatureSegments: [], gpxRoutes: [], hints: [] }
}

async function routeAnchorSets(
  request: NormalizedRouteRequest,
  provider: RouteProvider,
  anchorSets: AnchorSet[],
  options: PlanningOptions
): Promise<PlannedRoute[]> {
  const results: PlannedRoute[] = []
  const candidates = generateCorridorCandidates(request, anchorSets, { maxCandidates: 4 })
  let cursor = 0
  // Concurrency at most two provider calls at once.
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT_CORRIDOR_ROUTES, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor]!
      cursor += 1
      if (options.signal?.aborted) return
      try {
        const attempt = await requestTimeboxedRoutes(candidate.request, provider, undefined, options)
        const selected = chooseSelectedCandidate(attempt.result.routes)
        if (selected) results.push({ ...selected, name: `${selected.name} · ${candidate.id}`, candidateSource: candidate.source })
      } catch {
        // A corridor that cannot be routed is skipped; the others still compete.
      }
    }
  })
  await Promise.all(workers)
  return results
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
  const pending = new Map<number, Promise<TimeboxedProviderResult | null>>()
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
    if (result) {
      if (result.warning) warnings.push(result.warning)
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
