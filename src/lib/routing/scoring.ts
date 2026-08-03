import type { Coordinate } from "./types"

export interface GeometryAnalysis {
  twistiness: number
  turnCount: number
  turnDensity: number
  straightRatio: number
}

export type DetailInterval = [from: number, to: number, value: string]

const EARTH_RADIUS_METERS = 6_371_000

function toRadians(value: number): number {
  return (value * Math.PI) / 180
}

function haversine(first: Coordinate, second: Coordinate): number {
  const firstLat = toRadians(first[1])
  const secondLat = toRadians(second[1])
  const latitudeDelta = secondLat - firstLat
  const longitudeDelta = toRadians(second[0] - first[0])
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

export { haversine }

function bearing(first: Coordinate, second: Coordinate): number {
  const firstLat = toRadians(first[1])
  const secondLat = toRadians(second[1])
  const longitudeDelta = toRadians(second[0] - first[0])
  const y = Math.sin(longitudeDelta) * Math.cos(secondLat)
  const x =
    Math.cos(firstLat) * Math.sin(secondLat) -
    Math.sin(firstLat) * Math.cos(secondLat) * Math.cos(longitudeDelta)
  return (Math.atan2(y, x) * 180) / Math.PI
}

function turnAngle(firstBearing: number, secondBearing: number): number {
  let angle = secondBearing - firstBearing
  while (angle > 180) angle -= 360
  while (angle < -180) angle += 360
  return angle
}

export function analyzeGeometry(coordinates: Coordinate[]): GeometryAnalysis {
  if (coordinates.length < 3) {
    return { twistiness: 0, turnCount: 0, turnDensity: 0, straightRatio: 1 }
  }

  const segments = coordinates.slice(0, -1)
    .map((coordinate, index) => ({
      distance: haversine(coordinate, coordinates[index + 1]),
      bearing: bearing(coordinate, coordinates[index + 1])
    }))
    .filter((segment) => segment.distance >= 2)

  const distanceKilometers =
    segments.reduce((total, segment) => total + segment.distance, 0) / 1000
  if (segments.length < 2 || distanceKilometers === 0) {
    return { twistiness: 0, turnCount: 0, turnDensity: 0, straightRatio: 1 }
  }

  const meaningfulTurns = segments.slice(0, -1)
    .map((segment, index) => Math.abs(turnAngle(segment.bearing, segments[index + 1].bearing)))
    .filter((angle) => angle >= 12)
  const totalTurnDegrees = meaningfulTurns.reduce((total, angle) => total + angle, 0)
  const turnDensity = meaningfulTurns.length / distanceKilometers
  const directionalChangePerKilometer = totalTurnDegrees / distanceKilometers
  const twistiness = Math.round(
    Math.min(100, directionalChangePerKilometer * 1.9 + turnDensity * 9)
  )
  const straightRatio = Math.max(
    0,
    Math.min(1, 1 - totalTurnDegrees / Math.max(180, distanceKilometers * 50))
  )

  return {
    twistiness,
    turnCount: meaningfulTurns.length,
    turnDensity: Number(turnDensity.toFixed(2)),
    straightRatio: Number(straightRatio.toFixed(3))
  }
}

export function calculateDetailDistribution(
  coordinates: Coordinate[],
  details: DetailInterval[]
): Record<string, number> {
  const distances = new Map<string, number>()
  for (const [from, to, value] of details) {
    let distance = 0
    for (let index = Math.max(0, from); index < Math.min(to, coordinates.length - 1); index += 1) {
      distance += haversine(coordinates[index], coordinates[index + 1])
    }
    distances.set(value, (distances.get(value) ?? 0) + distance)
  }

  const total = [...distances.values()].reduce((sum, distance) => sum + distance, 0)
  if (total === 0) return {}

  return Object.fromEntries(
    [...distances.entries()].map(([value, distance]) => [
      value,
      Number(((distance / total) * 100).toFixed(1))
    ])
  )
}

function sampleLine(coordinates: Coordinate[], spacingMeters = 120): Coordinate[] {
  if (coordinates.length < 2) return [...coordinates]
  const samples: Coordinate[] = [coordinates[0]]
  let carry = 0

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index]
    const end = coordinates[index + 1]
    const segmentDistance = haversine(start, end)
    if (segmentDistance === 0) continue

    let position = spacingMeters - carry
    while (position < segmentDistance) {
      const ratio = position / segmentDistance
      samples.push([
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio
      ])
      position += spacingMeters
    }
    carry = Math.max(0, segmentDistance - (position - spacingMeters))
  }

  samples.push(coordinates[coordinates.length - 1])
  return samples
}

