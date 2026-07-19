import {
  buildRemainingRoutePoints,
  coordinateAtRouteDistance,
  coordinateDistanceMeters,
  type NavigationFrame,
  type NavigationModel
} from "@/lib/client/navigation-engine"
import type { PlaceResult } from "@/lib/geocoding/photon"
import type { PlannedRoute, Waypoint } from "@/lib/routing/types"

export type RideRerouteMode = "nearest-safe" | "next-shaping" | "skip-point" | "fuel-detour" | "automatic"

interface BuildReroutePointsInput {
  route: PlannedRoute
  navigationModel: NavigationModel
  trustedFrame: NavigationFrame
  currentFrame: NavigationFrame
  completedWaypointIndexes: number[]
  mode: RideRerouteMode
  fuelStop?: PlaceResult
}

export function buildReroutePoints({
  route,
  navigationModel,
  trustedFrame,
  currentFrame,
  completedWaypointIndexes,
  mode,
  fuelStop
}: BuildReroutePointsInput): Waypoint[] | null {
  let points = buildRemainingRoutePoints(
    route,
    trustedFrame,
    currentFrame.rawCoordinate,
    completedWaypointIndexes
  )
  if (mode === "nearest-safe") {
    const lookAheadMeters = Math.max(300, (currentFrame.speedMetersPerSecond ?? 0) * 20)
    const rejoinCoordinate = coordinateAtRouteDistance(
      navigationModel,
      Math.min(navigationModel.totalDistanceMeters, trustedFrame.matchedDistanceMeters + lookAheadMeters)
    )
    const rejoinPoint = {
      lat: rejoinCoordinate[1],
      lon: rejoinCoordinate[0],
      label: "Nearest safe rejoin"
    }
    const firstRemaining = points[1]
    points = firstRemaining && coordinateDistanceMeters(
      [firstRemaining.lon, firstRemaining.lat],
      rejoinCoordinate
    ) <= 20
      ? [points[0]!, rejoinPoint, ...points.slice(2)]
      : [points[0]!, rejoinPoint, ...points.slice(1)]
  } else if (mode === "skip-point" && points.length > 2) {
    points = [points[0]!, ...points.slice(2)]
  } else if (mode === "fuel-detour") {
    if (!fuelStop) return null
    points = [points[0]!, {
      lat: fuelStop.lat,
      lon: fuelStop.lon,
      label: `Fuel · ${fuelStop.name}`
    }, ...points.slice(1)]
  }
  return points.length >= 2 ? points : null
}
