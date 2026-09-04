import type { Coordinate, Waypoint } from "@/lib/routing/types"
import { sampleSketchCorridor } from "@/lib/routing/sketch-corridor"

interface RouteSketchInput {
  mode: "destination" | "loop"
  start: Waypoint | null
  finish: Waypoint | null
  trace: Waypoint[]
}

export interface RoutePointSnapshot {
  start: Waypoint
  finish: Waypoint | null
  via: Waypoint[]
}

export interface SketchIntentResult {
  mode: "destination" | "loop"
  points: RoutePointSnapshot
  /**
   * The stroke itself, resampled evenly. The planner treats this as a soft
   * corridor: it scores how closely each option follows the drawing and offers
   * options at several adherence levels. `points.via` remains the rider's
   * editable hard shaping stops.
   */
  corridor: Coordinate[]
}

export interface RouteIntentFromSketchInput {
  currentMode: "destination" | "loop"
  start: Waypoint | null
  finish: Waypoint | null
  trace: Waypoint[]
  hasExistingRoute: boolean
}

const EARTH_RADIUS_METERS = 6_371_000
const MIN_SKETCH_METERS = 150
const ANCHOR_DEDUP_METERS = 300
const MAX_ROUTE_POINTS = 8
const MIN_CLOSED_LOOP_THRESHOLD_METERS = 350
const MAX_CLOSED_LOOP_THRESHOLD_METERS = 1_500
const CLOSED_LOOP_LENGTH_RATIO = 0.12

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
    length + distanceMeters(trace[index]!, point)
  ), 0)
}

function evenlySample(points: Waypoint[], limit: number): Waypoint[] {
  if (points.length <= limit) return points
  return Array.from({ length: limit }, (_, index) => {
    const sourceIndex = Math.round(index * (points.length - 1) / (limit - 1))
    return points[sourceIndex]!
  })
}

function normalizedWaypoint(point: Waypoint, label: string): Waypoint {
  return {
    ...point,
    lat: Number(point.lat.toFixed(6)),
    lon: Number(point.lon.toFixed(6)),
    label: point.label ?? label
  }
}

function isNearClosed(trace: Waypoint[], lengthMeters: number): boolean {
  const first = trace[0]
  const last = trace.at(-1)
  if (!first || !last) return false
  const threshold = Math.min(
    MAX_CLOSED_LOOP_THRESHOLD_METERS,
    Math.max(MIN_CLOSED_LOOP_THRESHOLD_METERS, lengthMeters * CLOSED_LOOP_LENGTH_RATIO)
  )
  return distanceMeters(first, last) <= threshold
}

function shapingPoints(trace: Waypoint[], anchors: Waypoint[]): Waypoint[] {
  const candidates = trace.filter((point) => (
    anchors.every((anchor) => distanceMeters(point, anchor) > ANCHOR_DEDUP_METERS)
  ))
  const maxVia = MAX_ROUTE_POINTS - 2
  return evenlySample(candidates, maxVia).map((point, index) => (
    normalizedWaypoint(point, `Sketch stop ${index + 1}`)
  ))
}

/**
 * Converts a rider's rough map gesture into planning intent. The gesture owns
 * missing endpoints: an open stroke becomes A→B and a near-closed stroke
 * becomes a loop. When reshaping an existing route, explicit route anchors
 * remain authoritative and the trace only replaces shaping intent.
 *
 * This function never invents final road geometry. Its output is a bounded set
 * of routing inputs that must still pass through the normal routing engine.
 */
export function routeIntentFromSketch(input: RouteIntentFromSketchInput): SketchIntentResult {
  const trace = cleanTrace(input.trace)
  const lengthMeters = traceLengthMeters(trace)
  if (trace.length < 2 || lengthMeters < MIN_SKETCH_METERS) {
    throw new Error("Draw a longer line so Switchback can read the road corridor.")
  }

  const first = trace[0]!
  const last = trace.at(-1)!
  const preserveExistingIntent = input.hasExistingRoute && Boolean(input.start)
  const inferredLoop = !preserveExistingIntent && isNearClosed(trace, lengthMeters)
  const mode = preserveExistingIntent ? input.currentMode : inferredLoop ? "loop" : "destination"

  const start = input.start ?? normalizedWaypoint(first, "Sketch start")
  const finish = mode === "destination"
    ? input.finish ?? normalizedWaypoint(last, "Sketch finish")
    : null

  const anchors = finish ? [start, finish] : [start]
  return {
    mode,
    points: {
      start,
      finish,
      via: shapingPoints(trace, anchors)
    },
    corridor: sampleSketchCorridor(trace.map((point): Coordinate => [point.lon, point.lat]))
  }
}

/**
 * Backward-compatible adapter for the original sketch API. Existing callers
 * that deliberately supplied anchors retain the old validation semantics while
 * new V2 callers should use routeIntentFromSketch so the gesture can infer
 * start/end and loop intent.
 */
export function routePointsFromSketch(input: RouteSketchInput): RoutePointSnapshot {
  if (!input.start) throw new Error("Choose a start before sketching a route.")
  if (input.mode === "destination" && !input.finish) {
    throw new Error("Choose a finish before sketching a destination route.")
  }

  return routeIntentFromSketch({
    currentMode: input.mode,
    start: input.start,
    finish: input.finish,
    trace: input.trace,
    hasExistingRoute: true
  }).points
}
