import type { Waypoint } from "@/lib/routing/types"

interface RouteSketchInput {
  mode: "destination" | "loop"
  start: Waypoint | null
  finish: Waypoint | null
  trace: Waypoint[]
}

interface RouteSketchPoints {
  start: Waypoint
  finish: Waypoint | null
  via: Waypoint[]
}

const EARTH_RADIUS_METERS = 6_371_000
const MIN_SKETCH_METERS = 150
const ANCHOR_DEDUP_METERS = 300
const MAX_ROUTE_POINTS = 8

function distanceMeters(first: Waypoint, second: Waypoint): number {
  const radians = (value: number) => value * Math.PI / 180
  const firstLatitude = radians(first.lat)
  const secondLatitude = radians(second.lat)
  const latitudeDelta = secondLatitude - firstLatitude
  const longitudeDelta = radians(second.lon - first.lon)
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

function validPoint(point: Waypoint): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon) &&
    point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180
}

function cleanTrace(trace: Waypoint[]): Waypoint[] {
  return trace.filter(validPoint).reduce<Waypoint[]>((points, point) => {
    const previous = points.at(-1)
    if (!previous || distanceMeters(previous, point) >= 5) points.push(point)
    return points
  }, [])
}

function traceLengthMeters(trace: Waypoint[]): number {
  return trace.slice(1).reduce((length, point, index) => (
    length + distanceMeters(trace[index], point)
  ), 0)
}

function evenlySample(points: Waypoint[], limit: number): Waypoint[] {
  if (points.length <= limit) return points
  return Array.from({ length: limit }, (_, index) => {
    const sourceIndex = Math.round(index * (points.length - 1) / (limit - 1))
    return points[sourceIndex]
  })
}

export function routePointsFromSketch(input: RouteSketchInput): RouteSketchPoints {
  if (!input.start) throw new Error("Choose a start before sketching a route.")
  if (input.mode === "destination" && !input.finish) {
    throw new Error("Choose a finish before sketching a destination route.")
  }

  const trace = cleanTrace(input.trace)
  if (trace.length < 2 || traceLengthMeters(trace) < MIN_SKETCH_METERS) {
    throw new Error("Draw a longer line so Switchback can read the road corridor.")
  }

  const anchors = input.mode === "loop"
    ? [input.start]
    : [input.start, input.finish!]
  const candidates = trace.filter((point) => (
    anchors.every((anchor) => distanceMeters(point, anchor) > ANCHOR_DEDUP_METERS)
  ))
  const maxVia = MAX_ROUTE_POINTS - 2
  const via = evenlySample(candidates, maxVia).map((point, index) => ({
    lat: Number(point.lat.toFixed(6)),
    lon: Number(point.lon.toFixed(6)),
    label: `Sketch stop ${index + 1}`
  }))

  return {
    start: input.start,
    finish: input.mode === "destination" ? input.finish : null,
    via
  }
}
