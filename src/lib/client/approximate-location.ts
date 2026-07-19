import type { Waypoint } from "@/lib/routing/types"

const LOCATION_GRID_DEGREES = 0.01

function approximateCoordinate(value: number): number {
  return Number((Math.round(value / LOCATION_GRID_DEGREES) * LOCATION_GRID_DEGREES).toFixed(2))
}

export function approximateCurrentLocation(latitude: number, longitude: number): Waypoint | null {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return null
  }
  return {
    lat: approximateCoordinate(latitude),
    lon: approximateCoordinate(longitude),
    label: "Approximate current location"
  }
}
