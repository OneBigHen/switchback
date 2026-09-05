import type { PlannedRoute, Waypoint, Coordinate } from "@/lib/routing/types"

function haversineMeters(a: Coordinate, b: Coordinate): number {
  const R = 6371000
  const dLat = (b[1] - a[1]) * Math.PI / 180
  const dLon = (b[0] - a[0]) * Math.PI / 180
  const lat1 = a[1] * Math.PI / 180
  const lat2 = b[1] * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function splitGeometryAtProgress(
  geometry: Coordinate[],
  progressPercent: number
): { traversed: Coordinate[]; remaining: Coordinate[] } {
  if (progressPercent <= 0 || geometry.length < 2) {
    return { traversed: [], remaining: geometry }
  }
  if (progressPercent >= 100) {
    return { traversed: geometry, remaining: [] }
  }

  const threshold = (progressPercent / 100) * geometry.length
  const splitIndex = Math.floor(threshold)
  const fraction = threshold - splitIndex

  const traversed = geometry.slice(0, splitIndex + 1)
  const remaining = geometry.slice(splitIndex + 1)

  if (fraction > 0 && splitIndex < geometry.length - 1) {
    const a = geometry[splitIndex]!
    const b = geometry[splitIndex + 1]!
    const interp: Coordinate = [
      a[0] + (b[0] - a[0]) * fraction,
      a[1] + (b[1] - a[1]) * fraction
    ]
    traversed.push(interp)
    remaining.unshift(interp)
  }

  return { traversed, remaining }
}

export function buildRouteFeatures(
  routes: PlannedRoute[],
  selectedId: string | null,
  progressPercent?: number,
  previewRouteId?: string | null
) {
  const validPreviewId = routes.some((route) => route.id === previewRouteId) ? previewRouteId : null
  const priority = (route: PlannedRoute) => route.id === selectedId ? 2 : route.id === validPreviewId ? 1 : 0
  const ordered = [...routes].sort((left, right) => priority(left) - priority(right))
  return {
    type: "FeatureCollection" as const,
    features: ordered.flatMap((route) => {
      const isSelected = route.id === selectedId
      const isPreviewed = !isSelected && route.id === validPreviewId
      if (progressPercent != null && progressPercent > 0 && isSelected) {
        const { traversed, remaining } = splitGeometryAtProgress(route.geometry, progressPercent)
        const features: Array<{
          type: "Feature"
          properties: { routeId: string; selected: boolean; previewed: boolean; traversed: boolean }
          geometry: { type: "LineString"; coordinates: Coordinate[] }
        }> = []
        if (traversed.length >= 2) {
          features.push({
            type: "Feature",
            properties: { routeId: route.id, selected: true, previewed: false, traversed: true },
            geometry: { type: "LineString", coordinates: traversed }
          })
        }
        if (remaining.length >= 2) {
          features.push({
            type: "Feature",
            properties: { routeId: route.id, selected: true, previewed: false, traversed: false },
            geometry: { type: "LineString", coordinates: remaining }
          })
        }
        return features
      }
      return [{
        type: "Feature" as const,
        properties: {
          routeId: route.id,
          selected: isSelected,
          previewed: isPreviewed,
          traversed: false
        },
        geometry: {
          type: "LineString" as const,
          coordinates: route.geometry
        }
      }]
    })
  }
}

export { haversineMeters }

export function buildWaypointFeatures(
  start: Waypoint | null,
  finish: Waypoint | null,
  via: Waypoint[] = []
) {
  const entries = [
    { point: start, kind: "start", marker: "S", index: -1 },
    ...via.map((point, index) => ({ point, kind: "via", marker: String(index + 1), index })),
    { point: finish, kind: "finish", marker: "F", index: -1 }
  ]
  return {
    type: "FeatureCollection" as const,
    features: entries.flatMap(({ point, kind, marker, index }) => point ? [{
      type: "Feature" as const,
      properties: {
        kind,
        index,
        marker,
        label: point.label ?? marker
      },
      geometry: {
        type: "Point" as const,
        coordinates: [point.lon, point.lat]
      }
    }] : [])
  }
}

export function buildRouteLabelFeatures(routes: PlannedRoute[], selectedId: string | null) {
  return {
    type: "FeatureCollection" as const,
    features: routes.map((route) => {
      const midIndex = Math.floor(route.geometry.length / 2)
      const midPoint = route.geometry[midIndex] ?? route.geometry[0] ?? [0, 0]
      return {
        type: "Feature" as const,
        properties: {
          routeId: route.id,
          selected: route.id === selectedId,
          label: `${route.distanceMiles.toFixed(1)}mi · ${Math.round(route.durationMinutes)}min`,
          name: route.name
        },
        geometry: {
          type: "Point" as const,
          coordinates: midPoint
        }
      }
    })
  }
}

export function emptyFeatureCollection() {
  return { type: "FeatureCollection" as const, features: [] }
}
