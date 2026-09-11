import type { GravelAtlasCorridor } from "@/lib/routing/gravel-atlas"
import type { Coordinate } from "@/lib/routing/types"

const EARTH_RADIUS_METERS = 6_371_000
const MATCH_RADIUS_METERS = 40
const MINIMUM_CONTIGUOUS_METERS = 80
const SAMPLE_SPACING_METERS = 40
const MAX_DIRECTION_DIFFERENCE_DEGREES = 35
const INDEX_CELL_METERS = 160
const MAX_INDEX_CELLS_PER_SEGMENT = 256

export interface GravelAtlasRouteEvidence {
  source: "Switchback Gravel Atlas"
  matchedMeters: number
  sharePercent: number
  longestContinuousMeters: number
  matchedCorridorCount: number
  matchRadiusMeters: number
  minimumContiguousMeters: number
}

interface ProjectedSegment {
  start: Coordinate
  end: Coordinate
  corridorId: string
}

interface SegmentIndex {
  cells: Map<string, ProjectedSegment[]>
  longSegments: ProjectedSegment[]
}

/**
 * Measure what the returned route actually follows. Candidate provenance alone
 * is insufficient because a router may accept a shaping point and immediately
 * leave the gravel corridor. The same conservative geometry model used by the
 * historic PA unpaved evidence is applied here: 40 m samples, direction
 * agreement, and a minimum contiguous run before distance is credited.
 */
export function calculateGravelAtlasRouteEvidence(
  route: readonly Coordinate[],
  corridors: readonly GravelAtlasCorridor[]
): GravelAtlasRouteEvidence {
  const empty: GravelAtlasRouteEvidence = {
    source: "Switchback Gravel Atlas",
    matchedMeters: 0,
    sharePercent: 0,
    longestContinuousMeters: 0,
    matchedCorridorCount: 0,
    matchRadiusMeters: MATCH_RADIUS_METERS,
    minimumContiguousMeters: MINIMUM_CONTIGUOUS_METERS
  }
  if (route.length < 2 || corridors.length === 0) return empty

  const referenceLatitude = route.reduce((sum, coordinate) => sum + coordinate[1], 0) /
    Math.max(1, route.length)
  const routePoints = route.map((coordinate) => project(coordinate, referenceLatitude))
  const segments: ProjectedSegment[] = corridors
    .filter((corridor) => corridor.verification === "routable")
    .flatMap((corridor) => corridor.geometry.slice(0, -1).flatMap((coordinate, index) => {
      const next = corridor.geometry[index + 1]
      if (!next) return []
      return [{
        start: project(coordinate, referenceLatitude),
        end: project(next, referenceLatitude),
        corridorId: corridor.id
      }]
    }))
  if (segments.length === 0) return empty

  const index = createSegmentIndex(segments)
  let totalMeters = 0
  let matchedMeters = 0
  let contiguousMeters = 0
  let longestContinuousMeters = 0
  let contiguousCorridors = new Set<string>()
  const matchedCorridors = new Set<string>()

  const finishRun = () => {
    if (contiguousMeters >= MINIMUM_CONTIGUOUS_METERS) {
      matchedMeters += contiguousMeters
      longestContinuousMeters = Math.max(longestContinuousMeters, contiguousMeters)
      contiguousCorridors.forEach((id) => matchedCorridors.add(id))
    }
    contiguousMeters = 0
    contiguousCorridors = new Set<string>()
  }

  routePoints.slice(0, -1).forEach((start, indexNumber) => {
    const end = routePoints[indexNumber + 1]
    if (!end) return
    const length = Math.hypot(end[0] - start[0], end[1] - start[1])
    totalMeters += length
    const sampleCount = Math.max(1, Math.ceil(length / SAMPLE_SPACING_METERS))
    const sampleLength = length / sampleCount
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const ratio = (sampleIndex + 0.5) / sampleCount
      const point: Coordinate = [
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio
      ]
      const matches = findMatches(point, start, end, index)
      if (matches.length > 0) {
        contiguousMeters += sampleLength
        matches.forEach((match) => contiguousCorridors.add(match.corridorId))
      } else {
        finishRun()
      }
    }
  })
  finishRun()

  return {
    ...empty,
    matchedMeters: Number(matchedMeters.toFixed(1)),
    sharePercent: totalMeters === 0
      ? 0
      : Number(Math.min(100, (matchedMeters / totalMeters) * 100).toFixed(2)),
    longestContinuousMeters: Number(longestContinuousMeters.toFixed(1)),
    matchedCorridorCount: matchedCorridors.size
  }
}

