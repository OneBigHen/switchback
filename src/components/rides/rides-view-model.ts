import { centerOfPath } from "@/lib/client/geo"
import { simplifyGeometry } from "@/lib/routing/scoring"
import type { Coordinate } from "@/lib/routing/types"
import type { RecordedRide } from "@/lib/storage/ride-journal"
import type { SavedRoute } from "@/lib/storage/route-library"
import type { TripPlan } from "@/lib/trip/trip-plan"
import type { RideLibraryItem } from "./RidesSurface"

interface RideDuration {
  minutes: number
  source: "recorded" | "planned"
}

/**
 * Elapsed time from the recording's own clock, or the plan clearly marked as
 * the plan.
 *
 * The fallback itself is reasonable — a duration the rider recognises beats a
 * blank — but it used to be indistinguishable from a measurement. Returning the
 * source with the number keeps the useful fallback and removes the false claim.
 */
function recordedDuration(ride: RecordedRide): RideDuration {
  const start = Date.parse(ride.startedAt)
  const end = Date.parse(ride.endedAt)
  return Number.isFinite(start) && Number.isFinite(end)
    ? { minutes: Math.max(0, Math.round((end - start) / 60_000)), source: "recorded" }
    : { minutes: ride.route.durationMinutes, source: "planned" }
}

/** Representative point for "distance from me" ordering; null when unplaceable. */
function centerOf(geometry: Coordinate[] | undefined): readonly [number, number] | null {
  return Array.isArray(geometry) ? centerOfPath(geometry) : null
}

/**
 * The ride's own shape, reduced to what a card-sized thumbnail can show.
 *
 * Simplified rather than copied: the list holds every ride the rider owns, and
 * none of them needs full route detail at 100x72. `simplifyGeometry` keeps the
 * real endpoints and drops interior points within tolerance of the chord, so
 * the result is still this ride's shape — coarser, never invented.
 *
 * `undefined` when the source stored no geometry. That is a fact the card
 * reports; it must not be filled in with a plausible-looking line.
 */
function previewGeometry(geometry: Coordinate[] | undefined): readonly Coordinate[] | undefined {
  if (!Array.isArray(geometry) || geometry.length < 2) return undefined
  return simplifyGeometry(geometry)
}

export interface NormalizeRidesInput {
  savedRoutes?: SavedRoute[]
  recordedRides?: RecordedRide[]
  trips?: TripPlan[]
}

/**
 * Presentation-only adapter for rider-owned My Rides data. Shared catalog
 * routes are intentionally not part of this input contract; extra legacy
 * `projectRoutes` data is ignored by normal JavaScript object semantics.
 */
export function normalizeRideLibrary({
  savedRoutes = [],
  recordedRides = [],
  trips = []
}: NormalizeRidesInput): RideLibraryItem[] {
  const items: RideLibraryItem[] = [
    ...savedRoutes.map((route): RideLibraryItem => {
      // Explicit ownership provenance is authoritative for new imports. Keep
      // the routingSource fallback while legacy rows migrate from the old model.
      const imported = route.libraryProvenance?.kind === "imported-file" || route.routingSource === "imported"
      return {
        id: `saved:${route.id}`,
        sourceId: route.id,
        kind: "saved-route",
        name: route.name,
        sourceLabel: imported
          ? `Imported ${route.libraryProvenance?.kind === "imported-file" && route.libraryProvenance.sourceFormat
              ? route.libraryProvenance.sourceFormat.toUpperCase()
              : "route"}`
          : route.folder && route.folder !== "Unfiled"
            ? `Saved route · ${route.folder}`
            : "Saved route",
        distanceMiles: route.distanceMiles,
        durationMinutes: route.durationMinutes,
        durationSource: "planned",
        updatedAt: route.updatedAt,
        center: centerOf(route.geometry),
        geometry: previewGeometry(route.geometry),
        tags: route.tags ?? [],
        management: {
          canDelete: true,
          canMatchRoads: imported,
          imported,
          folder: route.folder,
          visible: route.visible
        }
      }
    }),
    ...recordedRides.map((ride): RideLibraryItem => {
      const duration = recordedDuration(ride)
      return {
        id: `recorded:${ride.id}`,
        sourceId: ride.id,
        kind: "recorded-ride",
        name: ride.routeName || ride.route.name,
        sourceLabel: "Recorded ride",
        distanceMiles: ride.route.distanceMiles,
        durationMinutes: duration.minutes,
        durationSource: duration.source,
        updatedAt: ride.endedAt || ride.updatedAt,
        center: centerOf(ride.route.geometry),
        geometry: previewGeometry(ride.route.geometry),
        tags: ride.photos.length > 0 ? [`${ride.photos.length} photo${ride.photos.length === 1 ? "" : "s"}`] : [],
        management: { canDelete: true }
      }
    }),
    ...trips.map((trip): RideLibraryItem => ({
      id: `trip:${trip.id}`,
      sourceId: trip.id,
      kind: "trip-plan",
      name: trip.name,
      sourceLabel: trip.stages.length > 1 ? `Trip plan · ${trip.stages.length} days` : "Trip plan",
      distanceMiles: trip.route.distanceMiles,
      durationMinutes: trip.route.durationMinutes,
      durationSource: "planned",
      updatedAt: trip.updatedAt,
      center: centerOf(trip.route.geometry),
      geometry: previewGeometry(trip.route.geometry),
      tags: [],
      management: { canDelete: true }
    }))
  ]

  return items.sort((left, right) => {
    const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0
    const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0
    if (leftTime !== rightTime) return rightTime - leftTime
    return left.name.localeCompare(right.name)
  })
}
