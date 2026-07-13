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
  let matches = 0
  for (const coordinate of first) {
    if (second.some((candidate) => haversine(coordinate, candidate) <= 140)) {
      matches += 1
    }
  }
  return matches / first.length
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
