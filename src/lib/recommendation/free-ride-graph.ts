import type { Coordinate } from "@/lib/domain/contracts"
import {
  validateCanonicalSegment,
  type CanonicalSegment
} from "@/lib/roads/canonical-segments"
import type { RigCorridor } from "@/lib/roads/rig-corridors"
import type { RigRouteRole } from "@/lib/roads/rig-evidence"
import { haversine, pointToSegmentDistanceMeters } from "@/lib/routing/scoring"

export interface FreeRideGraphDocument {
  schemaVersion: 1
  sourceBuild: string
  graphVersion: string
  builtAt: string
  segments: CanonicalSegment[]
  corridors: RigCorridor[]
}

export interface FreeRideGraphIndex extends FreeRideGraphDocument {
  segmentsByUid: ReadonlyMap<string, CanonicalSegment>
  outgoingByNode: ReadonlyMap<string, CanonicalSegment[]>
}

export interface FreeRideGraphOpportunity {
  id: string
  corridor: RigCorridor
  origin: Coordinate
  destination: Coordinate
  via: Coordinate[]
  routeFragment: Coordinate[]
  triggerDistanceMeters: number
}

const MAX_GRAPH_SEGMENTS = 50_000
const MAX_GRAPH_CORRIDORS = 4_096
const MAX_CORRIDOR_SEGMENTS = 4_096
const MAX_SEARCH_STEPS = 8_192
const MAX_MATCH_DISTANCE_METERS = 250
const MAX_FRAGMENT_POINTS = 512
const MIN_TRIGGER_DISTANCE_METERS = 400
const MAX_DIRECTION_DELTA_DEGREES = 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
}

function isFiniteCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 &&
    typeof value[1] === "number" && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90
}

function isRole(value: unknown): value is RigRouteRole {
  return value === "highlight" || value === "supporting" || value === "connector" || value === "unknown"
}

function isValidBounds(value: unknown): value is RigCorridor["bounds"] {
  if (!isRecord(value)) return false
  return typeof value.minLon === "number" && Number.isFinite(value.minLon) &&
    typeof value.minLat === "number" && Number.isFinite(value.minLat) &&
    typeof value.maxLon === "number" && Number.isFinite(value.maxLon) &&
    typeof value.maxLat === "number" && Number.isFinite(value.maxLat) &&
    value.minLon <= value.maxLon && value.minLat <= value.maxLat
}

function isValidProvenance(value: unknown, sourceBuild: string): value is RigCorridor["provenance"] {
  if (!isRecord(value)) return false
  return value.sourceBuild === sourceBuild && isIsoDate(value.builtAt) &&
    typeof value.segmentCount === "number" && Number.isSafeInteger(value.segmentCount) && value.segmentCount > 0 &&
    typeof value.observationCount === "number" && Number.isSafeInteger(value.observationCount) && value.observationCount >= 0 &&
    typeof value.independentSourceCount === "number" && Number.isSafeInteger(value.independentSourceCount) && value.independentSourceCount >= 0
}

function isValidCorridor(value: unknown, sourceBuild: string): value is RigCorridor {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.corridorId) || !Array.isArray(value.segmentUids) ||
    value.segmentUids.length === 0 || value.segmentUids.length > MAX_CORRIDOR_SEGMENTS ||
    !value.segmentUids.every(isNonEmptyString) || new Set(value.segmentUids).size !== value.segmentUids.length) {
    return false
  }
  return isNonEmptyString(value.entryNodeId) && isNonEmptyString(value.exitNodeId) &&
    typeof value.lengthMeters === "number" && Number.isFinite(value.lengthMeters) && value.lengthMeters > 0 &&
    isUnitInterval(value.expectedUtility) && isUnitInterval(value.confidence) &&
    isRole(value.dominantRole) && isRecord(value.dimensions) &&
    Object.values(value.dimensions).every(isUnitInterval) &&
    isValidBounds(value.bounds) && isValidProvenance(value.provenance, sourceBuild)
}

