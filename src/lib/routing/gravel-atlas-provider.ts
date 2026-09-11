import type { NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"
import {
  buildAnchorSets,
  corridorEnvelope,
  type CorridorSourceCandidates
} from "./destination-corridors"
import { generateCorridorCandidates } from "./candidate-generator"
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

function shouldAttract(request: NormalizedRouteRequest): boolean {
  return request.gravelAtlas.enabled === true &&
    (request.profile === "adventure" || request.profile === "gravel") &&
    request.candidateSet === "primary" &&
    request.points.length === 2 &&
    !request.roundTrip &&
    request.loopTargetMinutes == null &&
    request.targetMinutes == null &&
    !request.segmentProfiles?.length &&
    !request.sketchCorridor?.length
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

interface RoutedAtlasCandidate {
  result: RoutingResult
  route: PlannedRoute
  reward: number
}

function candidateUtility(candidate: RoutedAtlasCandidate): number {
  // Verified corridor mileage is the attraction signal; provider-neutral route
  // utility breaks ties so a larger Atlas corridor cannot excuse a poor route.
  return candidate.reward * 100 + selectedCandidateScore(candidate.route)
}

function mergedWarnings(direct: RoutingResult, candidate: RoutingResult): string[] | undefined {
  const warnings = [...new Set([...(direct.warnings ?? []), ...(candidate.warnings ?? [])])]
  return warnings.length > 0 ? warnings : undefined
}

/**
 * Add bounded Gravel Atlas attraction to ordinary two-point planning without
 * changing the base provider contract. A normal route is always obtained first
 * and remains the fallback. Atlas data can only contribute soft shaping anchors;
 * the provider still owns legal access, bike compatibility, and connectivity.
 *
 * Destination timeboxes and free-draw requests already have dedicated corridor
 * planners, so this wrapper deliberately leaves them alone rather than creating
 * recursive or competing shaping passes.
 */
export function createGravelAtlasAwareProvider(
  baseProvider: RouteProvider,
  resolveCorridors: GravelAtlasCorridorResolver
): RouteProvider {
  return async (
    request: NormalizedRouteRequest,
    options: PlanningOptions = {}
  ): Promise<RoutingResult> => {
    const direct = await baseProvider(request, options)
    if (!shouldAttract(request)) return direct

    const baseline = chooseSelectedCandidate(direct.routes)
    if (!baseline || baseline.distanceMiles <= 0 || baseline.durationMinutes <= 0) return direct

    let sources: CorridorSourceCandidates
    try {
      sources = atlasOnlySources(request, await resolveCorridors(request))
    } catch {
      return direct
    }
    if (!sources.gravelAtlas || sources.gravelAtlas.corridors.length === 0) return direct

    const start = request.points[0]!
    const finish = request.points[1]!
    const intensity = request.gravelAtlas.intensity
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
    if (generated.length === 0) return direct

    const routed: RoutedAtlasCandidate[] = []
    for (const candidate of generated) {
      if (options.signal?.aborted) break
      try {
        const result = await baseProvider(candidate.request, options)
        const selected = chooseSelectedCandidate(result.routes)
        if (!selected || !reasonableDetour(selected, baseline, intensity)) continue
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

    const best = routed.sort((left, right) =>
      candidateUtility(right) - candidateUtility(left) ||
      left.route.id.localeCompare(right.route.id)
    )[0]
    if (!best) return direct

    return {
      ...best.result,
      routes: [best.route],
      ...(mergedWarnings(direct, best.result)
        ? { warnings: mergedWarnings(direct, best.result) }
        : { warnings: undefined })
    }
  }
}
