import type { Map as MapLibreMap } from "maplibre-gl"
import type { AvoidArea, Coordinate, PlannedRoute, Waypoint } from "@/lib/routing/types"
import type {
  RoadLock,
  RoadLockMatchConfidence,
  RoadLockSatisfaction
} from "@/lib/roads/road-locks"

export interface ScreenPoint {
  x: number
  y: number
}

/**
 * Match-state color CSS variables. All three are backed by the existing
 * token set so the reskin can re-theme them in one place. MapLibre paint
 * properties do not accept `var()`, so `resolveRoadLockMatchColorMap()`
 * reads the computed values out of `:root` before handing them to the
 * map source as literal hex/rgba strings.
 */
export const ROAD_LOCK_MATCH_TOKEN = {
  exact: "--road-lock-exact",
  matched: "--road-lock-matched",
  approximate: "--road-lock-approximate",
  unresolved: "--road-lock-unresolved"
} as const

/** Read a CSS color token's computed value from `:root`. */
export function readTokenColor(name: string): string {
  if (typeof window === "undefined") return "#000"
  const style = window.getComputedStyle(document.documentElement)
  const value = style.getPropertyValue(name).trim()
  return value || "#000"
}

/** Resolve every match-state token to its current computed color. */
export function resolveRoadLockMatchColorMap(): Record<keyof typeof ROAD_LOCK_MATCH_TOKEN, string> {
  return {
    exact: readTokenColor(ROAD_LOCK_MATCH_TOKEN.exact),
    matched: readTokenColor(ROAD_LOCK_MATCH_TOKEN.matched),
    approximate: readTokenColor(ROAD_LOCK_MATCH_TOKEN.approximate),
    unresolved: readTokenColor(ROAD_LOCK_MATCH_TOKEN.unresolved)
  }
}

/**
 * Pick a match-state color string from a lock confidence value or
 * satisfaction result. A satisfaction row carries the authoritative
 * status once a route has been planned; otherwise we fall back to the
 * lock's stored `confidence`, which is `exact` for manually drawn
 * corridors and `approximate` for image traces.
 */
export function roadLockMatchColorKey(input: {
  confidence?: RoadLockMatchConfidence
  satisfaction?: RoadLockSatisfaction
}): keyof typeof ROAD_LOCK_MATCH_TOKEN {
  const match = input.satisfaction?.match
  if (match) {
    if (match.kind === "exact") return "exact"
    if (match.kind === "approximate") return "matched"
    return "unresolved"
  }
  if (input.confidence === "exact") return "exact"
  if (input.confidence === "matched") return "matched"
  return "approximate"
}

/** True when the lock's satisfaction row says it was unresolved. */
export function roadLockIsUnresolved(satisfaction?: RoadLockSatisfaction): boolean {
  return Boolean(satisfaction && satisfaction.match.kind === "unresolved")
}

/**
 * Build a GeoJSON FeatureCollection of lock polylines for the existing
 * map source. Locks without an inferred route highlight render dashed
 * to signal that they are not currently matched to a candidate route.
 * `colorMap` is the pre-resolved token map produced by
 * `resolveRoadLockMatchColorMap()` — the map source stores literal
 * colors so MapLibre paint expressions don't need to know about CSS vars.
 */
export function roadLockLineFeatures(
  locks: readonly RoadLock[],
  routes: readonly PlannedRoute[],
  colorMap: Record<keyof typeof ROAD_LOCK_MATCH_TOKEN, string>,
  highlightLockId?: string | null
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = locks.map((lock) => {
    const satisfaction = routes
      .flatMap((route) => route.lockSatisfaction ?? [])
      .find((entry) => entry.lockId === lock.id)
    const color = colorMap[roadLockMatchColorKey({ confidence: lock.confidence, satisfaction })]
    const unresolved = roadLockIsUnresolved(satisfaction)
    const selected = highlightLockId === lock.id
    return {
      type: "Feature",
      properties: {
        id: lock.id,
        kind: "road-lock",
        color,
        selected,
        unresolved,
        source: lock.source,
        mode: lock.mode,
        displayName: lock.displayName ?? null
      },
      geometry: {
        type: "LineString",
        coordinates: lock.geometry.coordinates.map(([lon, lat]) => [lon, lat] as [number, number])
      }
    }
  })
  return { type: "FeatureCollection", features }
}

