import type { Coordinate, PlannedRoute, Waypoint } from "@/lib/routing/types"

export interface RouteEditState {
  mode: "loop" | "destination"
  targetMinutes: number | null
  start: Waypoint | null
  finish: Waypoint | null
  via: Waypoint[]
}

const EARTH_RADIUS_METERS = 6_371_000

function distanceMeters(first: Coordinate, second: Coordinate): number {
  const radians = (value: number) => value * Math.PI / 180
  const firstLatitude = radians(first[1])
  const secondLatitude = radians(second[1])
  const latitudeDelta = secondLatitude - firstLatitude
  const longitudeDelta = radians(second[0] - first[0])
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

function coordinateWaypoint(coordinate: Coordinate | undefined, label: string): Waypoint | null {
  return coordinate ? { lat: coordinate[1], lon: coordinate[0], label } : null
}

export function routeEditState(route: PlannedRoute): RouteEditState {
  const start = route.waypoints[0] ?? coordinateWaypoint(route.geometry[0], "Route start")
  const end = route.waypoints.at(-1) ?? coordinateWaypoint(route.geometry.at(-1), "Route finish")
  const firstGeometry = route.geometry[0]
  const lastGeometry = route.geometry.at(-1)
  const closedGeometry = Boolean(
    firstGeometry && lastGeometry && distanceMeters(firstGeometry, lastGeometry) <= 250
  )
  const isLoop = route.loopTargetMinutes !== undefined || closedGeometry

  if (isLoop) {
    const inferredTarget = Math.max(20, Math.min(480, Math.round(route.durationMinutes / 15) * 15))
    return {
      mode: "loop",
      targetMinutes: route.loopTargetMinutes ?? inferredTarget,
      start,
      finish: null,
      via: route.waypoints.length > 1 ? route.waypoints.slice(1, -1) : []
    }
  }

  return {
    mode: "destination",
    targetMinutes: null,
    start,
    finish: end,
    via: route.waypoints.slice(1, -1)
  }
}
