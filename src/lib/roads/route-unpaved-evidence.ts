import type {
  GeoJsonPosition,
  PaUnpavedRoadEvidence,
  PaUnpavedRoadFeatureCollection
} from "./types"

const EARTH_RADIUS_METERS = 6_371_000
const MATCH_RADIUS_METERS = 40
const MINIMUM_CONTIGUOUS_METERS = 80
const SAMPLE_SPACING_METERS = 40
const MAX_DIRECTION_DIFFERENCE_DEGREES = 35
const INDEX_CELL_METERS = 160
const MAX_INDEX_CELLS_PER_SEGMENT = 256
const SOURCE = "Pennsylvania Department of Environmental Protection" as const
const DATASET = "Unpaved Roads 2009_07" as const

interface OfficialSegment {
  start: GeoJsonPosition
  end: GeoJsonPosition
  featureId: string
}

interface OfficialSegmentIndex {
  cells: Map<string, OfficialSegment[]>
  longSegments: OfficialSegment[]
}

export function calculatePaUnpavedRoadEvidence(
  route: GeoJsonPosition[],
  roads: PaUnpavedRoadFeatureCollection
): PaUnpavedRoadEvidence {
  const referenceLatitude = route.reduce((sum, coordinate) => sum + coordinate[1], 0) /
    Math.max(1, route.length)
  const routePoints = route.map((coordinate) => project(coordinate, referenceLatitude))
  const officialSegments: OfficialSegment[] = roads.features.flatMap((feature) => {
    const lines = feature.geometry.type === "LineString"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates
    return lines.flatMap((line) => line.slice(0, -1).map((coordinate, index) => ({
      start: project(coordinate, referenceLatitude),
      end: project(line[index + 1], referenceLatitude),
      featureId: feature.id
    })))
  })
  const officialIndex = createOfficialSegmentIndex(officialSegments)
  let totalMeters = 0
  let matchedMeters = 0
  const matchedFeatures = new Set<string>()
  let contiguousMeters = 0
  let contiguousFeatures = new Set<string>()

  function finishContiguousRun(): void {
    if (contiguousMeters >= MINIMUM_CONTIGUOUS_METERS) {
      matchedMeters += contiguousMeters
      contiguousFeatures.forEach((featureId) => matchedFeatures.add(featureId))
    }
    contiguousMeters = 0
    contiguousFeatures = new Set<string>()
  }

  routePoints.slice(0, -1).forEach((start, index) => {
    const end = routePoints[index + 1]
    const length = Math.hypot(end[0] - start[0], end[1] - start[1])
    totalMeters += length
    const sampleCount = Math.max(1, Math.ceil(length / SAMPLE_SPACING_METERS))
    const sampleLength = length / sampleCount
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const ratio = (sampleIndex + 0.5) / sampleCount
      const midpoint: GeoJsonPosition = [
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio
      ]
      const match = findOfficialMatch(midpoint, start, end, officialIndex)
      if (match) {
        contiguousMeters += sampleLength
        contiguousFeatures.add(match.featureId)
      } else {
        finishContiguousRun()
      }
    }
  })
  finishContiguousRun()

  return {
    source: SOURCE,
    dataset: DATASET,
    matchedMeters: Number(matchedMeters.toFixed(1)),
    sharePercent: totalMeters === 0
      ? 0
      : Number(((matchedMeters / totalMeters) * 100).toFixed(2)),
    matchedFeatureCount: matchedFeatures.size,
    matchRadiusMeters: MATCH_RADIUS_METERS,
    minimumContiguousMeters: MINIMUM_CONTIGUOUS_METERS
  }
}

