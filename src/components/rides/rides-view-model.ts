import type { ProjectGpxRouteSummary } from "@/lib/gpx/catalog"
import { centerOfBbox, centerOfPath } from "@/lib/client/geo"
import { classifyRouteGeography } from "@/lib/gpx/route-regions"
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

function recordedDuration(ride: RecordedRide): RideDuration {
  const start = Date.parse(ride.startedAt)
  const end = Date.parse(ride.endedAt)
  return Number.isFinite(start) && Number.isFinite(end)
    ? { minutes: Math.max(0, Math.round((end - start) / 60_000)), source: "recorded" }
    : { minutes: ride.route.durationMinutes, source: "planned" }
}

function centerOf(geometry: Coordinate[] | undefined): readonly [number, number] | null {
  return Array.isArray(geometry) ? centerOfPath(geometry) : null
}

function previewGeometry(geometry: Coordinate[] | undefined): readonly Coordinate[] | undefined {
  if (!Array.isArray(geometry) || geometry.length < 2) return undefined
  return simplifyGeometry(geometry)
}

/**
 * Collapse import duplication without touching storage identity. Atlas-level
 * geometry duplicates disappear first; importer duplicate families then elect
 * their canonical member, falling back to the longest member when old data has
 * no explicit canonical role.
 */
function canonicalProjectRoutes(routes: ProjectGpxRouteSummary[]): ProjectGpxRouteSummary[] {
  const uniqueShapes = routes.filter((route) => !route.duplicateOf)
  const familyPick = new Map<string, ProjectGpxRouteSummary>()

  for (const route of uniqueShapes) {
    if (!route.duplicateFamilyId) continue
    const held = familyPick.get(route.duplicateFamilyId)
    if (!held) {
      familyPick.set(route.duplicateFamilyId, route)
      continue
    }

    const heldCanonical = held.duplicateFamilyRole === "canonical"
    const routeCanonical = route.duplicateFamilyRole === "canonical"
    if (routeCanonical && !heldCanonical) {
      familyPick.set(route.duplicateFamilyId, route)
    } else if (routeCanonical === heldCanonical && route.distanceMiles > held.distanceMiles) {
      familyPick.set(route.duplicateFamilyId, route)
    }
  }

  return uniqueShapes.filter((route) =>
    !route.duplicateFamilyId || familyPick.get(route.duplicateFamilyId)?.id === route.id)
}

export interface NormalizeRidesInput {
  savedRoutes?: SavedRoute[]
  recordedRides?: RecordedRide[]
  trips?: TripPlan[]
  projectRoutes?: ProjectGpxRouteSummary[]
}

/** Presentation adapter only; storage objects and source IDs remain untouched. */
export function normalizeRideLibrary({
  savedRoutes = [],
  recordedRides = [],
  trips = [],
  projectRoutes = []
}: NormalizeRidesInput): RideLibraryItem[] {
  const canonicalProjects = canonicalProjectRoutes(projectRoutes)

  const items: RideLibraryItem[] = [
    ...savedRoutes.map((route): RideLibraryItem => ({
      id: `saved:${route.id}`,
      sourceId: route.id,
      kind: "saved-route",
      name: route.name,
      sourceLabel: route.folder && route.folder !== "Unfiled" ? `Saved route · ${route.folder}` : "Saved route",
      distanceMiles: route.distanceMiles,
      durationMinutes: route.durationMinutes,
      durationSource: "planned",
      updatedAt: route.updatedAt,
      center: centerOf(route.geometry),
      geometry: previewGeometry(route.geometry),
      tags: route.tags ?? [],
      management: {
        canDelete: true,
        canMatchRoads: route.routingSource === "imported",
        imported: route.routingSource === "imported",
        folder: route.folder,
        visible: route.visible
      }
    })),
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
    })),
    ...canonicalProjects.map((route): RideLibraryItem => {
      const geography = classifyRouteGeography(route.bbox)
      return {
        id: `project:${route.id}`,
        sourceId: route.id,
        kind: "project-gpx",
        name: route.story?.title || route.name,
        sourceLabel: geography.macroRegion ? `Imported GPX · ${geography.macroRegion}` : `Project GPX · ${route.sourceProject}`,
        distanceMiles: route.distanceMiles,
        durationMinutes: route.durationMinutes,
        durationSource: "planned",
        updatedAt: null,
        center: route.bbox ? centerOfBbox(route.bbox) : null,
        summary: route.story?.summary,
        macroRegion: geography.macroRegion,
        ridingAreas: geography.ridingAreas,
        preview: route.preview,
        twistiness: route.twistiness,
        turnCount: route.turnCount,
        tags: [route.sourceProject, ...(route.dataConfidenceLevel ? [`${route.dataConfidenceLevel} confidence`] : [])],
        management: { imported: true }
      }
    })
  ]

  return items.sort((left, right) => {
    const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0
    const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0
    if (leftTime !== rightTime) return rightTime - leftTime
    return left.name.localeCompare(right.name)
  })
}
