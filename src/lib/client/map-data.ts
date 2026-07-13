import type { PlannedRoute, Waypoint } from "@/lib/routing/types"

export function buildRouteFeatures(routes: PlannedRoute[], selectedId: string | null) {
  const ordered = [...routes].sort((left, right) =>
    Number(left.id === selectedId) - Number(right.id === selectedId)
  )
  return {
    type: "FeatureCollection" as const,
    features: ordered.map((route) => ({
      type: "Feature" as const,
      properties: {
        routeId: route.id,
        selected: route.id === selectedId
      },
      geometry: {
        type: "LineString" as const,
        coordinates: route.geometry
      }
    }))
  }
}

export function buildWaypointFeatures(start: Waypoint | null, finish: Waypoint | null) {
  const entries = [
    { point: start, kind: "start", marker: "S" },
    { point: finish, kind: "finish", marker: "F" }
  ] as const
  return {
    type: "FeatureCollection" as const,
    features: entries.flatMap(({ point, kind, marker }) => point ? [{
      type: "Feature" as const,
      properties: {
        kind,
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

export function emptyFeatureCollection() {
  return { type: "FeatureCollection" as const, features: [] }
}
