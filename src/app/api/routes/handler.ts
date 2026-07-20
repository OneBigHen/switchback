import type { RouteCandidateEnricher, RouteProvider, TripPlanRequest } from "@/lib/routing/planner"
import { planMotorcycleTrip } from "@/lib/routing/planner"
import { GraphHopperProviderError } from "@/lib/routing/graphhopper"
import { ValhallaProviderError } from "@/lib/routing/valhalla"
import {
  number, string, boolean, enum_, literal, object_, tuple, array,
  optional, withDefault, safeParse, ValidationError
} from "@/lib/validate"

const waypointSchema = object_({
  lat: number({ finite: true, min: -90, max: 90 }),
  lon: number({ finite: true, min: -180, max: 180 }),
  label: optional(string({ trim: true, max: 160 })),
  locked: optional(boolean())
})

const coordinateSchema = tuple([
  number({ finite: true, min: -180, max: 180 }),
  number({ finite: true, min: -90, max: 90 })
])

const avoidAreaSchema = object_({
  id: string({ trim: true, min: 1, max: 80 }),
  name: optional(string({ trim: true, min: 1, max: 120 })),
  polygon: array(coordinateSchema, { min: 3, max: 12 })
})

const ROAD_LOCK_MODES = ["must", "prefer"] as const
const ROAD_LOCK_PROVENANCES = ["manual", "gpx", "image-trace", "rematched"] as const
const ROAD_LOCK_CONFIDENCES = ["exact", "matched", "approximate"] as const
const BIKE_PROFILE_CATEGORIES = ["street", "touring", "adventure", "dual-sport"] as const

const roadAccessConditionSchema = object_({
  sourceKey: string({ max: 120 }),
  raw: string({ max: 500 }),
  isOpen: boolean(),
  reason: string({ max: 300 })
}, { passthrough: true })

const roadAccessSnapshotSchema = object_({
  highwayClass: string({ max: 40 }),
  motorcycleAccess: string({ max: 30 }),
  generalAccess: string({ max: 30 }),
  surface: string({ max: 40 }),
  smoothness: string({ max: 40 }),
  tracktype: string({ max: 40 }),
  maxweightTonnes: optional(number({ min: 0, max: 1000 })),
  seasonalUndated: withDefault(optional(boolean()), false),
  activeConditions: withDefault(optional(array(roadAccessConditionSchema, { max: 32 })), []),
  routable: withDefault(optional(boolean()), true)
}, { passthrough: true })

const roadLockSchema = object_({
  id: string({ trim: true, min: 1, max: 120 }),
  mode: enum_(ROAD_LOCK_MODES),
  displayName: optional(string({ trim: true, max: 160 })),
  edgeIds: withDefault(array(string({ max: 200 }), { max: 5_000 }), []),
  geometry: object_({
    type: literal("LineString"),
    coordinates: array(coordinateSchema, { min: 2, max: 50_000 })
  }),
  orderedAnchors: array(coordinateSchema, { min: 2, max: 200 }),
  fallbackToleranceMeters: number({ min: 1, max: 5_000 }),
  source: enum_(ROAD_LOCK_PROVENANCES),
  confidence: enum_(ROAD_LOCK_CONFIDENCES),
  sourceRegionId: string({ trim: true, min: 1, max: 80 }),
  sourceGraphVersion: string({ trim: true, min: 1, max: 120 }),
  accessSnapshot: roadAccessSnapshotSchema,
  createdAt: string({ max: 80 }),
  rematchedAt: optional(string({ max: 80 }))
}, { passthrough: true })

const bikeProfileSchema = object_({
  name: string({ trim: true, min: 1, max: 80 }),
  category: enum_(BIKE_PROFILE_CATEGORIES),
  wetWeightKg: optional(number({ min: 0, max: 1_000 })),
  fuelRangeMiles: number({ min: 1, max: 1_000 }),
  reserveMiles: number({ min: 0, max: 500 }),
  allowMaintainedGravel: boolean(),
  allowRoughTracks: boolean(),
  avoidUnknownSurface: boolean()
}, { passthrough: true })

const PROFILES = ["quick", "twisty", "scenic", "adventure"] as const

