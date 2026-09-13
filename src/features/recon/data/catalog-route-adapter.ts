import type { PlannedRoute } from "@/lib/routing/types"
import type { ReconTrack, ReconTrackPoint } from "@/features/recon/types"
import { createReconTrack, finiteOrNull, isValidReconCoordinate } from "./recon-track"

/**
 * Adapts a parsed catalog route (the `PlannedRoute` payload served by the
 * Route Library API) into a Recon track.
 *
 * Pure: the route is treated as read-only and never mutated. Catalog
 * geometry carries no timestamps, so the result is always a `"preview"`:
 * distance-normalized progress only, no observed speed, no invented
 * elapsed time, and it must never be presented as a replay. Invalid
 * geometry rejects the route (null) instead of being repaired.
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
      accuracyMeters: null,
    })
  }

  return createReconTrack({
    id: `catalog:${route.id}`,
    name: route.name,
    sourceKind: "catalog-route",
    playbackKind: "preview",
    points,
    routeId: route.id,
    startedAt: null,
    endedAt: null,
    facts: {
      // The planner's durationMinutes is a routing estimate, not an observed
      // ride time; it never becomes playback time here.
      durationMinutes: null,
      // Reuse the route's own elevation facts; unknown stays null.
      ascentMeters: finiteOrNull(route.ascentMeters),
      descentMeters: finiteOrNull(route.descentMeters),
      // Phase 0 evaluates no surface evidence; unknown stays unknown.
      surfaceKnown: false,
      matchPercent: null,
      confidence: null,
    },
  })
}
