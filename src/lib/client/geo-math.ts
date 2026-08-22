import distance from "@turf/distance"
import bearing from "@turf/bearing"
import along from "@turf/along"
import type { Coordinate } from "@/lib/routing/types"
import type { Feature, LineString } from "geojson"

export function turfDistance(a: Coordinate, b: Coordinate): number {
  return distance([a[0], a[1]], [b[0], b[1]], { units: "meters" })
}

export function polylineDistanceMeters(geometry: Coordinate[]): number {
  return geometry.slice(0, -1).reduce(
    (total, coordinate, index) => total + turfDistance(coordinate, geometry[index + 1]!),
    0
  )
}

export function turfBearing(a: Coordinate, b: Coordinate): number {
  return bearing([a[0], a[1]], [b[0], b[1]])
}

export function turfPointAlong(geometry: Coordinate[], distanceMeters: number): Coordinate | null {
  if (geometry.length < 2) return null
  const line: Feature<LineString> = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: geometry }
  }
  const result = along(line, distanceMeters, { units: "meters" })
  const coords = result.geometry.coordinates
  return [coords[0]!, coords[1]!]
}