function assertGraphDocument(value: unknown): asserts value is FreeRideGraphDocument {
  if (!isRecord(value) || value.schemaVersion !== 1 ||
    !isNonEmptyString(value.sourceBuild) || !isNonEmptyString(value.graphVersion) ||
    !isIsoDate(value.builtAt) || !Array.isArray(value.segments) ||
    value.segments.length === 0 || value.segments.length > MAX_GRAPH_SEGMENTS ||
    !Array.isArray(value.corridors) || value.corridors.length > MAX_GRAPH_CORRIDORS) {
    throw new Error("Free Ride RIG graph document is invalid")
  }
  const segmentUids = new Set<string>()
  const segmentsByUid = new Map<string, CanonicalSegment>()
  for (const segment of value.segments) {
    if (!validateCanonicalSegment(segment) || segment.topologyVersion !== value.graphVersion || segmentUids.has(segment.segmentUid)) {
      throw new Error("Free Ride RIG graph contains an invalid or duplicate canonical segment")
    }
    segmentUids.add(segment.segmentUid)
    segmentsByUid.set(segment.segmentUid, segment)
  }
  const corridorUids = new Set<string>()
  for (const corridor of value.corridors) {
    if (!isValidCorridor(corridor, value.sourceBuild) || corridorUids.has(corridor.corridorId)) {
      throw new Error("Free Ride RIG graph contains an invalid or duplicate corridor")
    }
    corridorUids.add(corridor.corridorId)
    if (corridor.segmentUids.some((segmentUid) => !segmentUids.has(segmentUid))) {
      throw new Error("Free Ride RIG corridor references a missing canonical segment")
    }
    for (let index = 1; index < corridor.segmentUids.length; index += 1) {
      const previous = segmentsByUid.get(corridor.segmentUids[index - 1]!)
      const current = segmentsByUid.get(corridor.segmentUids[index]!)
      if (!previous || !current || previous.toOsmNodeId !== current.fromOsmNodeId) {
        throw new Error("Free Ride RIG corridor is not a directed contiguous path")
      }
    }
  }
}

/** Validate one bounded graph owner and prebuild its directed lookup maps. */
export function buildFreeRideGraph(value: unknown): FreeRideGraphIndex {
  assertGraphDocument(value)
  const segmentsByUid = new Map(value.segments.map((segment) => [segment.segmentUid, segment]))
  const outgoingByNode = new Map<string, CanonicalSegment[]>()
  for (const segment of value.segments) {
    outgoingByNode.set(segment.fromOsmNodeId, [
      ...(outgoingByNode.get(segment.fromOsmNodeId) ?? []),
      segment
    ])
  }
  for (const corridor of value.corridors) {
    const first = segmentsByUid.get(corridor.segmentUids[0]!)
    const last = segmentsByUid.get(corridor.segmentUids.at(-1)!)
    if (!first || !last || first.fromOsmNodeId !== corridor.entryNodeId || last.toOsmNodeId !== corridor.exitNodeId) {
      throw new Error(`Free Ride corridor ${corridor.corridorId} has inconsistent graph anchors`)
    }
  }
  return { ...value, segmentsByUid, outgoingByNode }
}

function toRadians(value: number): number {
  return value * Math.PI / 180
}

