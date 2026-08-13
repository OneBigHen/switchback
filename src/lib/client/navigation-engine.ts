import type { Coordinate, PlannedRoute, RouteInstruction, Waypoint } from "@/lib/routing/types"

const EARTH_RADIUS_METERS = 6_371_000
const MAX_GUIDANCE_ACCURACY_METERS = 100
const MIN_OFF_ROUTE_METERS = 35
const OFF_ROUTE_FIXES_REQUIRED = 3
const MANEUVER_PASS_METERS = 20
const ARRIVAL_RADIUS_METERS = 35
const AMBIGUOUS_ROUTE_SEPARATION_METERS = 100
const AMBIGUOUS_SCORE_MARGIN = 30
// Smaller cells keep long, detailed tracks from putting thousands of
// neighboring segments into one lookup window while retaining a generous
// two-cell search radius for normal GPS uncertainty.
const SPATIAL_CELL_DEGREES = 0.001
const SPATIAL_MATCH_RADIUS_CELLS = 2
const MAX_INDEX_CELLS_PER_SEGMENT = 256
const CONTINUITY_SEGMENT_WINDOW = 160

export type NavigationStatus =
  | "navigating"
  | "deviating"
  | "off-route"
  | "uncertain"
  | "weak-signal"
  | "arrived"

export interface NavigationFix {
  coordinate: Coordinate
  accuracyMeters: number
  headingDegrees: number | null
  speedMetersPerSecond: number | null
  timestamp: number
}

interface NavigationSegment {
  index: number
  start: Coordinate
  finish: Coordinate
  startDistanceMeters: number
  lengthMeters: number
  bearingDegrees: number
}

interface NavigationInstruction {
  instruction: RouteInstruction
  routeIndex: number
  distanceFromStartMeters: number
}

export interface NavigationModel {
  route: PlannedRoute
  segments: NavigationSegment[]
  cumulativeDistances: number[]
  totalDistanceMeters: number
  instructions: NavigationInstruction[]
  spatialIndex: Map<string, number[]>
  unindexedSegmentIndices: number[]
}

export interface NavigationFrame {
  status: NavigationStatus
  rawCoordinate: Coordinate
  matchedCoordinate: Coordinate
  accuracyMeters: number
  headingDegrees: number | null
  speedMetersPerSecond: number | null
  timestamp: number
  segmentIndex: number
  segmentFraction: number
  matchedDistanceMeters: number
  distanceFromRouteMeters: number
  routePercent: number
  remainingDistanceMeters: number
  remainingDurationSeconds: number
  instructionIndex: number
  instruction: RouteInstruction | null
  thenInstruction: RouteInstruction | null
  distanceToInstructionMeters: number
  offRouteFixCount: number
  offRouteSince: number | null
  matchAmbiguous: boolean
  /** Bearing of the matched track segment for breadcrumb direction cues. */
  routeBearingDegrees?: number
}

interface SegmentProjection {
  segment: NavigationSegment
  fraction: number
  coordinate: Coordinate
  distanceMeters: number
  routeDistanceMeters: number
  score: number
}

function radians(value: number): number {
  return value * Math.PI / 180
}

function degrees(value: number): number {
  return value * 180 / Math.PI
}

export function coordinateDistanceMeters(first: Coordinate, second: Coordinate): number {
  const firstLatitude = radians(first[1])
  const secondLatitude = radians(second[1])
  const latitudeDelta = secondLatitude - firstLatitude
  const longitudeDelta = radians(second[0] - first[0])
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine))
}

function segmentBearingDegrees(start: Coordinate, finish: Coordinate): number {
  const startLatitude = radians(start[1])
  const finishLatitude = radians(finish[1])
  const longitudeDelta = radians(finish[0] - start[0])
  const y = Math.sin(longitudeDelta) * Math.cos(finishLatitude)
  const x = Math.cos(startLatitude) * Math.sin(finishLatitude) -
    Math.sin(startLatitude) * Math.cos(finishLatitude) * Math.cos(longitudeDelta)
  return (degrees(Math.atan2(y, x)) + 360) % 360
}

function headingDifference(first: number, second: number): number {
  const difference = Math.abs(first - second) % 360
  return Math.min(difference, 360 - difference)
}

