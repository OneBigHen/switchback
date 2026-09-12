import type { Coordinate, Waypoint } from "./types"

const evidenceByGeometry = new WeakMap<readonly Coordinate[], readonly Waypoint[]>()

export function registerRouteWaypointEvidence(
  geometry: readonly Coordinate[],
  waypoints: readonly Waypoint[]
): void {
  evidenceByGeometry.set(geometry, waypoints)
}

function coordinateDistanceSquared(first: Waypoint, second: Waypoint): number {
  const averageLatitudeRadians = ((first.lat + second.lat) / 2) * Math.PI / 180
  const longitudeScale = Math.cos(averageLatitudeRadians)
  const longitudeDelta = (first.lon - second.lon) * longitudeScale
  const latitudeDelta = first.lat - second.lat
  return longitudeDelta * longitudeDelta + latitudeDelta * latitudeDelta
}

/**
 * Return provider-resolved evidence for the same logical waypoint.
 *
 * Adapters fall back to request coordinates when the provider supplies no
 * waypoint evidence. Exact request coordinates therefore remain conservative:
 * they do not prove a provider snap. Duplicate labels are disambiguated by the
 * candidate closest to the grounded request anchor.
 */
export function providerResolvedWaypointFor(
  geometry: readonly Coordinate[],
  requested: Waypoint
): Waypoint | undefined {
  const label = requested.label?.trim()
  if (!label) return undefined

  const candidates = evidenceByGeometry.get(geometry)
    ?.filter((candidate) =>
      candidate.label?.trim() === label
      && Number.isFinite(candidate.lat)
      && Number.isFinite(candidate.lon))
  if (!candidates || candidates.length === 0) return undefined

  const nearest = [...candidates]
    .sort((left, right) =>
      coordinateDistanceSquared(left, requested) - coordinateDistanceSquared(right, requested))[0]
  if (!nearest) return undefined
  if (nearest.lat === requested.lat && nearest.lon === requested.lon) return undefined
  return nearest
}
