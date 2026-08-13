import { coordinateDistanceMeters } from "@/lib/client/navigation-engine"
import type { Coordinate, PlannedRoute, Waypoint } from "@/lib/routing/types"

const MAX_JOIN_CANDIDATES = 32
const MAX_APPROACH_DISTANCE_METERS = 50_000
const MIN_REMAINING_DISTANCE_METERS = 500
const JOIN_SPEED_METERS_PER_SECOND = 13.4

export type GpxJoinCandidateKind = "original-start" | "nearby-forward" | "waypoint"
export type GpxJoinChoice = "best" | "original-start" | number

export interface GpxJoinCandidate {
  index: number
  kind: GpxJoinCandidateKind
  label: string
  coordinate: Coordinate
  approachDistanceMeters: number
  remainingDistanceMeters: number
  directionMismatchDegrees: number | null
  score: number
  rejectedReason?: "approach-too-far" | "too-little-route" | "direction-mismatch"
}

export interface GpxJoinPreview {
  currentLocation: Coordinate
  candidates: GpxJoinCandidate[]
  bestIndex: number | null
}

function bearingDegrees(start: Coordinate, finish: Coordinate): number {
  const radians = (value: number) => value * Math.PI / 180
  const latitude = radians(start[1])
  const targetLatitude = radians(finish[1])
  const longitudeDelta = radians(finish[0] - start[0])
  const y = Math.sin(longitudeDelta) * Math.cos(targetLatitude)
  const x = Math.cos(latitude) * Math.sin(targetLatitude) -
    Math.sin(latitude) * Math.cos(targetLatitude) * Math.cos(longitudeDelta)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function headingDifference(first: number, second: number): number {
  const difference = Math.abs(first - second) % 360
  return Math.min(difference, 360 - difference)
}

function cumulativeDistances(geometry: Coordinate[]): number[] {
  const distances = [0]
  for (let index = 1; index < geometry.length; index += 1) {
    distances.push(distances[index - 1]! + coordinateDistanceMeters(geometry[index - 1]!, geometry[index]!))
  }
  return distances
}

function nearestGeometryIndex(geometry: Coordinate[], coordinate: Coordinate): number {
  return geometry.reduce((nearest, candidate, index) =>
    coordinateDistanceMeters(candidate, coordinate) < coordinateDistanceMeters(geometry[nearest]!, coordinate)
      ? index
      : nearest, 0)
}

function candidateLabel(kind: GpxJoinCandidateKind, index: number, waypoint?: Waypoint): string {
  if (kind === "original-start") return "Original start"
  if (kind === "waypoint") return waypoint?.label?.trim() || `GPX waypoint ${index + 1}`
  return `Track entry ${index + 1}`
}

export function buildGpxJoinPreview(
  geometry: Coordinate[],
  waypoints: Waypoint[],
  currentLocation: Coordinate,
  headingDegrees: number | null = null
): GpxJoinPreview {
  if (geometry.length < 2) throw new Error("A GPX join needs at least two track points.")
  if (!currentLocation.every(Number.isFinite)) throw new Error("The current location is invalid.")

  const distances = cumulativeDistances(geometry)
  const totalDistance = distances.at(-1) ?? 0
  const nearest = nearestGeometryIndex(geometry, currentLocation)
  const indexes = new Map<number, { kind: GpxJoinCandidateKind; waypoint?: Waypoint }>()
  indexes.set(0, { kind: "original-start" })
  const offsets = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256]
  for (const offset of offsets) {
    const index = Math.min(geometry.length - 1, nearest + offset)
    if (index >= nearest) indexes.set(index, { kind: "nearby-forward" })
  }
  for (const waypoint of waypoints) {
    const index = nearestGeometryIndex(geometry, [waypoint.lon, waypoint.lat])
    if (index >= nearest || index === 0) indexes.set(index, { kind: index === 0 ? "original-start" : "waypoint", waypoint })
  }

  const candidates = [...indexes.entries()]
    .sort(([left], [right]) => left - right)
    .slice(0, MAX_JOIN_CANDIDATES)
    .map(([index, metadata]): GpxJoinCandidate => {
      const coordinate = geometry[index]!
      const approachDistanceMeters = coordinateDistanceMeters(currentLocation, coordinate)
      const remainingDistanceMeters = Math.max(0, totalDistance - distances[index]!)
      const next = geometry[Math.min(geometry.length - 1, index + 1)]!
      const directionMismatchDegrees = headingDegrees == null || index === geometry.length - 1
        ? null
        : headingDifference(headingDegrees, bearingDegrees(coordinate, next))
      const backwardsTravel = index < nearest ? (nearest - index) * 10 : 0
      const semanticSkipPenalty = metadata.kind === "waypoint" ? 0 : Math.min(120, index / geometry.length * 120)
      const directionPenalty = directionMismatchDegrees == null ? 0 : directionMismatchDegrees * 2
      const userPreference = metadata.kind === "waypoint" ? 30 : 0
      const score =
        -(approachDistanceMeters / JOIN_SPEED_METERS_PER_SECOND) -
        backwardsTravel -
        semanticSkipPenalty -
        directionPenalty +
        remainingDistanceMeters / 100 +
        userPreference
      const rejectedReason = approachDistanceMeters > MAX_APPROACH_DISTANCE_METERS
        ? "approach-too-far"
        : remainingDistanceMeters < MIN_REMAINING_DISTANCE_METERS
          ? "too-little-route"
          : directionMismatchDegrees != null && directionMismatchDegrees > 135
            ? "direction-mismatch"
            : undefined
      return {
        index,
        kind: metadata.kind,
        label: candidateLabel(metadata.kind, index, metadata.waypoint),
        coordinate,
        approachDistanceMeters: Math.round(approachDistanceMeters),
        remainingDistanceMeters: Math.round(remainingDistanceMeters),
        directionMismatchDegrees: directionMismatchDegrees == null ? null : Math.round(directionMismatchDegrees),
        score: Number(score.toFixed(2)),
        ...(rejectedReason ? { rejectedReason } : {})
      }
    })
  const best = candidates
    .filter((candidate) => !candidate.rejectedReason)
    .sort((left, right) => right.score - left.score)[0]

  return {
    currentLocation,
    candidates,
    bestIndex: best?.index ?? null
  }
}

