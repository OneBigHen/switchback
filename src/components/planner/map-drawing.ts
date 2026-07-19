import type { Map as MapLibreMap } from "maplibre-gl"
import type { AvoidArea, Waypoint } from "@/lib/routing/types"

export interface ScreenPoint {
  x: number
  y: number
}

export function createAvoidArea(id: string, count: number, polygon: [number, number][]): AvoidArea {
  return { id, name: `Avoid area ${count + 1}`, polygon }
}

export function avoidAreaPolygon(
  map: Pick<MapLibreMap, "unproject">,
  start: ScreenPoint,
  end: ScreenPoint
): [number, number][] | null {
  if (Math.abs(end.x - start.x) < 24 || Math.abs(end.y - start.y) < 24) return null
  const left = Math.min(start.x, end.x)
  const right = Math.max(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const bottom = Math.max(start.y, end.y)
  return [[left, top], [right, top], [right, bottom], [left, bottom]].map(([x, y]) => {
    const coordinate = map.unproject([x, y])
    return [Number(coordinate.lng.toFixed(6)), Number(coordinate.lat.toFixed(6))] as [number, number]
  })
}

export function appendSketchPoint(points: readonly ScreenPoint[], next: ScreenPoint): ScreenPoint[] {
  const previous = points.at(-1)
  if (previous && Math.hypot(next.x - previous.x, next.y - previous.y) < 6) return [...points]
  return [...points, next]
}

export function hasUsableSketch(points: readonly ScreenPoint[]): boolean {
  if (points.length < 2) return false
  const length = points.slice(1).reduce((total, point, index) => (
    total + Math.hypot(point.x - points[index].x, point.y - points[index].y)
  ), 0)
  return length >= 24
}

export function routeSketchWaypoints(
  map: Pick<MapLibreMap, "unproject">,
  points: readonly ScreenPoint[]
): Waypoint[] {
  return points.map((point) => {
    const coordinate = map.unproject([point.x, point.y])
    return { lat: Number(coordinate.lat.toFixed(6)), lon: Number(coordinate.lng.toFixed(6)) }
  })
}
