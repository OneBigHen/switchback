import type { PlannedRoute } from "@/lib/routing/types"
import type { ReconTrack, ReconTrackPoint } from "@/features/recon/types"
import { createReconTrack, finiteOrNull, isValidReconCoordinate } from "./recon-track"

/** Track ids for shared catalog routes are `catalog:<route id>`. Server-safe (no "use client"). */
export const CATALOG_PREFIX = "catalog:"

/**
 * Adapts a Route Library catalog route into a Recon track. Catalog geometry
 * carries no timestamps, so the result is always a `preview` and is never
 * presented as a replay. The planner's duration is a routing estimate, not an
 * observed time, so it never becomes playback time.
 */
export function adaptCatalogRoute(route: PlannedRoute): ReconTrack | null {
  if (route.geometry.length < 2) return null

  const points: ReconTrackPoint[] = []
  for (const coordinate of route.geometry) {
    if (!isValidReconCoordinate(coordinate)) return null
    points.push({
      coordinate: [...coordinate],
      recordedAt: null,
      speedMph: null,
      altitudeMeters: null,
      headingDegrees: null,
      accuracyMeters: null
    })
  }

  return createReconTrack({
    id: `${CATALOG_PREFIX}${route.id}`,
    name: route.name,
    sourceKind: "catalog-route",
    playbackKind: "preview",
    points,
    routeId: route.id,
    startedAt: null,
    endedAt: null,
    plannedGeometry: null,
    note: null,
    moments: [],
    facts: {
      durationMinutes: null,
      ascentMeters: finiteOrNull(route.ascentMeters),
      descentMeters: finiteOrNull(route.descentMeters)
    }
  })
}