export function resolveGpxJoinCandidate(preview: GpxJoinPreview, choice: GpxJoinChoice): GpxJoinCandidate {
  const index = choice === "best"
    ? preview.bestIndex
    : choice === "original-start"
      ? 0
      : choice
  if (index == null) throw new Error("No safe GPX entry was found from the current location.")
  const candidate = preview.candidates.find((entry) => entry.index === index)
  if (!candidate) throw new Error("That GPX entry is no longer available.")
  if (candidate.rejectedReason) throw new Error(`That GPX entry was rejected: ${candidate.rejectedReason.replaceAll("-", " ")}.`)
  return candidate
}

function appendWithoutDuplicate(target: Coordinate[], source: Coordinate[]): number {
  const start = source[0] && target.at(-1) && coordinateDistanceMeters(target.at(-1)!, source[0]!) <= 5 ? 1 : 0
  const startIndex = target.length
  target.push(...source.slice(start))
  return startIndex + (start === 1 ? -1 : 0)
}

function blendMix(first: Record<string, number>, firstDistance: number, second: Record<string, number>, secondDistance: number): Record<string, number> {
  const firstEntries = Object.entries(first)
  const secondEntries = Object.entries(second)
  const total = firstDistance + secondDistance
  if (total <= 0) return {}
  const weighted = new Map<string, number>()
  const add = (entries: [string, number][], distance: number) => {
    if (entries.length === 0) {
      weighted.set("unknown", (weighted.get("unknown") ?? 0) + distance / total * 100)
      return
    }
    for (const [key, share] of entries) weighted.set(key, (weighted.get(key) ?? 0) + share * distance / total)
  }
  add(firstEntries, firstDistance)
  add(secondEntries, secondDistance)
  return Object.fromEntries([...weighted].map(([key, value]) => [key, Number(value.toFixed(2))]))
}