function directionalOverlap(first: Coordinate[], second: Coordinate[]): number {
  if (first.length === 0 || second.length === 0) return 0

  const GRID_METERS = 140
  const DEG_PER_M = 1 / 111_000
  const cellDeg = GRID_METERS * DEG_PER_M

  const hash = new Map<string, Coordinate[]>()
  for (const coord of second) {
    const key = `${Math.round(coord[1] / cellDeg)},${Math.round(coord[0] / cellDeg)}`
    const bucket = hash.get(key)
    if (bucket) bucket.push(coord)
    else hash.set(key, [coord])
  }

  let matches = 0
  const thresholdSq = (GRID_METERS * 1.05) ** 2
  for (const coordinate of first) {
    const cx = Math.round(coordinate[1] / cellDeg)
    const cy = Math.round(coordinate[0] / cellDeg)
    let found = false
    outer: for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = hash.get(`${cx + dx},${cy + dy}`)
        if (!bucket) continue
        for (const candidate of bucket) {
          if (haversineSq(coordinate, candidate) <= thresholdSq) {
            found = true
            break outer
          }
        }
      }
    }
    if (found) matches += 1
  }
  return matches / first.length
}

function haversineSq(first: Coordinate, second: Coordinate): number {
  const firstLat = toRadians(first[1])
  const secondLat = toRadians(second[1])
  const latitudeDelta = secondLat - firstLat
  const longitudeDelta = toRadians(second[0] - first[0])
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(longitudeDelta / 2) ** 2
  return (2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))) ** 2
}

export function calculateGeometryOverlap(
  first: Coordinate[],
  second: Coordinate[]
): number {
  const firstSamples = sampleLine(first)
  const secondSamples = sampleLine(second)
  const overlap =
    (directionalOverlap(firstSamples, secondSamples) +
      directionalOverlap(secondSamples, firstSamples)) /
    2
  return Math.round(overlap * 100)
}

/**
 * Phase 4 geometry metrics. The locked spec: simplify geometry at a 25-meter
 * tolerance, then count meaningful turns on simplified segments of at least
 * 40 meters with bearing changes from 15° through 120°, so point noise and
 * U-turns cannot inflate a "fun" score.
 */

export interface SmoothedRouteMetrics {
  /** 0-100 normalized from smoothed turns and curved distance share. */
  twistiness: number
  /** Meaningful turns on simplified >=40 m segments, 15°–120° bearing change. */
  turnCount: number
  /** Meaningful turns per mile. */
  turnsPerMile: number
  /** Share (0..1) of route distance on curved road (curvature < 0.98). */
  curvedDistanceShare: number
}

const SIMPLIFY_TOLERANCE_METERS = 25
const MIN_TURN_SEGMENT_METERS = 40
const MIN_TURN_BEARING_DEGREES = 15
const MAX_TURN_BEARING_DEGREES = 120
const CURVED_CURVATURE_THRESHOLD = 0.98

/** Distance from a point to a great-circle line segment, in meters. */
export function pointToSegmentDistanceMeters(
  point: Coordinate,
  start: Coordinate,
  end: Coordinate
): number {
  const segmentMeters = haversine(start, end)
  if (segmentMeters < 1) return haversine(point, start)
  // Project onto the segment using a local equirectangular plane.
  const toRad = Math.PI / 180
  const cosLat = Math.cos((start[1] + end[1]) / 2 * toRad)
  const [ax, ay] = [start[0] * cosLat, start[1]]
  const [bx, by] = [end[0] * cosLat, end[1]]
  const [px, py] = [point[0] * cosLat, point[1]]
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return haversine([cx / cosLat, cy], point)
}

/**
 * Douglas-Peucker simplification with a tolerance in meters. Keeps the
 * first and last coordinates; internal points are dropped when they lie
 * within the tolerance of the chord.
 */
export function simplifyGeometry(
  coordinates: Coordinate[],
  toleranceMeters = SIMPLIFY_TOLERANCE_METERS
): Coordinate[] {
  if (coordinates.length <= 2) return [...coordinates]

  let maxDistance = 0
  let maxIndex = 0
  for (let index = 1; index < coordinates.length - 1; index += 1) {
    const distance = pointToSegmentDistanceMeters(
      coordinates[index]!,
      coordinates[0]!,
      coordinates[coordinates.length - 1]!
    )
    if (distance > maxDistance) {
      maxDistance = distance
      maxIndex = index
    }
  }

  if (maxDistance > toleranceMeters) {
    const left = simplifyGeometry(coordinates.slice(0, maxIndex + 1), toleranceMeters)
    const right = simplifyGeometry(coordinates.slice(maxIndex), toleranceMeters)
    return [...left.slice(0, -1), ...right]
  }
  return [coordinates[0]!, coordinates[coordinates.length - 1]!]
}