function bearingDegrees(from: Coordinate, to: Coordinate): number {
  const firstLat = toRadians(from[1])
  const secondLat = toRadians(to[1])
  const deltaLongitude = toRadians(to[0] - from[0])
  const y = Math.sin(deltaLongitude) * Math.cos(secondLat)
  const x = Math.cos(firstLat) * Math.sin(secondLat) -
    Math.sin(firstLat) * Math.cos(secondLat) * Math.cos(deltaLongitude)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function headingDeltaDegrees(left: number, right: number): number {
  return Math.abs(((right - left) + 540) % 360 - 180)
}

function segmentBearing(segment: CanonicalSegment): number {
  for (let index = 1; index < segment.geometry.length; index += 1) {
    if (haversine(segment.geometry[index - 1]!, segment.geometry[index]!) >= 2) {
      return bearingDegrees(segment.geometry[index - 1]!, segment.geometry[index]!)
    }
  }
  return bearingDegrees(segment.geometry[0]!, segment.geometry.at(-1)!)
}

function projectedDistance(point: Coordinate, start: Coordinate, finish: Coordinate): { distanceMeters: number; fraction: number } {
  const cosLatitude = Math.cos((start[1] + finish[1]) / 2 * Math.PI / 180)
  const ax = start[0] * cosLatitude
  const ay = start[1]
  const bx = finish[0] * cosLatitude
  const by = finish[1]
  const px = point[0] * cosLatitude
  const py = point[1]
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const fraction = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  const closest: Coordinate = [
    (ax + dx * fraction) / Math.max(0.000001, cosLatitude),
    ay + dy * fraction
  ]
  return { distanceMeters: haversine(point, closest), fraction }
}

function nearestOnSegment(point: Coordinate, segment: CanonicalSegment): { distanceMeters: number; offsetMeters: number } {
  let bestDistance = Number.POSITIVE_INFINITY
  let bestOffset = 0
  let offset = 0
  for (let index = 1; index < segment.geometry.length; index += 1) {
    const start = segment.geometry[index - 1]!
    const finish = segment.geometry[index]!
    const edgeLength = haversine(start, finish)
    const projection = projectedDistance(point, start, finish)
    if (projection.distanceMeters < bestDistance) {
      bestDistance = projection.distanceMeters
      bestOffset = offset + edgeLength * projection.fraction
    }
    offset += edgeLength
  }
  return { distanceMeters: bestDistance, offsetMeters: bestOffset }
}

function boundedGeometry(geometry: Coordinate[]): Coordinate[] {
  if (geometry.length <= MAX_FRAGMENT_POINTS) return geometry
  const result: Coordinate[] = []
  for (let index = 0; index < MAX_FRAGMENT_POINTS; index += 1) {
    const sourceIndex = Math.round(index * (geometry.length - 1) / (MAX_FRAGMENT_POINTS - 1))
    const coordinate = geometry[sourceIndex]
    if (coordinate && result.at(-1) !== coordinate) result.push(coordinate)
  }
  return result
}

function corridorGeometry(graph: FreeRideGraphIndex, corridor: RigCorridor): Coordinate[] {
  const geometry: Coordinate[] = []
  for (const segmentUid of corridor.segmentUids) {
    const segment = graph.segmentsByUid.get(segmentUid)
    if (!segment) return []
    geometry.push(...(geometry.length === 0 ? segment.geometry : segment.geometry.slice(1)))
  }
  return boundedGeometry(geometry)
}

function matchCurrentSegment(
  graph: FreeRideGraphIndex,
  position: Coordinate,
  heading: number | null
): { segment: CanonicalSegment; offsetMeters: number } | null {
  let best: { segment: CanonicalSegment; offsetMeters: number; score: number } | null = null
  for (const segment of graph.segments) {
    const headingDelta = heading == null ? 0 : headingDeltaDegrees(heading, segmentBearing(segment))
    if (heading != null && headingDelta > MAX_DIRECTION_DELTA_DEGREES) continue
    const match = nearestOnSegment(position, segment)
    if (match.distanceMeters > MAX_MATCH_DISTANCE_METERS) continue
    const score = match.distanceMeters + headingDelta * 0.5
    if (!best || score < best.score || score === best.score && segment.segmentUid < best.segment.segmentUid) {
      best = { segment, offsetMeters: match.offsetMeters, score }
    }
  }
  return best ? { segment: best.segment, offsetMeters: best.offsetMeters } : null
}

interface QueueEntry {
  nodeId: string
  distanceMeters: number
}

function reachableSegments(
  graph: FreeRideGraphIndex,
  match: { segment: CanonicalSegment; offsetMeters: number },
  horizonMeters: number
): Map<string, number> {
  const reachable = new Map([[match.segment.segmentUid, 0]])
  const bestNodeDistance = new Map<string, number>([[
    match.segment.toOsmNodeId,
    Math.max(0, match.segment.lengthMeters - match.offsetMeters)
  ]])
  const queue: QueueEntry[] = [{
    nodeId: match.segment.toOsmNodeId,
    distanceMeters: Math.max(0, match.segment.lengthMeters - match.offsetMeters)
  }]
  let steps = 0
  while (queue.length > 0 && steps < MAX_SEARCH_STEPS) {
    queue.sort((left, right) => left.distanceMeters - right.distanceMeters || left.nodeId.localeCompare(right.nodeId))
    const current = queue.shift()!
    if (current.distanceMeters !== bestNodeDistance.get(current.nodeId)) continue
    steps += 1
    for (const segment of graph.outgoingByNode.get(current.nodeId) ?? []) {
      const distance = current.distanceMeters
      const endDistance = distance + segment.lengthMeters
      if (endDistance > horizonMeters) continue
      const knownSegment = reachable.get(segment.segmentUid)
      if (knownSegment !== undefined && knownSegment <= distance) continue
      reachable.set(segment.segmentUid, distance)
      const knownNode = bestNodeDistance.get(segment.toOsmNodeId)
      if (knownNode === undefined || endDistance < knownNode) {
        bestNodeDistance.set(segment.toOsmNodeId, endDistance)
        queue.push({ nodeId: segment.toOsmNodeId, distanceMeters: endDistance })
      }
    }
  }
  return reachable
}

function findRejoinSegment(
  graph: FreeRideGraphIndex,
  corridor: RigCorridor,
  recentSegmentUids: ReadonlySet<string>
): CanonicalSegment | null {
  const last = graph.segmentsByUid.get(corridor.segmentUids.at(-1)!)
  if (!last) return null
  const corridorUids = new Set(corridor.segmentUids)
  return (graph.outgoingByNode.get(last.toOsmNodeId) ?? [])
    .filter((segment) => !corridorUids.has(segment.segmentUid) && !recentSegmentUids.has(segment.segmentUid))
    .filter((segment) => headingDeltaDegrees(segmentBearing(last), segmentBearing(segment)) <= MAX_DIRECTION_DELTA_DEGREES)
    .sort((left, right) => left.segmentUid.localeCompare(right.segmentUid))[0] ?? null
}

export function reachableHorizonMeters(speedMph: number | undefined): number {
  if (!Number.isFinite(speedMph) || speedMph == null || speedMph < 25) return 6 * 1_609.344
  if (speedMph < 45) return 10 * 1_609.344
  if (speedMph < 65) return 16 * 1_609.344
  return 22 * 1_609.344
}

/** Find only directed, forward RIG corridors with a real onward rejoin. */
export function findFreeRideOpportunities(
  graph: FreeRideGraphIndex,
  position: Coordinate,
  heading: number | null,
  speedMph?: number,
  recentSegmentUids: ReadonlySet<string> = new Set()
): FreeRideGraphOpportunity[] {
  if (!isFiniteCoordinate(position)) return []
  const match = matchCurrentSegment(graph, position, heading)
  if (!match) return []
  const reachable = reachableSegments(graph, match, reachableHorizonMeters(speedMph))
  const opportunities: FreeRideGraphOpportunity[] = []
  for (const corridor of graph.corridors) {
    if (corridor.segmentUids.some((segmentUid) => recentSegmentUids.has(segmentUid))) continue
    const entryUid = corridor.segmentUids[0]
    const entryDistance = reachable.get(entryUid)
    if (entryDistance === undefined || entryDistance < MIN_TRIGGER_DISTANCE_METERS) continue
    const fragment = corridorGeometry(graph, corridor)
    const first = graph.segmentsByUid.get(entryUid)
    const last = graph.segmentsByUid.get(corridor.segmentUids.at(-1)!)
    const rejoin = findRejoinSegment(graph, corridor, recentSegmentUids)
    if (!first || !last || !rejoin || fragment.length < 2) continue
    const destination = rejoin.geometry.at(-1)
    if (!destination) continue
    opportunities.push({
      id: `rig-${graph.sourceBuild}-${corridor.corridorId}`,
      corridor,
      origin: position,
      destination,
      via: [first.geometry[0]!, last.geometry.at(-1)!],
      routeFragment: fragment,
      triggerDistanceMeters: Number(entryDistance.toFixed(1))
    })
  }
  return opportunities
    .sort((left, right) => right.corridor.expectedUtility - left.corridor.expectedUtility ||
      left.triggerDistanceMeters - right.triggerDistanceMeters || left.id.localeCompare(right.id))
    .slice(0, 3)
}

/** Distance-weighted geometry coverage used to verify the accepted corridor. */
export function fragmentTraversalRatio(routeGeometry: Coordinate[], fragment: Coordinate[]): number {
  if (routeGeometry.length < 2 || fragment.length < 2) return 0
  const samples: Coordinate[] = [fragment[0]!]
  let carry = 0
  for (let index = 0; index < fragment.length - 1; index += 1) {
    const start = fragment[index]!
    const finish = fragment[index + 1]!
    const distance = haversine(start, finish)
    let position = 120 - carry
    while (position < distance) {
      const ratio = position / distance
      samples.push([
        start[0] + (finish[0] - start[0]) * ratio,
        start[1] + (finish[1] - start[1]) * ratio
      ])
      position += 120
    }
    carry = Math.max(0, distance - (position - 120))
  }
  samples.push(fragment.at(-1)!)
  const covered = samples.filter((point) => routeGeometry.slice(1).some((finish, index) =>
    pointToSegmentDistanceMeters(point, routeGeometry[index]!, finish) <= 140
  )).length
  return samples.length > 0 ? covered / samples.length : 0
}
