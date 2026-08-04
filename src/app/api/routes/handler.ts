import type { RouteCandidateEnricher, RouteProvider, TripPlanRequest } from "@/lib/routing/planner"
import { planMotorcycleTrip } from "@/lib/routing/planner"
import { GraphHopperProviderError } from "@/lib/routing/graphhopper"
import { ValhallaProviderError } from "@/lib/routing/valhalla"
import { RouteQueueFullError } from "@/lib/server/route-job-limiter"
import type { RouteRequest } from "@/lib/routing/types"
import type { CorridorSourceCandidates } from "@/lib/routing/destination-corridors"
import { routeCacheKey, type RouteCache } from "@/lib/server/route-cache"
import {
  number, string, boolean, enum_, literal, object_, tuple, array,
  optional, nullable, withDefault, safeParse, ValidationError
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
  maxweightTonnes: nullable(number({ min: 0, max: 1000 })),
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
  bikeProfile: optional(bikeProfileSchema),
  planningId: optional(string({ trim: true, min: 8, max: 64 })),
  candidateSet: withDefault(optional(enum_(["primary", "alternatives"] as const)), "primary"),
  targetMinutes: optional(number({ int: true, min: 20, max: 480 })),
  tollPolicy: withDefault(optional(enum_(["allow-with-warning", "avoid"] as const)), "allow-with-warning"),
  primaryRoute: optional(object_({
    id: string({ trim: true, min: 1, max: 120 }),
    geometry: array(coordinateSchema, { min: 2, max: 128 })
  }))
}, { passthrough: true })

function validateRouteRequest(value: {
  roundTrip?: { targetMinutes: number; seed?: number; heading?: number }
  points: { lat: number; lon: number; label?: string; locked?: boolean }[]
  loopTargetMinutes?: number
  segmentProfiles?: string[]
  candidateSet?: "primary" | "alternatives"
  primaryRoute?: { id: string; geometry: unknown[] }
  targetMinutes?: number
}): void {
  if (value.candidateSet === "alternatives" && !value.primaryRoute) {
    throw new ValidationError("Alternatives requests require the sampled primary route.", "primaryRoute")
  }
  if (value.candidateSet !== "alternatives" && value.primaryRoute) {
    throw new ValidationError("The sampled primary route belongs on alternatives requests.", "primaryRoute")
  }
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

/** Server-side planning context: optional short-lived primary cache. */
export interface RoutePlanningContext {
  cache?: RouteCache
  /** Phase 4 corridor-source resolver for destination timeboxing. */
  resolveCorridors?: (request: RouteRequest) => Promise<CorridorSourceCandidates>
}

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
  enricher?: RouteCandidateEnricher,
  context: RoutePlanningContext = {}
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
    // Thread the incoming request's abort signal through planning so a
    // client cancellation stops provider work, not just repainting.
    const cache = context.cache ?? null
    const cacheKey = cache && parsed.data.candidateSet !== "alternatives"
      ? routeCacheKey(parsed.data as RouteRequest)
      : null
    if (cacheKey && cache) {
      const cached = cache.get(cacheKey)
      if (cached) {
        return Response.json({
          ...cached,
          ...echoedMetadata(parsed.data),
          timingMs: { cache: "hit" }
        })
      }
    }
    const trip = await planMotorcycleTrip(parsed.data as TripPlanRequest, provider, enricher, {
      signal: request.signal,
      resolveCorridors: context.resolveCorridors
    })
    if (cacheKey && cache) {
      cache.set(cacheKey, trip)
    }
    return Response.json(trip)
  } catch (error) {
    if (error instanceof RouteQueueFullError) {
      // The provider queue is saturated; 429 tells the client to back off
      // instead of retrying a 5xx storm.
      return errorResponse("ROUTING_QUEUE_FULL", error.message, 429)
    }
    if (error instanceof GraphHopperProviderError || error instanceof ValhallaProviderError) {
      return errorResponse(
        error.code,
        friendlyRoutingErrorMessage(error.code),
        normalizeStatus(error.status),
        { providerMessage: error.message }
      )
    }
    const message = error instanceof Error ? error.message : "The route could not be planned."
    return errorResponse("ROUTE_PLANNING_FAILED", message, 500)
  }
}

/**
 * Rider-facing copy for provider failures: calm and actionable, with no
 * engine names or status codes. The raw provider detail is preserved in the
 * response's `details.providerMessage` for debugging.
 */
function friendlyRoutingErrorMessage(code: string): string {
  switch (code) {
    case "OUT_OF_COVERAGE":
      return "That ride leaves the covered map area. Pick a start and destination inside the map, or zoom in to check the bounds."
    case "PROVIDER_UNAVAILABLE":
      return "The route service is temporarily unavailable. Nothing was lost — try again in a moment."
    case "ROUTING_REJECTED":
      return "That ride couldn't be routed. Try different start or finish points, or a different route style."
    default:
      return "The ride couldn't be routed right now. Try again in a moment."
  }
}

function normalizeStatus(status: number): number {
  return status >= 400 && status <= 599 ? status : 500
}

/** Re-stamp the progressive-API echo fields on a cache hit for a new caller. */
function echoedMetadata(request: {
  planningId?: string
  candidateSet?: "primary" | "alternatives"
  targetMinutes?: number
}): Record<string, unknown> {
  return {
    ...(request.planningId ? { planningId: request.planningId } : {}),
    ...(request.candidateSet ? { candidateSet: request.candidateSet } : {}),
    ...(request.targetMinutes != null ? { targetMinutes: request.targetMinutes } : {})
  }
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