/**
 * Build anchor point features for the rendered locks. Each anchor carries
 * the lock id and an `index` so the map can highlight the start vs end
 * notch distinctly.
 */
export function roadLockAnchorFeatures(
  locks: readonly RoadLock[],
  highlightLockId?: string | null
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const lock of locks) {
    lock.orderedAnchors.forEach((coordinate, index) => {
      features.push({
        type: "Feature",
        properties: {
          kind: "road-lock-anchor",
          lockId: lock.id,
          index,
          label: `Anchor ${index + 1}${lock.displayName ? ` · ${lock.displayName}` : ""}`,
          selected: highlightLockId === lock.id
        },
        geometry: { type: "Point", coordinates: [coordinate[0], coordinate[1]] }
      })
    })
  }
  return { type: "FeatureCollection", features }
}

/**
 * Build drift-arrow LineString features. An arrow connects each original
 * anchor to the closest point on the planned route geometry once the
 * satisfaction row reports `approximate` — i.e. the rematch slid the
 * snap and the rider should see how far it moved.
 */
export function roadLockDriftArrowFeatures(
  locks: readonly RoadLock[],
  routes: readonly PlannedRoute[],
  colorMap: Record<keyof typeof ROAD_LOCK_MATCH_TOKEN, string>
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const lock of locks) {
    const satisfaction = routes
      .flatMap((route) => route.lockSatisfaction ?? [])
      .find((entry) => entry.lockId === lock.id)
    if (!satisfaction || satisfaction.match.kind !== "approximate") continue
    const routeGeometry = routes
      .flatMap((route) => route.geometry)
      .map(([lon, lat]) => [lon, lat] as Coordinate)
    if (routeGeometry.length === 0) continue
    const color = colorMap.matched
    for (const anchor of lock.orderedAnchors) {
      const target = nearestPointOnLine(anchor, routeGeometry)
      if (!target) continue
      const distanceMeters = haversineMeters(anchor, target)
      if (distanceMeters < 4) continue
      features.push({
        type: "Feature",
        properties: {
          kind: "road-lock-drift",
          lockId: lock.id,
          distanceMeters: Math.round(distanceMeters),
          color
        },
        geometry: {
          type: "LineString",
          coordinates: [
            [anchor[0], anchor[1]],
            [target[0], target[1]]
          ]
        }
      })
    }
  }
  return { type: "FeatureCollection", features }
}

const EARTH_RADIUS_METERS = 6_371_000

function haversineMeters(a: Coordinate, b: Coordinate): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const toRadiansPhi = rad(a[1])
  const toRadiansPhi2 = rad(b[1])
  const dPhi = rad(b[1] - a[1])
  const dLambda = rad(b[0] - a[0])
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(toRadiansPhi) * Math.cos(toRadiansPhi2) * Math.sin(dLambda / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}

function nearestPointOnLine(point: Coordinate, line: readonly Coordinate[]): Coordinate | null {
  if (line.length === 0) return null
  if (line.length === 1) return line[0]!
  let bestDistance = Number.POSITIVE_INFINITY
  let bestPoint = line[0]!
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i]!
    const b = line[i + 1]!
    const [px, py] = point
    const [ax, ay] = a
    const [bx, by] = b
    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const candidate: Coordinate = [ax + t * dx, ay + t * dy]
    const distance = haversineMeters(point, candidate)
    if (distance < bestDistance) {
      bestDistance = distance
      bestPoint = candidate
    }
  }
  return bestPoint
}