function bearingDegrees(first: Coordinate, second: Coordinate): number {
  const firstLat = toRadians(first[1])
  const secondLat = toRadians(second[1])
  const longitudeDelta = toRadians(second[0] - first[0])
  const y = Math.sin(longitudeDelta) * Math.cos(secondLat)
  const x =
    Math.cos(firstLat) * Math.sin(secondLat) -
    Math.sin(firstLat) * Math.cos(secondLat) * Math.cos(longitudeDelta)
  return (Math.atan2(y, x) * 180) / Math.PI
}

function turnAngleDegrees(firstBearing: number, secondBearing: number): number {
  let angle = secondBearing - firstBearing
  while (angle > 180) angle -= 360
  while (angle < -180) angle += 360
  return Math.abs(angle)
}

/**
 * Distance-weighted share of a route whose GraphHopper `curvature` detail
 * is below the curved threshold. Falls back to a bearing-based estimate when
 * the provider omitted the detail, so missing data degrades but never
 * fabricates curvature.
 */
export function curvedDistanceShare(
  coordinates: Coordinate[],
  curvatureDetails?: DetailInterval[]
): number {
  if (curvatureDetails && curvatureDetails.length > 0) {
    let curved = 0
    let total = 0
    for (const [from, to, value] of curvatureDetails) {
      let distance = 0
      for (let index = Math.max(0, from); index < Math.min(to, coordinates.length - 1); index += 1) {
        distance += haversine(coordinates[index]!, coordinates[index + 1]!)
      }
      total += distance
      const numeric = Number(value)
      if (Number.isFinite(numeric) && numeric < CURVED_CURVATURE_THRESHOLD) curved += distance
    }
    return total > 0 ? curved / total : 0
  }
  return smoothedRouteMetrics(coordinates).curvedDistanceShare
}

/**
 * Phase 4 smoothed metrics: simplified geometry at 25 m, meaningful turns on
 * simplified segments >=40 m with 15°–120° bearing changes. Straight and
 * point-noisy geometry cannot saturate the score.
 */
export function smoothedRouteMetrics(coordinates: Coordinate[]): SmoothedRouteMetrics {
  const simplified = simplifyGeometry(coordinates)
  if (simplified.length < 3) {
    return { twistiness: 0, turnCount: 0, turnsPerMile: 0, curvedDistanceShare: 0 }
  }

  const segments = simplified.slice(0, -1).map((coordinate, index) => ({
    start: coordinate,
    end: simplified[index + 1]!,
    distance: haversine(coordinate, simplified[index + 1]!),
    bearing: bearingDegrees(coordinate, simplified[index + 1]!)
  }))

  let meaningfulTurns = 0
  let totalDistance = 0
  for (const segment of segments) totalDistance += segment.distance

  let curvedDistance = 0
  for (let index = 0; index < segments.length - 1; index += 1) {
    const first = segments[index]!
    const second = segments[index + 1]!
    if (first.distance < MIN_TURN_SEGMENT_METERS || second.distance < MIN_TURN_SEGMENT_METERS) continue
    const angle = turnAngleDegrees(first.bearing, second.bearing)
    if (angle >= MIN_TURN_BEARING_DEGREES && angle <= MAX_TURN_BEARING_DEGREES) {
      meaningfulTurns += 1
      // Curved distance: the shared vertex's adjacent segments count as curved
      // when the turn is meaningful.
      curvedDistance += first.distance + second.distance
    }
  }
  curvedDistance = Math.min(curvedDistance, totalDistance)

  const miles = totalDistance / 1609.344
  const turnsPerMile = miles > 0 ? meaningfulTurns / miles : 0
  const curvedShare = totalDistance > 0 ? curvedDistance / totalDistance : 0
  // Mirrors the locked maximum-twisties curvature component shape: curved
  // share dominates, turn density saturates near four meaningful turns/mile.
  const twistiness = Math.round(
    Math.min(100, curvedShare * 60 + Math.min(1, turnsPerMile / 4) * 40)
  )
  return {
    twistiness,
    turnCount: meaningfulTurns,
    turnsPerMile: Number(turnsPerMile.toFixed(2)),
    curvedDistanceShare: Number(curvedShare.toFixed(3))
  }
}