function projectOntoSegment(location: Coordinate, segment: NavigationSegment): Omit<SegmentProjection, "score"> {
  const latitudeScale = EARTH_RADIUS_METERS * Math.PI / 180
  const longitudeScale = latitudeScale * Math.cos(radians(location[1]))
  const startX = (segment.start[0] - location[0]) * longitudeScale
  const startY = (segment.start[1] - location[1]) * latitudeScale
  const finishX = (segment.finish[0] - location[0]) * longitudeScale
  const finishY = (segment.finish[1] - location[1]) * latitudeScale
  const segmentX = finishX - startX
  const segmentY = finishY - startY
  const lengthSquared = segmentX ** 2 + segmentY ** 2
  const fraction = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, -(startX * segmentX + startY * segmentY) / lengthSquared))
  const projectedX = startX + segmentX * fraction
  const projectedY = startY + segmentY * fraction
  const coordinate: Coordinate = [
    segment.start[0] + (segment.finish[0] - segment.start[0]) * fraction,
    segment.start[1] + (segment.finish[1] - segment.start[1]) * fraction
  ]
  return {
    segment,
    fraction,
    coordinate,
    distanceMeters: Math.hypot(projectedX, projectedY),
    routeDistanceMeters: segment.startDistanceMeters + segment.lengthMeters * fraction
  }
}

function spatialCell(value: number): number {
  return Math.floor(value / SPATIAL_CELL_DEGREES)
}

function spatialKey(longitudeCell: number, latitudeCell: number): string {
  return `${longitudeCell}:${latitudeCell}`
}

function buildSpatialIndex(segments: NavigationSegment[]): {
  spatialIndex: Map<string, number[]>
  unindexedSegmentIndices: number[]
} {
  const spatialIndex = new Map<string, number[]>()
  const unindexedSegmentIndices: number[] = []
  for (const segment of segments) {
    const minLongitudeCell = spatialCell(Math.min(segment.start[0], segment.finish[0]))
    const maxLongitudeCell = spatialCell(Math.max(segment.start[0], segment.finish[0]))
    const minLatitudeCell = spatialCell(Math.min(segment.start[1], segment.finish[1]))
    const maxLatitudeCell = spatialCell(Math.max(segment.start[1], segment.finish[1]))
    const cellCount = (maxLongitudeCell - minLongitudeCell + 1) *
      (maxLatitudeCell - minLatitudeCell + 1)
    if (cellCount > MAX_INDEX_CELLS_PER_SEGMENT) {
      unindexedSegmentIndices.push(segment.index)
      continue
    }
    for (let longitudeCell = minLongitudeCell; longitudeCell <= maxLongitudeCell; longitudeCell += 1) {
      for (let latitudeCell = minLatitudeCell; latitudeCell <= maxLatitudeCell; latitudeCell += 1) {
        const key = spatialKey(longitudeCell, latitudeCell)
        const indices = spatialIndex.get(key)
        if (indices) indices.push(segment.index)
        else spatialIndex.set(key, [segment.index])
      }
    }
  }
  return { spatialIndex, unindexedSegmentIndices }
}

export function buildNavigationModel(route: PlannedRoute): NavigationModel {
  const cumulativeDistances = [0]
  const segments = route.geometry.slice(0, -1).map((start, index) => {
    const finish = route.geometry[index + 1]!
    const lengthMeters = coordinateDistanceMeters(start, finish)
    const segment: NavigationSegment = {
      index,
      start,
      finish,
      startDistanceMeters: cumulativeDistances[index]!,
      lengthMeters,
      bearingDegrees: segmentBearingDegrees(start, finish)
    }
    cumulativeDistances.push(segment.startDistanceMeters + lengthMeters)
    return segment
  })
  const totalDistanceMeters = cumulativeDistances.at(-1) ?? 0
  const instructions = route.instructions.map((instruction, routeIndex) => {
    const geometryIndex = Math.min(
      Math.max(0, instruction.interval[0]),
      Math.max(0, route.geometry.length - 1)
    )
    return {
      instruction,
      routeIndex,
      distanceFromStartMeters: cumulativeDistances[geometryIndex] ?? totalDistanceMeters
    }
  })
  const { spatialIndex, unindexedSegmentIndices } = buildSpatialIndex(segments)

  return {
    route,
    segments,
    cumulativeDistances,
    totalDistanceMeters,
    instructions,
    spatialIndex,
    unindexedSegmentIndices
  }
}

