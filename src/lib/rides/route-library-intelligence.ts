import type { Coordinate, RouteInstruction } from "@/lib/routing/types"

export type PaRideRegion = "ne" | "nw" | "se" | "sw"
export type RideRegionFilter = "all" | PaRideRegion | "cross" | "outside"

export interface RideRegionSummary {
  primary: PaRideRegion | null
  regions: PaRideRegion[]
  shares: Partial<Record<PaRideRegion, number>>
  outsideShare: number
  crossRegion: boolean
  label: string
}

const PA_BOUNDS = {
  west: -80.52,
  east: -74.69,
  south: 39.72,
  north: 42.27
} as const

/**
 * Product regions, not legal or administrative boundaries. These stable axes
 * intentionally make the Rides library predictable while still deriving the
 * result from the whole route rather than its start point.
 */
const PA_REGION_SPLIT = {
  longitude: -77.5,
  latitude: 41
} as const

const MAX_SAMPLE_MILES = 5
const CROSS_REGION_MIN_SHARE = 0.2
const CROSS_REGION_MIN_MILES = 8
const DISPLAY_REGION_MIN_SHARE = 0.08

const REGION_LABEL: Record<PaRideRegion, string> = {
  ne: "NE",
  nw: "NW",
  se: "SE",
  sw: "SW"
}

function radians(value: number): number {
  return value * Math.PI / 180
}

function haversineMiles(left: Coordinate, right: Coordinate): number {
  const earthRadiusMiles = 3958.7613
  const dLat = radians(right[1] - left[1])
  const dLon = radians(right[0] - left[0])
  const lat1 = radians(left[1])
  const lat2 = radians(right[1])
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(a)))
}

function interpolate(left: Coordinate, right: Coordinate, ratio: number): Coordinate {
  return [
    left[0] + (right[0] - left[0]) * ratio,
    left[1] + (right[1] - left[1]) * ratio
  ]
}

function pointRegion([longitude, latitude]: Coordinate): PaRideRegion | null {
  if (
    longitude < PA_BOUNDS.west
    || longitude > PA_BOUNDS.east
    || latitude < PA_BOUNDS.south
    || latitude > PA_BOUNDS.north
  ) return null

  const north = latitude >= PA_REGION_SPLIT.latitude
  const east = longitude >= PA_REGION_SPLIT.longitude
  if (north && east) return "ne"
  if (north) return "nw"
  if (east) return "se"
  return "sw"
}

function emptySummary(label = "Region unknown"): RideRegionSummary {
  return {
    primary: null,
    regions: [],
    shares: {},
    outsideShare: label === "Outside PA" ? 1 : 0,
    crossRegion: false,
    label
  }
}

/**
 * Classify a route by distance traveled through each stable Pennsylvania
 * product region. Segment subdivision prevents provider/GPS point density from
 * biasing the result and catches long segments that cross a region axis.
 */
export function classifyPaRouteRegion(geometry: readonly Coordinate[] | undefined): RideRegionSummary {
  if (!geometry || geometry.length === 0) return emptySummary()
  if (geometry.length === 1) {
    const region = pointRegion(geometry[0]!)
    return region
      ? {
          primary: region,
          regions: [region],
          shares: { [region]: 1 },
          outsideShare: 0,
          crossRegion: false,
          label: `${REGION_LABEL[region]} PA`
        }
      : emptySummary("Outside PA")
  }

  const milesByRegion: Partial<Record<PaRideRegion, number>> = {}
  let outsideMiles = 0
  let totalMiles = 0

  for (let index = 1; index < geometry.length; index += 1) {
    const start = geometry[index - 1]!
    const finish = geometry[index]!
    const segmentMiles = haversineMiles(start, finish)
    if (!Number.isFinite(segmentMiles) || segmentMiles <= 0) continue

    const samples = Math.max(1, Math.ceil(segmentMiles / MAX_SAMPLE_MILES))
    const sampleMiles = segmentMiles / samples
    totalMiles += segmentMiles

    for (let sample = 0; sample < samples; sample += 1) {
      const midpoint = interpolate(start, finish, (sample + 0.5) / samples)
      const region = pointRegion(midpoint)
      if (region) milesByRegion[region] = (milesByRegion[region] ?? 0) + sampleMiles
      else outsideMiles += sampleMiles
    }
  }

  if (totalMiles <= 0) {
    const region = pointRegion(geometry[0]!)
    return region
      ? {
          primary: region,
          regions: [region],
          shares: { [region]: 1 },
          outsideShare: 0,
          crossRegion: false,
          label: `${REGION_LABEL[region]} PA`
        }
      : emptySummary("Outside PA")
  }

  const shares: Partial<Record<PaRideRegion, number>> = {}
  const ranked = (Object.entries(milesByRegion) as Array<[PaRideRegion, number]>)
    .map(([region, miles]) => {
      const share = miles / totalMiles
      shares[region] = share
      return { region, miles, share }
    })
    .sort((left, right) => right.miles - left.miles)

  const primary = ranked[0]?.region ?? null
  const outsideShare = outsideMiles / totalMiles
  if (!primary && outsideShare > 0) return emptySummary("Outside PA")
  if (!primary) return emptySummary()

  const secondary = ranked[1]
  const crossRegion = Boolean(
    secondary
    && secondary.share >= CROSS_REGION_MIN_SHARE
    && secondary.miles >= CROSS_REGION_MIN_MILES
  )
  const regions = ranked
    .filter(({ share }) => share >= DISPLAY_REGION_MIN_SHARE)
    .map(({ region }) => region)

  const label = crossRegion && secondary
    ? `Cross-region · ${REGION_LABEL[primary]} / ${REGION_LABEL[secondary.region]}`
    : `${REGION_LABEL[primary]} PA`

  return {
    primary,
    regions: regions.length > 0 ? regions : [primary],
    shares,
    outsideShare,
    crossRegion,
    label
  }
}

export function rideRegionMatches(summary: RideRegionSummary | undefined, filter: RideRegionFilter): boolean {
  if (filter === "all") return true
  if (!summary) return filter === "outside"
  if (filter === "cross") return summary.crossRegion
  if (filter === "outside") return summary.primary === null
  return summary.regions.includes(filter)
}

/** Real provider road names only; blank labels are discarded and duplicates preserve first-seen order. */
export function extractRouteRoadNames(instructions: readonly RouteInstruction[] | undefined, limit = 12): string[] {
  if (!instructions) return []
  const seen = new Set<string>()
  const roads: string[] = []

  for (const instruction of instructions) {
    const name = instruction.streetName?.trim()
    if (!name) continue
    const key = name.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    roads.push(name)
    if (roads.length >= limit) break
  }

  return roads
}