function sourceWaypointIndexes(route: PlannedRoute): Array<{ waypoint: Waypoint; index: number }> {
  return route.waypoints.map((waypoint) => ({
    waypoint,
    index: nearestGeometryIndex(route.geometry, [waypoint.lon, waypoint.lat])
  }))
}

export function joinGpxRoute(
  route: PlannedRoute,
  approach: PlannedRoute,
  candidate: GpxJoinCandidate
): PlannedRoute {
  if (route.geometry.length < 2 || approach.geometry.length < 2) throw new Error("A GPX join needs two valid route geometries.")
  if (route.previewOnly || approach.previewOnly) throw new Error("Preview-only geometry cannot become a joined ride route.")
  if (candidate.index < 0 || candidate.index >= route.geometry.length || candidate.rejectedReason) {
    throw new Error("The selected GPX entry is invalid.")
  }
  if (coordinateDistanceMeters(approach.geometry.at(-1)!, candidate.coordinate) > 250) {
    throw new Error("The routed approach did not reach the selected GPX entry.")
  }
  const tail = route.geometry.slice(candidate.index)
  if (tail.length < 2) throw new Error("The selected GPX entry leaves too little track to ride.")
  const geometry = [...approach.geometry]
  const gpxLegStartIndex = appendWithoutDuplicate(geometry, tail)
  const approachDistanceMeters = distancesFor(approach.geometry)
  const gpxDistanceMeters = distancesFor(tail)
  const totalDistanceMeters = approachDistanceMeters + gpxDistanceMeters
  const distanceMiles = Number((totalDistanceMeters / 1609.344).toFixed(2))
  const gpxDuration = route.durationMinutes * (gpxDistanceMeters / Math.max(1, distancesFor(route.geometry)))
  const durationMinutes = Number((approach.durationMinutes + gpxDuration).toFixed(2))
  const sourceWaypoints = sourceWaypointIndexes(route)
    .filter(({ index }) => index >= candidate.index)
    .map(({ waypoint }) => ({ ...waypoint }))

  return {
    ...route,
    id: `${route.id}-join-${candidate.index}-${approach.id}`,
    name: `${route.name} · joined`,
    geometry,
    waypoints: [...approach.waypoints.map((waypoint) => ({ ...waypoint })), ...sourceWaypoints],
    instructions: approach.instructions.map((instruction) => ({ ...instruction, interval: [...instruction.interval] as [number, number] })),
    distanceMiles,
    durationMinutes,
    ascentMeters: route.ascentMeters == null || approach.ascentMeters == null
      ? null
      : approach.ascentMeters + route.ascentMeters * gpxDistanceMeters / Math.max(1, distancesFor(route.geometry)),
    descentMeters: route.descentMeters == null || approach.descentMeters == null
      ? null
      : approach.descentMeters + route.descentMeters * gpxDistanceMeters / Math.max(1, distancesFor(route.geometry)),
    twistiness: Number(((approach.twistiness * approachDistanceMeters + route.twistiness * gpxDistanceMeters) / Math.max(1, totalDistanceMeters)).toFixed(1)),
    turnCount: approach.turnCount,
    roadMix: blendMix(approach.roadMix, approachDistanceMeters, route.roadMix, gpxDistanceMeters),
    surfaceMix: blendMix(approach.surfaceMix, approachDistanceMeters, route.surfaceMix, gpxDistanceMeters),
    routingSource: "imported",
    provider: approach.provider,
    providerVersion: approach.providerVersion,
    navigationMode: "continuous-track",
    gpxLegStartIndex,
    gpxParentRouteId: route.id,
    derivativeProvenance: {
      parentRouteId: route.id,
      parentRevision: route.id,
      changedSegmentPercent: Number((approachDistanceMeters / Math.max(1, totalDistanceMeters) * 100).toFixed(1)),
      creator: "rider",
      modifiedAt: new Date().toISOString(),
      visibility: "private"
    }
  }
}

function distancesFor(geometry: Coordinate[]): number {
  let total = 0
  for (let index = 1; index < geometry.length; index += 1) total += coordinateDistanceMeters(geometry[index - 1]!, geometry[index]!)
  return total
}
