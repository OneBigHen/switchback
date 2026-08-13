import type {
  RoadSegmentFeature,
  RideProfile
} from "@/lib/domain/contracts"
import {
  intrinsicFeatureCoverage,
  unknownFeatureProvenance,
  type IntrinsicFeatureProvenanceMap
} from "@/lib/roads/intrinsic-features"
import { scoreRoute, type RouteScoringContext, type RouteScoreResult, type ScoreableRoute } from "./route-score"
import type { PlannedRoute } from "@/lib/routing/types"

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function dominantKey(values: Record<string, number>): string | undefined {
  return Object.entries(values).sort((left, right) => right[1] - left[1])[0]?.[0]
}

export function featureProvenanceForPlannedRoute(route: PlannedRoute): IntrinsicFeatureProvenanceMap {
  const provider = route.provider ?? "unavailable"
  const liveProvider = route.routingSource === "live" && route.provider !== undefined
  const providerLimitations = ["Provider detail describes the returned route, not a field survey."]
  return {
    surface: Object.keys(route.surfaceMix).length > 0
      ? {
          source: provider,
          dataset: "routing path surface detail",
          ...(route.providerVersion ? { version: route.providerVersion } : {}),
          coverage: "complete",
          limitations: providerLimitations
        }
      : unknownFeatureProvenance("No segment-level road-surface detail was supplied."),
    access: liveProvider
      ? {
          source: provider,
          dataset: "motorcycle route eligibility",
          ...(route.providerVersion ? { version: route.providerVersion } : {}),
          coverage: "partial",
          limitations: ["A successful route is not a tag-level legal-access determination."]
        }
      : unknownFeatureProvenance("No current segment-level access authority was supplied."),
    curvature: route.curvatureDetailShare !== undefined
      ? {
          source: provider,
          dataset: "routing path curvature detail",
          ...(route.providerVersion ? { version: route.providerVersion } : {}),
          coverage: "complete",
          limitations: providerLimitations
        }
      : {
          source: "switchback-geometry",
          dataset: "returned route geometry",
          coverage: "complete",
          limitations: ["Heuristic bend analysis; not ground-truthed road character."]
        },
    elevation: route.ascentMeters !== null || route.descentMeters !== null
      ? {
          source: liveProvider ? provider : "gpx-track",
          dataset: liveProvider ? "routing path elevation" : "recorded GPX elevation",
          ...(route.providerVersion ? { version: route.providerVersion } : {}),
          coverage: "partial",
          limitations: ["Only reported elevation samples are represented; no missing samples were invented."]
        }
      : unknownFeatureProvenance("No elevation samples were supplied."),
    flow: Object.keys(route.roadEnvironmentMix ?? {}).length > 0 || Object.keys(route.urbanDensityMix ?? {}).length > 0
      ? {
          source: provider,
          dataset: "routing road-environment and urban-density detail",
          ...(route.providerVersion ? { version: route.providerVersion } : {}),
          coverage: "partial",
          limitations: ["Mapped context, not live traffic or a complete signal/stop inventory."]
        }
      : unknownFeatureProvenance("No flow or traffic-control detail was supplied."),
    mvum: unknownFeatureProvenance("No official MVUM segment evidence is attached to this route.")
  }
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
  const featureProvenance = route.featureProvenance ?? featureProvenanceForPlannedRoute(route)
  const hasRoadClassEvidence = Object.keys(route.roadMix).length > 0
  const hasUrbanEvidence = Object.keys(route.urbanDensityMix ?? {}).length > 0
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
    ...(route.ascentMeters !== null || route.descentMeters !== null ? {
      elevationInterest: clamp(((route.ascentMeters ?? 0) + (route.descentMeters ?? 0)) / Math.max(1, route.distanceMiles * 100))
    } : {}),
    scenicProxy: clamp(secondaryShare * 0.7 + (1 - highwayShare) * 0.3),
    ...(hasRoadClassEvidence ? { trafficPenalty: clamp(highwayShare * 0.65) } : {}),
    ...(hasUrbanEvidence ? { urbanDensityPenalty: urbanShare } : {}),
    highwayPenalty: hasRoadClassEvidence ? highwayShare : undefined,
    ...(Object.keys(route.surfaceMix).length > 0 ? {
      gravelSuitability: clamp((route.surfaceMix.gravel ?? 0) / 100 + (route.surfaceMix.unpaved ?? 0) / 100)
    } : {}),
    legalAccess: "unknown",
    seasonalAccess: "unknown",
    featureProvenance,
    dataConfidence: intrinsicFeatureCoverage(featureProvenance),
    safetyFlags: [],
    distanceMeters: route.distanceMiles * 1609.344
  }
  return {
    id: route.id,
    geometry: [...route.geometry],
    distanceMeters: route.distanceMiles * 1609.344,
    durationSeconds: route.durationMinutes * 60,
    confidence: route.routingSource === "live" ? 1 : route.previewOnly ? 0 : 0.2,
    segments: [segment]
  }
}

export function scorePlannedRoute(
  route: PlannedRoute,
  context: Omit<RouteScoringContext, "profile"> & { profile?: RideProfile } = {}
): RouteScoreResult {
  const score = scoreRoute(plannedRouteToScoreable(route), {
    ...context,
    profile: context.profile ?? route.profile
  })
  return score
}