function createOfficialSegmentIndex(segments: OfficialSegment[]): OfficialSegmentIndex {
  const cells = new Map<string, OfficialSegment[]>()
  const longSegments: OfficialSegment[] = []

  for (const segment of segments) {
    const minimumCellX = Math.floor(
      (Math.min(segment.start[0], segment.end[0]) - MATCH_RADIUS_METERS) /
        INDEX_CELL_METERS
    )
    const maximumCellX = Math.floor(
      (Math.max(segment.start[0], segment.end[0]) + MATCH_RADIUS_METERS) /
        INDEX_CELL_METERS
    )
    const minimumCellY = Math.floor(
      (Math.min(segment.start[1], segment.end[1]) - MATCH_RADIUS_METERS) /
        INDEX_CELL_METERS
    )
    const maximumCellY = Math.floor(
      (Math.max(segment.start[1], segment.end[1]) + MATCH_RADIUS_METERS) /
        INDEX_CELL_METERS
    )
    const cellCount = (maximumCellX - minimumCellX + 1) *
      (maximumCellY - minimumCellY + 1)
    if (cellCount > MAX_INDEX_CELLS_PER_SEGMENT) {
      longSegments.push(segment)
      continue
    }
    for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
      for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
        const key = `${cellX}:${cellY}`
        const bucket = cells.get(key)
        if (bucket) bucket.push(segment)
        else cells.set(key, [segment])
      }
    }
  }

  return { cells, longSegments }
}

function findOfficialMatch(
  point: GeoJsonPosition,
  routeStart: GeoJsonPosition,
  routeEnd: GeoJsonPosition,
  index: OfficialSegmentIndex
): OfficialSegment | undefined {
  const key = `${Math.floor(point[0] / INDEX_CELL_METERS)}:${Math.floor(point[1] / INDEX_CELL_METERS)}`
  const candidates = [...(index.cells.get(key) ?? []), ...index.longSegments]
  let closest: OfficialSegment | undefined
  let closestDistance = MATCH_RADIUS_METERS
  for (const candidate of candidates) {
    if (!directionsAlign(routeStart, routeEnd, candidate.start, candidate.end)) continue
    const distance = pointToSegmentDistance(point, candidate.start, candidate.end)
    if (distance <= closestDistance) {
      closest = candidate
      closestDistance = distance
    }
  }
  return closest
}

function directionsAlign(
  routeStart: GeoJsonPosition,
  routeEnd: GeoJsonPosition,
  officialStart: GeoJsonPosition,
  officialEnd: GeoJsonPosition
): boolean {
  const routeX = routeEnd[0] - routeStart[0]
  const routeY = routeEnd[1] - routeStart[1]
  const officialX = officialEnd[0] - officialStart[0]
  const officialY = officialEnd[1] - officialStart[1]
  const denominator = Math.hypot(routeX, routeY) * Math.hypot(officialX, officialY)
  if (denominator === 0) return false
  const cosine = Math.min(1, Math.abs(
    (routeX * officialX + routeY * officialY) / denominator
  ))
  const differenceDegrees = Math.acos(cosine) * 180 / Math.PI
  return differenceDegrees <= MAX_DIRECTION_DIFFERENCE_DEGREES
}

function project(
  [longitude, latitude]: GeoJsonPosition,
  referenceLatitude: number
): GeoJsonPosition {
  const radians = Math.PI / 180
  return [
    EARTH_RADIUS_METERS * longitude * radians * Math.cos(referenceLatitude * radians),
    EARTH_RADIUS_METERS * latitude * radians
  ]
}

function pointToSegmentDistance(
  point: GeoJsonPosition,
  start: GeoJsonPosition,
  end: GeoJsonPosition
): number {
  const deltaX = end[0] - start[0]
  const deltaY = end[1] - start[1]
  const squaredLength = deltaX * deltaX + deltaY * deltaY
  const ratio = squaredLength === 0
    ? 0
    : Math.max(0, Math.min(
        1,
        ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaY) /
          squaredLength
      ))
  return Math.hypot(
    point[0] - (start[0] + ratio * deltaX),
    point[1] - (start[1] + ratio * deltaY)
  )
}