function continuityPenalty(
  routeDistanceMeters: number,
  fix: NavigationFix,
  previous: NavigationFrame | undefined
): number {
  if (!previous || previous.status === "weak-signal") return 0
  const elapsedSeconds = Math.max(0.1, Math.min(30, (fix.timestamp - previous.timestamp) / 1_000))
  const routeDelta = routeDistanceMeters - previous.matchedDistanceMeters
  const expectedTravel = Math.max(0, fix.speedMetersPerSecond ?? previous.speedMetersPerSecond ?? 0) * elapsedSeconds
  const backwardTolerance = Math.max(35, fix.accuracyMeters * 2)
  const forwardTolerance = Math.max(160, expectedTravel * 4 + fix.accuracyMeters * 2)
  let penalty = Math.min(Math.abs(routeDelta - expectedTravel) * 0.08, 120)
  if (routeDelta < -backwardTolerance) penalty += Math.min(Math.abs(routeDelta) * 0.55, 600)
  if (routeDelta > forwardTolerance) penalty += Math.min((routeDelta - forwardTolerance) * 0.35, 600)
  return penalty
}

function matchRoute(
  model: NavigationModel,
  fix: NavigationFix,
  previous?: NavigationFrame
): { match: SegmentProjection; ambiguous: boolean } {
  if (model.segments.length === 0) {
    const coordinate = model.route.geometry[0] ?? fix.coordinate
    const emptySegment: NavigationSegment = {
      index: 0,
      start: coordinate,
      finish: coordinate,
      startDistanceMeters: 0,
      lengthMeters: 0,
      bearingDegrees: 0
    }
    return {
      match: {
        segment: emptySegment,
        fraction: 0,
        coordinate,
        distanceMeters: coordinateDistanceMeters(fix.coordinate, coordinate),
        routeDistanceMeters: 0,
        score: 0
      },
      ambiguous: false
    }
  }

  const normalizedHeading = fix.headingDegrees == null || !Number.isFinite(fix.headingDegrees)
    ? null
    : (fix.headingDegrees % 360 + 360) % 360
  const useHeading = normalizedHeading != null && (fix.speedMetersPerSecond ?? 0) >= 1.5
  const segmentIndices = new Set(model.unindexedSegmentIndices)
  const longitudeCell = spatialCell(fix.coordinate[0])
  const latitudeCell = spatialCell(fix.coordinate[1])
  for (let longitudeOffset = -SPATIAL_MATCH_RADIUS_CELLS; longitudeOffset <= SPATIAL_MATCH_RADIUS_CELLS; longitudeOffset += 1) {
    for (let latitudeOffset = -SPATIAL_MATCH_RADIUS_CELLS; latitudeOffset <= SPATIAL_MATCH_RADIUS_CELLS; latitudeOffset += 1) {
      const indices = model.spatialIndex.get(spatialKey(
        longitudeCell + longitudeOffset,
        latitudeCell + latitudeOffset
      ))
      for (const index of indices ?? []) segmentIndices.add(index)
    }
  }
  if (previous) {
    const startIndex = Math.max(0, previous.segmentIndex - CONTINUITY_SEGMENT_WINDOW)
    const finishIndex = Math.min(model.segments.length - 1, previous.segmentIndex + CONTINUITY_SEGMENT_WINDOW)
    for (let index = startIndex; index <= finishIndex; index += 1) segmentIndices.add(index)
  }
  const candidateSegments = segmentIndices.size > 0
    ? Array.from(segmentIndices, (index) => model.segments[index]).filter((segment): segment is NavigationSegment => segment != null)
    : model.segments
  const projections = candidateSegments.map((segment) => {
    const projection = projectOntoSegment(fix.coordinate, segment)
    const headingPenalty = useHeading
      ? headingDifference(normalizedHeading, segment.bearingDegrees) * 0.55
      : 0
    return {
      ...projection,
      score: projection.distanceMeters + headingPenalty +
        continuityPenalty(projection.routeDistanceMeters, fix, previous)
    }
  })
  const nearestDistance = Math.min(...projections.map((projection) => projection.distanceMeters))
  const distanceWindow = Math.max(45, Math.min(100, fix.accuracyMeters * 1.5))
  const candidates = projections
    .filter((projection) => projection.distanceMeters <= nearestDistance + distanceWindow)
    .sort((first, second) => first.score - second.score)
  const match = candidates[0]!
  const alternative = candidates.find((candidate) =>
    candidate !== match &&
    Math.abs(candidate.routeDistanceMeters - match.routeDistanceMeters) > AMBIGUOUS_ROUTE_SEPARATION_METERS
  )
  const ambiguous = match.distanceMeters <= Math.max(60, fix.accuracyMeters * 2) &&
    alternative != null && alternative.score - match.score < AMBIGUOUS_SCORE_MARGIN
  return { match, ambiguous }
}

