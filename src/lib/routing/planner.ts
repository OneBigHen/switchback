import type { CandidateSet, Coordinate, PlannedRoute, RouteRequest } from "./types"
import { calculateGeometryOverlap } from "./scoring"
import { listProfiles } from "./profiles"
import {
  partitionLocksByPrecedence
} from "@/lib/roads/lock-precedence"
import { evaluateRoadLockSatisfaction } from "@/lib/roads/road-locks"
import type { RoadLock } from "@/lib/roads/road-locks"

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
function tripPlanMetadata(request: TripPlanRequest): Pick<TripPlan, "planningId" | "candidateSet" | "targetMinutes"> {
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
}

export type RouteProvider = (
  request: RouteRequest,
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
const MAX_ALTERNATIVES = 2
/** Alternatives endpoint: shared 12-second total deadline. */
const ALTERNATIVES_DEADLINE_MS = 12_000
/** Meaningfully different means at most 85% sampled-geometry overlap. */
const ALTERNATIVES_MAX_OVERLAP = 85
// Native round trips can select an unroutable synthetic waypoint for a given
// seed. These spread-out fallbacks keep a rider's requested seed first, while
// giving the engine several independent loop shapes before we drop an option.
const ROUND_TRIP_FALLBACK_SEEDS = [341, 1_523, 7_919, 19_937, 65_537, 131_071]

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
  const road = route.roadMix
  switch (route.profile) {
    case "quick":
      return -route.durationMinutes
    case "twisty":
      return route.twistiness * 2 + (route.turnCount / Math.max(1, route.distanceMiles)) * 20
    case "scenic":
      return (road.secondary ?? 0) * 1.2 + (road.tertiary ?? 0) +
        (road.unclassified ?? 0) * 0.7 - (road.motorway ?? 0) * 4 - (road.trunk ?? 0) * 3
    case "adventure":
      // Surface data comes from GraphHopper's OSM details. Give mapped gravel
      // enough influence to win even when it adds meaningful ride time.
      return unpavedShare(route) * 6 +
        (route.officialUnpavedEvidence?.sharePercent ?? 0) * 8 +
        route.twistiness * 0.25 - route.durationMinutes * 0.08
  }
}

function chooseSelectedCandidate(routes: PlannedRoute[]): PlannedRoute | null {
  return routes.reduce<PlannedRoute | null>((best, candidate) => {
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
  request: TripPlanRequest,
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
    const result = await provider({
      profile,
      points: [request.points[index]!, request.points[index + 1]!],
      avoidHighways: request.avoidHighways,
      avoidAreas: request.avoidAreas
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
  if (candidates.length === 0) return null
  const ranked = candidates.map((route) => {
      const overlaps = existing.map((current) =>
        calculateGeometryOverlap(current.geometry, route.geometry)
      )
      return {
        route,
        overlapPercent: overlaps[0] ?? 0,
        worstOverlap: Math.max(0, ...overlaps)
      }
    })
  const differentiated = ranked.filter((candidate) => candidate.worstOverlap <= maxOverlap)
  const pool = strict
    ? differentiated
    : differentiated.length > 0 ? differentiated : ranked
  if (pool.length === 0) return null
  return pool.sort((left, right) =>
      left.route.profile === "adventure" && right.route.profile === "adventure"
        ? selectedCandidateScore(right.route) - selectedCandidateScore(left.route) ||
          left.worstOverlap - right.worstOverlap
        :
      left.worstOverlap - right.worstOverlap ||
      left.route.durationMinutes - right.route.durationMinutes
    )[0]
}

function durationDifference(route: PlannedRoute, targetMinutes: number): number {
  return Math.abs(route.durationMinutes - targetMinutes)
}

function closestDurationCandidate(
  routes: PlannedRoute[],
  targetMinutes: number
): PlannedRoute | null {
  return [...routes].sort((left, right) =>
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
  request: RouteRequest,
  provider: RouteProvider,
  options: PlanningOptions = {}
): Promise<RoutingResult> {
  if (!request.roundTrip) return provider(request, options)
  const originalSeed = request.roundTrip.seed ?? 0
  let lastError: unknown
  const seedCandidates = [originalSeed, ...ROUND_TRIP_FALLBACK_SEEDS]
    .filter((seed, index, seeds) => seeds.indexOf(seed) === index)
  for (const seed of seedCandidates) {
    try {
      return await provider(seed === originalSeed ? request : {
        ...request,
        roundTrip: { ...request.roundTrip, seed }
      }, options)
    } catch (caught) {
      lastError = caught
    }
  }
  throw lastError
}

async function requestTimeboxedRoutes(
  request: RouteRequest,
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
  request: TripPlanRequest,
  profile: RouteRequest["profile"],
  index: number
): RouteRequest {
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
  request: TripPlanRequest
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
function partitionLocksForRequest(request: TripPlanRequest): RoadLockPartitionResult {
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
    request: {
      ...requestWithoutLocks,
      ...(partition.surviving.length > 0 ? { roadLocks: partition.surviving } : {})
    },
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
  if (request.candidateSet === "alternatives") {
    return planAlternativeRoutes(request, provider, enricher, options)
  }
  return planPrimaryRoute(request, provider, options)
}

/**
 * Primary path: one selected route for the requested profile. Comparison
 * profiles, PASDA evidence, and elevation enrichment never delay the first
 * usable route — they belong to the separate alternatives/evidence call.
 */
async function planPrimaryRoute(
  request: TripPlanRequest,
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
  request: TripPlanRequest,
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
  const profiles = listProfiles()
    .map((profile) => profile.id)
    .filter((profile) => profile !== request.profile)

  for (const profile of profiles) {
    if (accepted.length >= MAX_ALTERNATIVES || deadline.aborted) break
    try {
      const result = await requestTimeboxedRoutes(
        variedComparisonRequest(request, profile, 0),
        provider,
        undefined,
        { signal: deadline }
      )
      if (result.warning) warnings.push(result.warning)
      const enrichedCandidates = await enrichCandidates(request, result.result.routes, enricher)
      warnings.push(...enrichedCandidates.warnings)
      const distinct = chooseDistinctCandidate(
        enrichedCandidates.routes,
        [...accepted, primaryAnchor],
        ALTERNATIVES_MAX_OVERLAP,
        true
      )
      if (!distinct) {
        warnings.push(`Dropped duplicate ${profile} route.`)
        continue
      }
      accepted.push(
        ensureLockSatisfaction(
          { ...distinct.route, overlapPercent: distinct.overlapPercent },
          partitioned.survivingLocks
        )
      )
    } catch {
      warnings.push(`${profile} comparison unavailable.`)
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