function createSegmentIndex(segments: readonly ProjectedSegment[]): SegmentIndex {
  const cells = new Map<string, ProjectedSegment[]>()
  const longSegments: ProjectedSegment[] = []
  for (const segment of segments) {
    const minX = Math.floor((Math.min(segment.start[0], segment.end[0]) - MATCH_RADIUS_METERS) / INDEX_CELL_METERS)
    const maxX = Math.floor((Math.max(segment.start[0], segment.end[0]) + MATCH_RADIUS_METERS) / INDEX_CELL_METERS)
    const minY = Math.floor((Math.min(segment.start[1], segment.end[1]) - MATCH_RADIUS_METERS) / INDEX_CELL_METERS)
    const maxY = Math.floor((Math.max(segment.start[1], segment.end[1]) + MATCH_RADIUS_METERS) / INDEX_CELL_METERS)
    const cellCount = (maxX - minX + 1) * (maxY - minY + 1)
    if (cellCount > MAX_INDEX_CELLS_PER_SEGMENT) {
      longSegments.push(segment)
      continue
    }
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = `${x}:${y}`
        const bucket = cells.get(key)
        if (bucket) bucket.push(segment)
        else cells.set(key, [segment])
      }
    }
  }
  return { cells, longSegments }
}

function findMatches(
  point: Coordinate,
  routeStart: Coordinate,
  routeEnd: Coordinate,
  index: SegmentIndex
): ProjectedSegment[] {
  const key = `${Math.floor(point[0] / INDEX_CELL_METERS)}:${Math.floor(point[1] / INDEX_CELL_METERS)}`
  const candidates = [...(index.cells.get(key) ?? []), ...index.longSegments]
  return candidates.filter((candidate) =>
    directionsAlign(routeStart, routeEnd, candidate.start, candidate.end) &&
    pointToSegmentDistance(point, candidate.start, candidate.end) <= MATCH_RADIUS_METERS
  )
}

function directionsAlign(
  routeStart: Coordinate,
  routeEnd: Coordinate,
  sourceStart: Coordinate,
  sourceEnd: Coordinate
): boolean {
  const routeX = routeEnd[0] - routeStart[0]
  const routeY = routeEnd[1] - routeStart[1]
  const sourceX = sourceEnd[0] - sourceStart[0]
  const sourceY = sourceEnd[1] - sourceStart[1]
  const denominator = Math.hypot(routeX, routeY) * Math.hypot(sourceX, sourceY)
  if (denominator === 0) return false
  const cosine = Math.min(1, Math.abs((routeX * sourceX + routeY * sourceY) / denominator))
  return Math.acos(cosine) * 180 / Math.PI <= MAX_DIRECTION_DIFFERENCE_DEGREES
}

function project([longitude, latitude]: Coordinate, referenceLatitude: number): Coordinate {
  const radians = Math.PI / 180
  return [
    EARTH_RADIUS_METERS * longitude * radians * Math.cos(referenceLatitude * radians),
    EARTH_RADIUS_METERS * latitude * radians
  ]
}

function pointToSegmentDistance(point: Coordinate, start: Coordinate, end: Coordinate): number {
  const deltaX = end[0] - start[0]
  const deltaY = end[1] - start[1]
  const squaredLength = deltaX * deltaX + deltaY * deltaY
  const ratio = squaredLength === 0
    ? 0
    : Math.max(0, Math.min(1,
        ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaY) / squaredLength
      ))
  return Math.hypot(
    point[0] - (start[0] + ratio * deltaX),
    point[1] - (start[1] + ratio * deltaY)
  )
}