/**
 * Stripped-down Phase-1 snap helper for a corridor tap. Today Switchback
 * does not expose a graph-edge index from the browser, so a manual tap is
 * recorded as the snapped coordinate (snap distance = 0). The lock records
 * the coordinate as an ordered anchor; the engine rematch happens later
 * when the lock is included on a `RouteRequest`. Replaced by `rematchRoadLock`
 * once a graph lookup is wired through the route API.
 */
export function snapRouteTapToRoutableEdge(coordinate: Coordinate): {
  coordinate: Coordinate
  edgeIds: string[]
  geometry: Coordinate[]
} {
  const [lon, lat] = coordinate
  return {
    coordinate: [lon, lat],
    edgeIds: [],
    geometry: [[lon, lat]]
  }
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

const SKETCH_MIN_POINT_DISTANCE_PX = 12
const SKETCH_SIMPLIFY_TOLERANCE_PX = 5
export const MAX_SKETCH_WAYPOINTS = 12

function screenDistance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function distanceFromSegment(point: ScreenPoint, start: ScreenPoint, end: ScreenPoint): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return screenDistance(point, start)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return screenDistance(point, { x: start.x + t * dx, y: start.y + t * dy })
}

function distanceFilterSketch(points: readonly ScreenPoint[]): ScreenPoint[] {
  if (points.length <= 2) return [...points]
  const kept: ScreenPoint[] = [points[0]!]
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]!
    if (screenDistance(kept.at(-1)!, point) >= SKETCH_MIN_POINT_DISTANCE_PX) kept.push(point)
  }
  const last = points.at(-1)!
  if (kept.at(-1) !== last) kept.push(last)
  return kept
}

function douglasPeucker(points: readonly ScreenPoint[], tolerance: number): ScreenPoint[] {
  if (points.length <= 2) return [...points]
  const start = points[0]!
  const end = points.at(-1)!
  let maxDistance = 0
  let splitIndex = -1

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceFromSegment(points[index]!, start, end)
    if (distance > maxDistance) {
      maxDistance = distance
      splitIndex = index
    }
  }

  if (splitIndex < 0 || maxDistance <= tolerance) return [start, end]
  const left = douglasPeucker(points.slice(0, splitIndex + 1), tolerance)
  const right = douglasPeucker(points.slice(splitIndex), tolerance)
  return [...left.slice(0, -1), ...right]
}

function capSketchPoints(points: readonly ScreenPoint[], maxPoints: number): ScreenPoint[] {
  if (points.length <= maxPoints) return [...points]
  const capped: ScreenPoint[] = []
  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round(index * (points.length - 1) / (maxPoints - 1))
    const point = points[sourceIndex]!
    if (capped.at(-1) !== point) capped.push(point)
  }
  const last = points.at(-1)!
  if (capped.at(-1) !== last) capped[capped.length - 1] = last
  return capped
}

/**
 * Reduce a dense finger stroke to routing intent. Screen-space filtering keeps
 * tiny touch jitter out, Douglas-Peucker preserves meaningful bends, and the
 * hard cap prevents a normal sketch from becoming dozens of via stops.
 */
export function simplifyRouteSketch(points: readonly ScreenPoint[]): ScreenPoint[] {
  if (points.length <= 2) return [...points]
  const distanceFiltered = distanceFilterSketch(points)
  const simplified = douglasPeucker(distanceFiltered, SKETCH_SIMPLIFY_TOLERANCE_PX)
  return capSketchPoints(simplified, MAX_SKETCH_WAYPOINTS)
}

export function routeSketchWaypoints(
  map: Pick<MapLibreMap, "unproject">,
  points: readonly ScreenPoint[]
): Waypoint[] {
  return simplifyRouteSketch(points).map((point) => {
    const coordinate = map.unproject([point.x, point.y])
    return { lat: Number(coordinate.lat.toFixed(6)), lon: Number(coordinate.lng.toFixed(6)) }
  })
}