function instructionAt(
  model: NavigationModel,
  routeDistanceMeters: number,
  segmentIndex: number
): { index: number; instruction: RouteInstruction | null; then: RouteInstruction | null; distance: number } {
  if (
    model.route.navigationMode === "continuous-track" &&
    model.route.gpxLegStartIndex != null &&
    segmentIndex >= model.route.gpxLegStartIndex
  ) {
    return { index: -1, instruction: null, then: null, distance: 0 }
  }
  const instruction = model.instructions.find((candidate) =>
    candidate.distanceFromStartMeters >= routeDistanceMeters - MANEUVER_PASS_METERS
  ) ?? model.instructions.at(-1)
  if (!instruction) return { index: -1, instruction: null, then: null, distance: 0 }
  return {
    index: instruction.routeIndex,
    instruction: instruction.instruction,
    then: model.instructions[instruction.routeIndex + 1]?.instruction ?? null,
    distance: Math.max(0, instruction.distanceFromStartMeters - routeDistanceMeters)
  }
}

export function updateNavigation(
  model: NavigationModel,
  fix: NavigationFix,
  previous?: NavigationFrame
): NavigationFrame {
  const movementMeters = previous
    ? coordinateDistanceMeters(previous.rawCoordinate, fix.coordinate)
    : 0
  const derivedHeading = fix.headingDegrees == null && previous &&
    movementMeters >= Math.max(5, Math.min(15, fix.accuracyMeters))
    ? segmentBearingDegrees(previous.rawCoordinate, fix.coordinate)
    : null
  const effectiveFix = derivedHeading == null ? fix : { ...fix, headingDegrees: derivedHeading }
  if (fix.accuracyMeters > MAX_GUIDANCE_ACCURACY_METERS && previous) {
    return {
      ...previous,
      status: "weak-signal",
      rawCoordinate: fix.coordinate,
      accuracyMeters: fix.accuracyMeters,
      headingDegrees: effectiveFix.headingDegrees,
      speedMetersPerSecond: fix.speedMetersPerSecond,
      timestamp: fix.timestamp
    }
  }

  const { match, ambiguous } = matchRoute(model, effectiveFix, previous)
  const totalDistance = model.totalDistanceMeters
  const routePercent = totalDistance > 0
    ? Math.max(0, Math.min(100, match.routeDistanceMeters / totalDistance * 100))
    : 0
  const remainingDistanceMeters = Math.max(0, totalDistance - match.routeDistanceMeters)
  const endpoint = model.route.geometry.at(-1) ?? match.coordinate
  const reachedEndpoint = coordinateDistanceMeters(fix.coordinate, endpoint) <= ARRIVAL_RADIUS_METERS &&
    routePercent >= 90
  const offRouteThreshold = Math.max(
    MIN_OFF_ROUTE_METERS,
    Math.min(80, Math.max(0, fix.accuracyMeters) * 2.2)
  )
  const deviating = match.distanceMeters > offRouteThreshold
  const offRouteFixCount = deviating ? (previous?.offRouteFixCount ?? 0) + 1 : 0
  const offRouteSince = deviating ? previous?.offRouteSince ?? fix.timestamp : null
  const instruction = instructionAt(model, match.routeDistanceMeters, match.segment.index)
  const status: NavigationStatus = fix.accuracyMeters > MAX_GUIDANCE_ACCURACY_METERS
    ? "weak-signal"
    : reachedEndpoint
      ? "arrived"
      : offRouteFixCount >= OFF_ROUTE_FIXES_REQUIRED
        ? "off-route"
        : deviating
          ? "deviating"
          : ambiguous
            ? "uncertain"
            : "navigating"

  return {
    status,
    rawCoordinate: fix.coordinate,
    matchedCoordinate: match.coordinate,
    accuracyMeters: fix.accuracyMeters,
    headingDegrees: effectiveFix.headingDegrees,
    speedMetersPerSecond: fix.speedMetersPerSecond,
    timestamp: fix.timestamp,
    segmentIndex: match.segment.index,
    segmentFraction: match.fraction,
    matchedDistanceMeters: match.routeDistanceMeters,
    distanceFromRouteMeters: match.distanceMeters,
    routePercent,
    remainingDistanceMeters,
    remainingDurationSeconds: totalDistance > 0
      ? model.route.durationMinutes * 60 * remainingDistanceMeters / totalDistance
      : 0,
    instructionIndex: instruction.index,
    instruction: ambiguous ? null : instruction.instruction,
    thenInstruction: ambiguous ? null : instruction.then,
    distanceToInstructionMeters: instruction.distance,
    offRouteFixCount,
    offRouteSince,
    matchAmbiguous: ambiguous,
    routeBearingDegrees: match.segment.bearingDegrees
  }
}

