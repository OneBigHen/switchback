import type {
  RoadSegmentFeature,
  RouteScore,
  RideProfile
} from "@/lib/domain/contracts"
import { scoreRoute, type RouteScoringContext, type ScoreableRoute } from "./route-score"
import type { PlannedRoute } from "@/lib/routing/types"

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function dominantKey(values: Record<string, number>): string | undefined {
  return Object.entries(values).sort((left, right) => right[1] - left[1])[0]?.[0]
}

/**
 * Bridge the existing provider-normalized route into the provider-neutral
 * scoring seam. GraphHopper detail intervals are intentionally aggregated
 * here because the legacy PlannedRoute wire shape does not yet carry segment
 * IDs; the next feature-tile ingestion slice can replace this with real
 * stable per-road segments without changing scoreRoute.
 */
export function plannedRouteToScoreable(route: PlannedRoute): ScoreableRoute {
  const highwayShare = ((route.roadMix.motorway ?? 0) + (route.roadMix.trunk ?? 0)) / 100
  const secondaryShare = ((route.roadMix.secondary ?? 0) + (route.roadMix.tertiary ?? 0)) / 100
  const urbanShare = ((route.urbanDensityMix?.CITY ?? 0) + (route.urbanDensityMix?.TOWN ?? 0)) / 100
  const curvedShare = route.curvatureDetailShare ?? clamp(route.twistiness / 100)
  const turnDensity = clamp(route.turnCount / Math.max(1, route.distanceMiles * 4))
  const surface = dominantKey(route.surfaceMix)
  const roadClass = dominantKey(route.roadMix)
  const segment: RoadSegmentFeature = {
    segmentId: `${route.id}:aggregate`,
    geometry: [...route.geometry],
    roadClass,
    surface,
    curvature: curvedShare,
    curveDensity: turnDensity,
    curveSeverity: curvedShare,
    headingChangePerKilometer: turnDensity,
    elevationInterest: clamp(((route.ascentMeters ?? 0) + (route.descentMeters ?? 0)) / Math.max(1, route.distanceMiles * 100)),
    scenicProxy: clamp(secondaryShare * 0.7 + (1 - highwayShare) * 0.3),
    trafficPenalty: clamp(highwayShare * 0.65 + urbanShare * 0.35),
    signalDensity: urbanShare,
    stopDensity: urbanShare,
    intersectionDensity: urbanShare,
    urbanDensityPenalty: urbanShare,
    highwayPenalty: highwayShare,
    incidentPenalty: 0,
    gravelSuitability: clamp((route.surfaceMix.gravel ?? 0) / 100 + (route.surfaceMix.unpaved ?? 0) / 100),
    legalAccess: "permitted",
    seasonalAccess: "open",
    familiarity: 0,
    novelty: 0.5,
    dataConfidence: route.routingSource === "live" ? 0.85 : 0.45,
    safetyFlags: [],
    distanceMeters: route.distanceMiles * 1609.344
  }
  return {
    id: route.id,
    geometry: [...route.geometry],
    distanceMeters: route.distanceMiles * 1609.344,
    durationSeconds: route.durationMinutes * 60,
    confidence: route.previewOnly ? 0.4 : 0.85,
    segments: [segment]
  }
}

export function scorePlannedRoute(
  route: PlannedRoute,
  context: Omit<RouteScoringContext, "profile"> & { profile?: RideProfile } = {}
): RouteScore {
  const score = scoreRoute(plannedRouteToScoreable(route), {
    ...context,
    profile: context.profile ?? route.profile
  })
  return score
}
