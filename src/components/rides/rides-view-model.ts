import type { ProjectGpxRouteSummary } from "@/lib/gpx/catalog"
import { centerOfBbox, centerOfPath } from "@/lib/client/geo"
import type { Coordinate } from "@/lib/routing/types"
import type { RecordedRide } from "@/lib/storage/ride-journal"
import type { SavedRoute } from "@/lib/storage/route-library"
import type { TripPlan } from "@/lib/trip/trip-plan"
import type { RideLibraryItem } from "./RidesSurface"

function recordedDurationMinutes(ride: RecordedRide): number {
  const start = Date.parse(ride.startedAt)
  const end = Date.parse(ride.endedAt)
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, Math.round((end - start) / 60_000))
    : ride.route.durationMinutes
}

/** Representative point for "distance from me" ordering; null when unplaceable. */
function centerOf(geometry: Coordinate[] | undefined): readonly [number, number] | null {
  return Array.isArray(geometry) ? centerOfPath(geometry) : null
}

export interface NormalizeRidesInput {
  savedRoutes?: SavedRoute[]
  recordedRides?: RecordedRide[]
  trips?: TripPlan[]
  projectRoutes?: ProjectGpxRouteSummary[]
}

/**
 * Presentation-only adapter for the V2 Rides destination. Storage objects keep
 * their original ids and schemas; callers use `sourceId` + `kind` to dispatch
 * back to the existing load/delete/replay/import commands.
 */
export function normalizeRideLibrary({
  savedRoutes = [],
  recordedRides = [],
  trips = [],
  projectRoutes = []
}: NormalizeRidesInput): RideLibraryItem[] {
  const items: RideLibraryItem[] = [
    ...savedRoutes.map((route): RideLibraryItem => ({
      id: `saved:${route.id}`,
      sourceId: route.id,
      kind: "saved-route",
      name: route.name,
      sourceLabel: route.folder && route.folder !== "Unfiled" ? `Saved route · ${route.folder}` : "Saved route",
      distanceMiles: route.distanceMiles,
      durationMinutes: route.durationMinutes,
      updatedAt: route.updatedAt,
      center: centerOf(route.geometry),
      tags: route.tags ?? [],
      management: {
        canDelete: true,
        canMatchRoads: route.routingSource === "imported",
        imported: route.routingSource === "imported",
        folder: route.folder,
        visible: route.visible
      }
    })),
    ...recordedRides.map((ride): RideLibraryItem => ({
      id: `recorded:${ride.id}`,
      sourceId: ride.id,
      kind: "recorded-ride",
      name: ride.routeName || ride.route.name,
      sourceLabel: "Recorded ride",
      distanceMiles: ride.route.distanceMiles,
      durationMinutes: recordedDurationMinutes(ride),
      updatedAt: ride.endedAt || ride.updatedAt,
      center: centerOf(ride.route.geometry),
      tags: ride.photos.length > 0 ? [`${ride.photos.length} photo${ride.photos.length === 1 ? "" : "s"}`] : [],
      management: { canDelete: true }
    })),
    ...trips.map((trip): RideLibraryItem => ({
      id: `trip:${trip.id}`,
      sourceId: trip.id,
      kind: "trip-plan",
      name: trip.name,
      sourceLabel: trip.stages.length > 1 ? `Trip plan · ${trip.stages.length} days` : "Trip plan",
      distanceMiles: trip.route.distanceMiles,
      durationMinutes: trip.route.durationMinutes,
      updatedAt: trip.updatedAt,
      center: centerOf(trip.route.geometry),
      tags: [],
      management: { canDelete: true }
    })),
    ...projectRoutes.map((route): RideLibraryItem => ({
      id: `project:${route.id}`,
      sourceId: route.id,
      kind: "project-gpx",
      name: route.name,
      sourceLabel: `Project GPX · ${route.sourceProject}`,
      distanceMiles: route.distanceMiles,
      durationMinutes: route.durationMinutes,
      updatedAt: null,
      center: route.bbox ? centerOfBbox(route.bbox) : null,
      tags: route.dataConfidenceLevel ? [`${route.dataConfidenceLevel} confidence`] : [],
      management: { imported: true }
    }))
  ]

  return items.sort((left, right) => {
    const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0
    const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0
    if (leftTime !== rightTime) return rightTime - leftTime
    return left.name.localeCompare(right.name)
  })
}