export function coordinateAtRouteDistance(model: NavigationModel, distanceMeters: number): Coordinate {
  if (model.segments.length === 0) return model.route.geometry[0] ?? [0, 0]
  const clamped = Math.max(0, Math.min(model.totalDistanceMeters, distanceMeters))
  const segment = model.segments.find((candidate) =>
    candidate.startDistanceMeters + candidate.lengthMeters >= clamped
  ) ?? model.segments.at(-1)!
  const fraction = segment.lengthMeters === 0
    ? 0
    : Math.max(0, Math.min(1, (clamped - segment.startDistanceMeters) / segment.lengthMeters))
  return [
    segment.start[0] + (segment.finish[0] - segment.start[0]) * fraction,
    segment.start[1] + (segment.finish[1] - segment.start[1]) * fraction
  ]
}

function waypointRouteDistance(model: NavigationModel, waypoint: Waypoint): number {
  const fix: NavigationFix = {
    coordinate: [waypoint.lon, waypoint.lat],
    accuracyMeters: 1,
    headingDegrees: null,
    speedMetersPerSecond: null,
    timestamp: 0
  }
  return matchRoute(model, fix).match.routeDistanceMeters
}

export function buildRemainingRoutePoints(
  route: PlannedRoute,
  frame: NavigationFrame,
  currentLocation: Coordinate = frame.rawCoordinate,
  completedWaypointIndexes: readonly number[] = []
): Waypoint[] {
  const model = buildNavigationModel(route)
  const completed = new Set(completedWaypointIndexes)
  const remaining = route.waypoints.filter((waypoint, index) => {
    if (index === 0) return false
    if (completed.has(index)) return false
    return waypointRouteDistance(model, waypoint) > frame.matchedDistanceMeters + MANEUVER_PASS_METERS
  })
  const endpoint = route.geometry.at(-1)
  const destination = remaining.at(-1) ?? route.waypoints.at(-1) ?? (endpoint
    ? { lat: endpoint[1], lon: endpoint[0], label: "Destination" }
    : null)
  const points = remaining.length > 0
    ? remaining
    : destination ? [destination] : []
  return [
    { lat: currentLocation[1], lon: currentLocation[0], label: "Current location" },
    ...points
  ]
}

export function completedWaypointIndexes(
  route: PlannedRoute,
  frame: NavigationFrame
): number[] {
  const model = buildNavigationModel(route)
  return route.waypoints.flatMap((waypoint, index) => (
    index === 0 || waypointRouteDistance(model, waypoint) <= frame.matchedDistanceMeters + MANEUVER_PASS_METERS
      ? [index]
      : []
  ))
}
