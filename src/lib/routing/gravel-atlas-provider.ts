import type { NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"
import { calculateGravelAtlasRouteEvidence } from "@/lib/roads/gravel-atlas/route-evidence"
import {
  buildAnchorSets,
  corridorEnvelope,
  type CorridorSourceCandidates
} from "./destination-corridors"
import { generateCorridorCandidates } from "./candidate-generator"
import type { GravelAtlasCorridor } from "./gravel-atlas"
import { chooseSelectedCandidate, selectedCandidateScore } from "./planner-shared"
import type { PlanningOptions, RouteProvider, RoutingResult } from "./planner-contract"
import type { GravelAtlasIntensity, PlannedRoute, RouteRequest } from "./types"

export type GravelAtlasCorridorResolver = (
  request: RouteRequest
) => Promise<CorridorSourceCandidates>

const CANDIDATE_LIMIT: Record<GravelAtlasIntensity, number> = {
  balanced: 1,
  more: 2,
  maximum: 3
}

const ENVELOPE_DISTANCE_FACTOR: Record<GravelAtlasIntensity, number> = {
  balanced: 1.2,
  more: 1.45,
  maximum: 1.75
}

const MAX_DISTANCE_RATIO: Record<GravelAtlasIntensity, number> = {
  balanced: 1.3,
  more: 1.55,
  maximum: 1.85
}

const MAX_DURATION_RATIO: Record<GravelAtlasIntensity, number> = {
  balanced: 1.35,
  more: 1.6,
  maximum: 1.9
}

const LOOP_DURATION_TOLERANCE: Record<GravelAtlasIntensity, number> = {
  balanced: 0.15,
  more: 0.2,
  maximum: 0.25
}

const MINIMUM_EVIDENCE_GAIN_METERS: Record<GravelAtlasIntensity, number> = {
  balanced: 800,
  more: 400,
  maximum: 160
}

function atlasEnabled(request: NormalizedRouteRequest): boolean {
  return request.gravelAtlas.enabled === true &&
    (request.profile === "adventure" || request.profile === "gravel") &&
    request.candidateSet !== "alternatives" &&
    !request.segmentProfiles?.length &&
    !request.sketchCorridor?.length
}

function shouldAttractDestination(request: NormalizedRouteRequest): boolean {
  return atlasEnabled(request) &&
    request.points.length === 2 &&
    !request.roundTrip &&
    request.loopTargetMinutes == null &&
    request.targetMinutes == null
}

function shouldAttractRoundTrip(request: NormalizedRouteRequest): boolean {
  return atlasEnabled(request) &&
    request.points.length === 1 &&
    Boolean(request.roundTrip)
}

function atlasOnlySources(
  request: NormalizedRouteRequest,
  sources: CorridorSourceCandidates
): CorridorSourceCandidates {
  return {
    curvatureSegments: [],
    gpxRoutes: [],
    hints: [],
    ...(sources.gravelAtlas ? {
      gravelAtlas: {
        preference: request.gravelAtlas,
        corridors: sources.gravelAtlas.corridors
      }
    } : {})
  }
}

function withAtlasEvidence(route: PlannedRoute, corridors: readonly GravelAtlasCorridor[]): PlannedRoute {
  return {
    ...route,
    gravelAtlasEvidence: calculateGravelAtlasRouteEvidence(route.geometry, corridors)
  }
}

function withResultEvidence(result: RoutingResult, corridors: readonly GravelAtlasCorridor[]): RoutingResult {
  return {
    ...result,
    routes: result.routes.map((route) => withAtlasEvidence(route, corridors))
  }
}

function reasonableDetour(
  candidate: PlannedRoute,
  baseline: PlannedRoute,
  intensity: GravelAtlasIntensity
): boolean {
  if (candidate.routeScore?.accepted === false) return false
  const distanceRatio = candidate.distanceMiles / Math.max(1, baseline.distanceMiles)
  const durationRatio = candidate.durationMinutes / Math.max(1, baseline.durationMinutes)
  return distanceRatio <= MAX_DISTANCE_RATIO[intensity] &&
    durationRatio <= MAX_DURATION_RATIO[intensity]
}

function reasonableLoopDuration(
  candidate: PlannedRoute,
  targetMinutes: number,
  intensity: GravelAtlasIntensity
): boolean {
  if (candidate.routeScore?.accepted === false) return false
  return Math.abs(candidate.durationMinutes - targetMinutes) / Math.max(1, targetMinutes) <=
    LOOP_DURATION_TOLERANCE[intensity]
}

function improvesEvidence(
  candidate: PlannedRoute,
  baseline: PlannedRoute,
  intensity: GravelAtlasIntensity
): boolean {
  const candidateEvidence = candidate.gravelAtlasEvidence
  const baselineEvidence = baseline.gravelAtlasEvidence
  if (!candidateEvidence || !baselineEvidence) return false
  return candidateEvidence.matchedMeters >=
    baselineEvidence.matchedMeters + MINIMUM_EVIDENCE_GAIN_METERS[intensity]
}

interface RoutedAtlasCandidate {
  result: RoutingResult
  route: PlannedRoute
  reward: number
}

function candidateUtility(candidate: RoutedAtlasCandidate): number {
  const evidence = candidate.route.gravelAtlasEvidence
  const verifiedMiles = (evidence?.matchedMeters ?? 0) / 1609.344
  const continuousMiles = (evidence?.longestContinuousMeters ?? 0) / 1609.344
  // Actual returned-route overlap dominates source-anchor reward. Provider-
  // neutral route utility is only a tie-breaker among routes that really use
  // the graph-verified gravel evidence.
  return verifiedMiles * 500 +
    continuousMiles * 250 +
    candidate.reward * 10 +
    selectedCandidateScore(candidate.route)
}

function mergedWarnings(direct: RoutingResult, candidate: RoutingResult): string[] | undefined {
  const warnings = [...new Set([...(direct.warnings ?? []), ...(candidate.warnings ?? [])])]
  return warnings.length > 0 ? warnings : undefined
}

function bestAtlasCandidate(candidates: RoutedAtlasCandidate[]): RoutedAtlasCandidate | undefined {
  return candidates.sort((left, right) =>
    candidateUtility(right) - candidateUtility(left) ||
    left.route.id.localeCompare(right.route.id)
  )[0]
}

/**
 * Add bounded Gravel Atlas attraction without replacing the routing graph.
 * Ordinary A-to-B rides and the first Free Ride loop attempt may use verified
 * source anchors, but every candidate is routed by the normal provider and must
 * prove real returned-route overlap before it may replace the fallback.
 *
 * One wrapper instance is created per HTTP route request. Free Ride's internal
 * seed retries therefore share one source lookup and at most one Atlas shaping
 * pass instead of multiplying external router work on every retry.
 */
export function createGravelAtlasAwareProvider(
  baseProvider: RouteProvider,
  resolveCorridors: GravelAtlasCorridorResolver
): RouteProvider {
  let sourcePromise: Promise<CorridorSourceCandidates> | null = null
  let roundTripAttractionAttempted = false

  const sourcesFor = async (request: NormalizedRouteRequest): Promise<CorridorSourceCandidates> => {
    sourcePromise ??= resolveCorridors(request)
    return atlasOnlySources(request, await sourcePromise)
  }

  return async (
    request: NormalizedRouteRequest,
    options: PlanningOptions = {}
  ): Promise<RoutingResult> => {
    const direct = await baseProvider(request, options)
    const destinationAttraction = shouldAttractDestination(request)
    const roundTripAttraction = shouldAttractRoundTrip(request)
    if (!destinationAttraction && !roundTripAttraction) return direct

    let sources: CorridorSourceCandidates
    try {
      sources = await sourcesFor(request)
    } catch {
      return direct
    }
    const corridors = sources.gravelAtlas?.corridors ?? []
    if (corridors.length === 0) return direct

    const directWithEvidence = withResultEvidence(direct, corridors)
    const baseline = chooseSelectedCandidate(directWithEvidence.routes)
    if (!baseline || baseline.distanceMiles <= 0 || baseline.durationMinutes <= 0) {
      return directWithEvidence
    }

    const intensity = request.gravelAtlas.intensity
    const start = request.points[0]!

    if (roundTripAttraction) {
      if (roundTripAttractionAttempted) return directWithEvidence
      roundTripAttractionAttempted = true
      const targetMinutes = request.roundTrip!.targetMinutes
      const envelope = corridorEnvelope(
        Math.max(baseline.distanceMiles, 1) * ENVELOPE_DISTANCE_FACTOR[intensity]
      )
      const anchorSets = buildAnchorSets(
        [start.lon, start.lat],
        [start.lon, start.lat],
        envelope,
        sources
      ).filter((set) => set.source === "gravel-atlas")
      const { roundTrip: _roundTrip, ...withoutRoundTrip } = request
      void _roundTrip
      const shapedBase: NormalizedRouteRequest = {
        ...withoutRoundTrip,
        points: [start, { ...start }],
        shape: "loop"
      }
      const generated = generateCorridorCandidates(shapedBase, anchorSets, {
        maxCandidates: CANDIDATE_LIMIT[intensity]
      })
      const routed: RoutedAtlasCandidate[] = []
      for (const candidate of generated) {
        if (options.signal?.aborted) break
        try {
          const result = withResultEvidence(
            await baseProvider(candidate.request, options),
            corridors
          )
          const selected = chooseSelectedCandidate(result.routes)
          if (
            !selected ||
            !reasonableLoopDuration(selected, targetMinutes, intensity) ||
            !improvesEvidence(selected, baseline, intensity)
          ) continue
          routed.push({
            result,
            route: { ...selected, candidateSource: "gravel-atlas" },
            reward: candidate.reward
          })
        } catch {
          // A shaped loop that the graph rejects is simply not a candidate.
        }
      }
      const best = bestAtlasCandidate(routed)
      if (!best) return directWithEvidence
      const warnings = mergedWarnings(directWithEvidence, best.result)
      return {
        ...best.result,
        routes: [best.route],
        ...(warnings ? { warnings } : {})
      }
    }

    const finish = request.points[1]!
    const envelope = corridorEnvelope(
      Math.max(baseline.distanceMiles, 1) * ENVELOPE_DISTANCE_FACTOR[intensity]
    )
    const anchorSets = buildAnchorSets(
      [start.lon, start.lat],
      [finish.lon, finish.lat],
      envelope,
      sources
    ).filter((set) => set.source === "gravel-atlas")

    const generated = generateCorridorCandidates(request, anchorSets, {
      maxCandidates: CANDIDATE_LIMIT[intensity]
    })
    if (generated.length === 0) return directWithEvidence

    const routed: RoutedAtlasCandidate[] = []
    for (const candidate of generated) {
      if (options.signal?.aborted) break
      try {
        const result = withResultEvidence(
          await baseProvider(candidate.request, options),
          corridors
        )
        const selected = chooseSelectedCandidate(result.routes)
        if (
          !selected ||
          !reasonableDetour(selected, baseline, intensity) ||
          !improvesEvidence(selected, baseline, intensity)
        ) continue
        routed.push({
          result,
          route: { ...selected, candidateSource: "gravel-atlas" },
          reward: candidate.reward
        })
      } catch {
        // One unroutable Atlas corridor does not invalidate the direct route or
        // other verified candidates.
      }
    }

    const best = bestAtlasCandidate(routed)
    if (!best) return directWithEvidence

    const warnings = mergedWarnings(directWithEvidence, best.result)
    return {
      ...best.result,
      routes: [best.route],
      ...(warnings ? { warnings } : {})
    }
  }
}
