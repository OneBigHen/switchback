import type { CurvatureBounds, CurvatureSegment } from "@/lib/curvature/repository"
import type { RoadSegmentFeature } from "@/lib/domain/contracts"
import { rankFreeRideCandidates, type FreeRideCandidate } from "@/lib/recommendation/free-ride"
import { array, enum_, number, object_, optional, safeParse, string, tuple, withDefault } from "@/lib/validate"

export interface FreeRideCurvatureReader {
  queryBounds(bounds: CurvatureBounds): CurvatureSegment[]
}

const coordinateSchema = tuple([
  number({ finite: true, min: -180, max: 180 }),
  number({ finite: true, min: -90, max: 90 })
])

const requestSchema = object_({
  position: coordinateSchema,
  headingDegrees: optional(number({ finite: true, min: 0, max: 360 })),
  gpsConfidence: withDefault(optional(number({ finite: true, min: 0, max: 1 })), 1),
  workload: withDefault(optional(enum_(["low", "normal", "high"] as const)), "low"),
  profile: withDefault(optional(enum_([
    "quick", "balanced", "twisty", "scenic", "adventure", "gravel", "avoid-highways", "neural"
  ] as const)), "neural"),
  rejectedCandidateIds: withDefault(optional(array(string({ trim: true, min: 1, max: 120 }), { max: 100 })), []),
  recentCandidateIds: withDefault(optional(array(string({ trim: true, min: 1, max: 120 }), { max: 100 })), [])
})

const METERS_PER_DEGREE = 111_320
const HORIZON_METERS = 16_000

function radians(value: number): number {
  return value * Math.PI / 180
}

function haversine(first: [number, number], second: [number, number]): number {
  const dLat = radians(second[1] - first[1])
  const dLon = radians(second[0] - first[0])
  const latA = radians(first[1])
  const latB = radians(second[1])
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function lineDistance(geometry: [number, number][]): number {
  let distance = 0
  for (let index = 1; index < geometry.length; index += 1) {
    distance += haversine(geometry[index - 1]!, geometry[index]!)
  }
  return distance
}

function normalized(value: number, divisor: number): number {
  return Math.max(0, Math.min(1, value / divisor))
}

function candidateFromSegment(
  segment: CurvatureSegment,
  position: [number, number]
): FreeRideCandidate | null {
  if (segment.geometry.length < 2) return null
  const destination = segment.geometry.at(-1)
  if (!destination) return null
  const distanceMeters = lineDistance(segment.geometry)
  const triggerDistanceMeters = haversine(position, segment.geometry[0]!)
  if (triggerDistanceMeters < 400 || triggerDistanceMeters > HORIZON_METERS) return null
  const curvature = normalized(segment.score, 1_500)
  const gravel = /gravel|dirt|unpaved|ground/i.test(segment.surface) ? 0.8 : 0
  const feature: RoadSegmentFeature = {
    segmentId: segment.id,
    geometry: segment.geometry,
    roadClass: "secondary",
    surface: segment.surface,
    curvature,
    curveDensity: curvature,
    curveSeverity: curvature,
    headingChangePerKilometer: curvature,
    elevationInterest: 0.35,
    scenicProxy: 0.5,
    trafficPenalty: 0.15,
    signalDensity: 0.05,
    stopDensity: 0.05,
    urbanDensityPenalty: 0.05,
    highwayPenalty: 0,
    incidentPenalty: 0,
    gravelSuitability: gravel,
    legalAccess: "permitted",
    seasonalAccess: "unknown",
    familiarity: 0,
    novelty: 0.75,
    dataConfidence: 0.75,
    safetyFlags: [],
    distanceMeters: Math.max(1, distanceMeters)
  }
  return {
    id: segment.id,
    kind: "fun-road",
    title: "Fun road ahead",
    actionLabel: "Follow this road",
    origin: position,
    destination,
    routeFragment: segment.geometry,
    triggerDistanceMeters,
    addedDurationSeconds: Math.max(60, Math.round(distanceMeters / 14)),
    route: {
      id: segment.id,
      geometry: segment.geometry,
      distanceMeters: Math.max(1, distanceMeters),
      durationSeconds: Math.max(60, Math.round(distanceMeters / 14)),
      confidence: 0.75,
      segments: [feature]
    }
  }
}

async function readBody(request: Request): Promise<unknown | null> {
  try {
    const text = await request.text()
    if (text.length > 8 * 1024) return null
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export async function handleFreeRideSuggestions(
  request: Request,
  reader: FreeRideCurvatureReader,
  now = new Date().toISOString()
): Promise<Response> {
  const body = await readBody(request)
  const parsed = safeParse(requestSchema, body)
  if (!parsed.success) {
    return Response.json({
      error: { code: "INVALID_FREE_RIDE_REQUEST", message: "Free Ride needs a valid GPS position and riding state." }
    }, { status: 400 })
  }

  const gpsConfidence = parsed.data.gpsConfidence ?? 1
  const workload = parsed.data.workload ?? "low"
  const profile = parsed.data.profile ?? "neural"
  const headingDegrees = parsed.data.headingDegrees ?? null
  const rejectedCandidateIds = new Set(parsed.data.rejectedCandidateIds ?? [])
  const recentCandidateIds = new Set(parsed.data.recentCandidateIds ?? [])

  if (gpsConfidence < 0.6 || workload === "high") {
    const ranked = rankFreeRideCandidates([], {
      now,
      profile,
      gpsConfidence,
      workload,
      currentCoordinate: parsed.data.position,
      currentHeadingDegrees: headingDegrees,
      rejectedCandidateIds,
      recentCandidateIds
    })
    return Response.json({ source: "curvature-database", ...ranked })
  }

  const [longitude, latitude] = parsed.data.position
  const latitudeSpan = HORIZON_METERS / METERS_PER_DEGREE
  const longitudeSpan = latitudeSpan / Math.max(0.2, Math.cos(radians(latitude)))
  const bounds: CurvatureBounds = {
    south: Math.max(-90, latitude - latitudeSpan),
    west: Math.max(-180, longitude - longitudeSpan),
    north: Math.min(90, latitude + latitudeSpan),
    east: Math.min(180, longitude + longitudeSpan),
    minScore: 650,
    limit: 100
  }

  let segments: CurvatureSegment[]
  try {
    segments = reader.queryBounds(bounds)
  } catch {
    return Response.json({
      error: {
        code: "FREE_RIDE_DATA_UNAVAILABLE",
        message: "Curvy-road data is unavailable here, so Switchback will not invent a Free Ride suggestion."
      }
    }, { status: 503 })
  }

  const candidates = segments.flatMap((segment) => {
    const candidate = candidateFromSegment(segment, parsed.data.position)
    return candidate ? [candidate] : []
  })
  const ranked = rankFreeRideCandidates(candidates, {
    now,
    profile,
    gpsConfidence,
    workload,
    currentCoordinate: parsed.data.position,
    currentHeadingDegrees: headingDegrees,
    rejectedCandidateIds,
    recentCandidateIds,
    horizonMeters: HORIZON_METERS
  })
  return Response.json({ source: "curvature-database", ...ranked })
}
