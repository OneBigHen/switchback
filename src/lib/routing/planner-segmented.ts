import type { NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"
import type { PlannedRoute } from "./types"
import { mergeRouteWarnings, withRoutePolicyWarnings } from "./route-warnings"
import type {
  PlanningOptions,
  RouteCandidateEnricher,
  RouteProvider,
  TripPlan
} from "./planner-contract"
import {
  chooseSelectedCandidate,
  enrichCandidates,
  tripPlanMetadata
} from "./planner-shared"

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

export async function planSegmentedTrip(
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
    const rawResult = await provider({
      ...request,
      profile,
      points: [request.points[index]!, request.points[index + 1]!]
    }, options)
    const result = {
      ...rawResult,
      routes: rawResult.routes.map((route) => withRoutePolicyWarnings(route, request.tollPolicy))
    }
    const selected = chooseSelectedCandidate(result.routes, { tollPolicy: request.tollPolicy })
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
  const totalMiles = Math.max(0.01, distanceMiles)
  const tollEvidence = legs.length > 0 && legs.every((leg) => leg.tollEvidence?.known === true)
    ? {
        known: true,
        tollSharePercent: Number(legs.reduce((sum, leg) => sum +
          (leg.tollEvidence?.tollSharePercent ?? 0) * leg.distanceMiles / totalMiles, 0).toFixed(1))
      }
    : legs.some((leg) => leg.tollEvidence)
      ? { known: false, tollSharePercent: null }
      : undefined
  // Leg-level toll warnings describe each leg's local share. Recompute the
  // policy warning from the weighted composed evidence so the rider sees the
  // percentage for the route they will actually ride.
  const warnings = mergeRouteWarnings(...legs.map((leg) => leg.warnings?.filter((warning) => warning.code !== "toll-exposure")))
  const composedWithoutPolicyWarning: PlannedRoute = {
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
    ...(tollEvidence ? { tollEvidence } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
    avoidHighways: request.avoidHighways,
    avoidAreas: request.avoidAreas?.map((area) => ({ ...area, polygon: [...area.polygon] })),
    segmentProfiles: [...segmentProfiles]
  }
  const composed = withRoutePolicyWarnings(composedWithoutPolicyWarning, request.tollPolicy)
  const enriched = await enrichCandidates(request, [composed], enricher, options)
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
