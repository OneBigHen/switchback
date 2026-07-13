import type { Coordinate, PlannedRoute, RouteInstruction } from "@/lib/routing/types"

const EARTH_RADIUS_METERS = 6_371_000
const CANDIDATE_DISTANCE_WINDOW_METERS = 60
const DISTINCT_ROUTE_DISTANCE_METERS = 75
const AMBIGUITY_SCORE_MARGIN = 20

function distanceMeters(first: Coordinate, second: Coordinate): number {
  const radians = (value: number) => value * Math.PI / 180
  const firstLat = radians(first[1])
  const secondLat = radians(second[1])
  const latitudeDelta = secondLat - firstLat
  const longitudeDelta = radians(second[0] - first[0])
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

function projectOntoSegment(
  location: Coordinate,
  start: Coordinate,
  finish: Coordinate
): { distance: number; fraction: number } {
  const radians = (value: number) => value * Math.PI / 180
  const latitudeScale = EARTH_RADIUS_METERS * Math.PI / 180
  const longitudeScale = latitudeScale * Math.cos(radians(location[1]))
  const startX = (start[0] - location[0]) * longitudeScale
  const startY = (start[1] - location[1]) * latitudeScale
  const finishX = (finish[0] - location[0]) * longitudeScale
  const finishY = (finish[1] - location[1]) * latitudeScale
  const segmentX = finishX - startX
  const segmentY = finishY - startY
  const lengthSquared = segmentX ** 2 + segmentY ** 2
  const fraction = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, -(startX * segmentX + startY * segmentY) / lengthSquared))
  const projectedX = startX + segmentX * fraction
  const projectedY = startY + segmentY * fraction
  return { distance: Math.hypot(projectedX, projectedY), fraction }
}

function bearingDegrees(start: Coordinate, finish: Coordinate): number {
  const radians = (value: number) => value * Math.PI / 180
  const degrees = (value: number) => value * 180 / Math.PI
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

export interface RideMatchOptions {
  headingDegrees?: number | null
  previousProgress?: RideProgress | null
}

export interface RideProgress {
  percent: number
  remainingMiles: number
  nearestGeometryIndex: number
  matchedDistanceMeters: number
  distanceToInstructionMiles: number
  offRoute: boolean
  matchAmbiguous: boolean
  instruction: RouteInstruction | null
}

interface SegmentCandidate {
  index: number
  distance: number
  fraction: number
  matchedDistanceMeters: number
  score: number
}

export function locateRideProgress(
  route: PlannedRoute,
  location: Coordinate,
  options: RideMatchOptions = {}
): RideProgress {
  const segmentDistances = route.geometry.slice(0, -1).map((coordinate, index) =>
    distanceMeters(coordinate, route.geometry[index + 1])
  )
  const cumulativeDistances = [0]
  for (const segmentDistance of segmentDistances) {
    cumulativeDistances.push(cumulativeDistances.at(-1)! + segmentDistance)
  }
  const heading = typeof options.headingDegrees === "number" && Number.isFinite(options.headingDegrees)
    ? (options.headingDegrees % 360 + 360) % 360
    : null
  const previousDistance = options.previousProgress && !options.previousProgress.matchAmbiguous
    ? options.previousProgress.matchedDistanceMeters
    : null
  const projectedSegments = route.geometry.slice(0, -1).map<SegmentCandidate>((coordinate, index) => {
    const projection = projectOntoSegment(location, coordinate, route.geometry[index + 1])
    const matchedDistanceMeters = cumulativeDistances[index] + segmentDistances[index] * projection.fraction
    const headingPenalty = heading == null
      ? 0
      : headingDifference(heading, bearingDegrees(coordinate, route.geometry[index + 1])) * 0.75
    const continuityDelta = previousDistance == null
      ? 0
      : Math.abs(matchedDistanceMeters - previousDistance)
    const continuityPenalty = previousDistance == null
      ? 0
      : Math.min(continuityDelta * 0.025, heading == null ? 250 : 45)
    return {
      index,
      ...projection,
      matchedDistanceMeters,
      score: projection.distance + headingPenalty + continuityPenalty
    }
  })
  const minimumDistance = Math.min(...projectedSegments.map((candidate) => candidate.distance))
  const candidates = projectedSegments
    .filter((candidate) => candidate.distance <= minimumDistance + CANDIDATE_DISTANCE_WINDOW_METERS)
    .sort((first, second) => first.score - second.score)
  const nearestSegment = candidates[0] ?? {
    index: 0,
    distance: route.geometry[0] ? distanceMeters(location, route.geometry[0]) : Number.POSITIVE_INFINITY,
    fraction: 0,
    matchedDistanceMeters: 0,
    score: Number.POSITIVE_INFINITY
  }
  const alternative = candidates.find((candidate) =>
    candidate !== nearestSegment &&
    Math.abs(candidate.matchedDistanceMeters - nearestSegment.matchedDistanceMeters) > DISTINCT_ROUTE_DISTANCE_METERS
  )
  const matchAmbiguous = nearestSegment.distance <= 150 &&
    alternative != null &&
    alternative.score - nearestSegment.score < AMBIGUITY_SCORE_MARGIN
  const nearestGeometryIndex = nearestSegment.fraction >= 0.5
    ? Math.min(nearestSegment.index + 1, route.geometry.length - 1)
    : nearestSegment.index
  const totalDistance = segmentDistances.reduce((sum, distance) => sum + distance, 0)
  const traveledDistance = nearestSegment.matchedDistanceMeters
  const percent = totalDistance > 0
    ? Math.max(0, Math.min(100, (traveledDistance / totalDistance) * 100))
    : 0
  const instruction = route.instructions.find((item) => item.interval[0] >= nearestGeometryIndex) ??
    route.instructions.at(-1) ?? null
  const instructionIndex = Math.max(
    nearestGeometryIndex,
    Math.min(instruction?.interval[0] ?? nearestGeometryIndex, route.geometry.length - 1)
  )
  const instructionDistanceFromStart = segmentDistances
    .slice(0, instructionIndex)
    .reduce((sum, distance) => sum + distance, 0)
  const distanceToInstruction = Math.max(0, instructionDistanceFromStart - traveledDistance)

  return {
    percent,
    remainingMiles: route.distanceMiles * (1 - percent / 100),
    nearestGeometryIndex,
    matchedDistanceMeters: traveledDistance,
    distanceToInstructionMiles: distanceToInstruction / 1609.344,
    offRoute: nearestSegment.distance > 150,
    matchAmbiguous,
    instruction: matchAmbiguous ? null : instruction
  }
}