const routeRequestSchema = object_({
  profile: enum_(PROFILES),
  compare: withDefault(optional(boolean()), true),
  avoidHighways: optional(boolean()),
  avoidAreas: optional(array(avoidAreaSchema, { max: 3 })),
  segmentProfiles: optional(array(enum_(PROFILES), { max: 7 })),
  loopTargetMinutes: optional(number({ int: true, min: 20, max: 480 })),
  points: array(waypointSchema, { min: 1, max: 8 }),
  roundTrip: optional(object_({
    targetMinutes: number({ int: true, min: 20, max: 480 }),
    seed: optional(number({ int: true, min: 0, max: 999_999 })),
    heading: optional(number({ min: 0, max: 359.999 }))
  })),
  roadLocks: optional(array(roadLockSchema, { max: 64 })),
  bikeProfile: optional(bikeProfileSchema)
}, { passthrough: true })

function validateRouteRequest(value: {
  roundTrip?: { targetMinutes: number; seed?: number; heading?: number }
  points: { lat: number; lon: number; label?: string; locked?: boolean }[]
  loopTargetMinutes?: number
  segmentProfiles?: string[]
}): void {
  if (value.roundTrip && value.points.length !== 1) {
    throw new ValidationError("Round trips require one start point.", "points")
  }
  if (!value.roundTrip && value.points.length < 2) {
    throw new ValidationError("Routes require at least two waypoints.", "points")
  }
  if (value.roundTrip && value.loopTargetMinutes) {
    throw new ValidationError("Use one loop timebox format.", "loopTargetMinutes")
  }
  if (value.segmentProfiles && value.segmentProfiles.length !== value.points.length - 1) {
    throw new ValidationError("Choose one riding style for every route leg.", "segmentProfiles")
  }
  if (value.segmentProfiles && (value.roundTrip || value.loopTargetMinutes)) {
    throw new ValidationError("Per-leg riding styles are available for A-to-B routes.", "segmentProfiles")
  }
  if (value.loopTargetMinutes) {
    const first = value.points[0]
    const last = value.points.at(-1)
    if (value.points.length < 3 || !first || !last ||
      Math.abs(first.lat - last.lat) > 0.000_001 || Math.abs(first.lon - last.lon) > 0.000_001) {
      throw new ValidationError("Shaped loops must return to their start point.", "points")
    }
  }
}

const MAX_ROUTE_REQUEST_BYTES = 16 * 1024

async function readRoutePayload(
  request: Request
): Promise<{ payload: unknown } | { invalid: true } | { tooLarge: true }> {
  const declaredLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ROUTE_REQUEST_BYTES) {
    return { tooLarge: true }
  }

  if (!request.body) return { invalid: true }
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let body = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytesRead += value.byteLength
      if (bytesRead > MAX_ROUTE_REQUEST_BYTES) {
        await reader.cancel()
        return { tooLarge: true }
      }
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
    return { payload: JSON.parse(body) }
  } catch {
    return { invalid: true }
  }
}

export async function handleRouteRequest(
  request: Request,
  provider: RouteProvider,
  enricher?: RouteCandidateEnricher
): Promise<Response> {
  const body = await readRoutePayload(request)
  if ("tooLarge" in body) {
    return errorResponse(
      "ROUTE_REQUEST_TOO_LARGE",
      "The route request is too large.",
      413
    )
  }
  if ("invalid" in body) {
    return errorResponse(
      "INVALID_ROUTE_REQUEST",
      "The route request must be valid JSON.",
      400
    )
  }

  const parsed = safeParse(routeRequestSchema, body.payload)
  if (!parsed.success) {
    return errorResponse(
      "INVALID_ROUTE_REQUEST",
      "Choose a motorcycle profile and provide valid waypoints or one timeboxed loop start.",
      400,
      { message: parsed.error.message, path: parsed.error.path }
    )
  }

  try {
    validateRouteRequest(parsed.data)
  } catch (e) {
    if (e instanceof ValidationError) {
      return errorResponse(
        "INVALID_ROUTE_REQUEST",
        e.message,
        400,
        { path: e.path }
      )
    }
    throw e
  }

  try {
    const trip = await planMotorcycleTrip(parsed.data as TripPlanRequest, provider, enricher)
    return Response.json(trip)
  } catch (error) {
    if (error instanceof GraphHopperProviderError || error instanceof ValhallaProviderError) {
      return errorResponse(error.code, error.message, normalizeStatus(error.status))
    }
    const message = error instanceof Error ? error.message : "The route could not be planned."
    return errorResponse("ROUTE_PLANNING_FAILED", message, 500)
  }
}

function normalizeStatus(status: number): number {
  return status >= 400 && status <= 599 ? status : 500
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown
): Response {
  return Response.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status }
  )
}
