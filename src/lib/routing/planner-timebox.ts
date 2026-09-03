import type { NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"
import type { Coordinate, PlannedRoute, RouteRequest, Waypoint } from "./types"
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
import type {
  PlanningOptions,
  RouteCandidateEnricher,
  RouteProvider,
  RoutingResult,
  TripPlan
} from "./planner-contract"
import {
  chooseSelectedCandidate,
  ensureLockSatisfaction,
  enrichCandidates,
  partitionLocksForRequest,
  selectedCandidateScore,
  tripPlanMetadata
} from "./planner-shared"

const ROUND_TRIP_DURATION_TOLERANCE = 0.15

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

interface TimeboxedProviderResult {
  result: RoutingResult
  warning: string | null
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
  // loop; the timebox caller warns when the achieved loop is shorter than the
  // target instead of failing outright.
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

export async function requestTimeboxedRoutes(
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

/**
 * Phase 4 destination timebox: shape the primary A-to-B route so it lands
 * inside the requested duration instead of selecting an arbitrary provider
 * alternative. Direct baseline first; bounded corridor envelope; at most four
 * candidates; at most one refinement pass; hard gates then maximum-twisties
 * score. A direct route already inside ±10% is returned as-is.
 */
export async function planDestinationTimebox(
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
        if (selected) results.push({ ...selected, candidateSource: candidate.source })
      } catch {
        // A corridor that cannot be routed is skipped; the others still compete.
      }
    }
  })
  await Promise.all(workers)
  return results
}
