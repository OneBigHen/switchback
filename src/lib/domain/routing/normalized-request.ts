import type {
  AvoidArea,
  Coordinate,
  GravelAtlasIntensity,
  GravelAtlasPreference,
  RouteRequest,
  RouteRequestSource,
  TollPolicy
} from "@/lib/routing/types"
import type { RoadLock } from "@/lib/roads/road-locks"

/**
 * Where a planning request came from. Every source goes through the same
 * normalized eligibility pipeline — no mode may construct a partial provider
 * request (SB-001).
 */
export type { RouteRequestSource }

/**
 * The single normalized contract provider adapters consume.
 *
 * All constraint fields are required and explicit: a provider adapter never
 * guesses defaults, so bike, toll, access, road-requirement, gravel-atlas, and
 * avoidance constraints apply identically in every mode (destination, loop,
 * timeboxed, segmented, alternatives, fallback, offline recovery).
 */
export interface NormalizedRouteRequest extends RouteRequest {
  /** Client-generated unique id for this exact request (vs planningId which
   *  spans a whole planning session). */
  requestId: string
  shape: "destination" | "loop"
  source: RouteRequestSource
  avoidHighways: boolean
  avoidAreas: AvoidArea[]
  tollPolicy: TollPolicy
  gravelAtlas: GravelAtlasPreference
  roadLocks: RoadLock[]
  compare?: boolean
  primaryRoute?: { id: string; geometry: Coordinate[] }
  /**
   * SB-014 ordered Must traversal: when must-use locks expand the request
   * points into wire via-waypoints (entry → exit per lock, in lock order),
   * this maps each wire point index back to the original request point
   * index, or -1 for an injected lock anchor. The response parser uses it
   * so the returned route carries the rider's original waypoints only.
   */
  lockViaWireToOriginal?: number[]
}

const GRAVEL_ATLAS_DEFAULT: GravelAtlasPreference = {
  enabled: false,
  intensity: "balanced"
}
const GRAVEL_ATLAS_PROFILES = new Set<RouteRequest["profile"]>(["adventure", "gravel"])
const GRAVEL_ATLAS_INTENSITIES = new Set<GravelAtlasIntensity>(["balanced", "more", "maximum"])

function randomRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function shapeOf(request: RouteRequest): "destination" | "loop" {
  if (request.roundTrip || request.loopTargetMinutes != null) return "loop"
  return "destination"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Request JSON is untrusted at runtime even though TypeScript callers see a
 * narrow type. Invalid or ineligible atlas requests fail closed to OFF rather
 * than accidentally adding route-attraction candidates.
 */
function normalizeGravelAtlas(request: RouteRequest): GravelAtlasPreference {
  const value: unknown = (request as RouteRequest & { gravelAtlas?: unknown }).gravelAtlas
  if (!GRAVEL_ATLAS_PROFILES.has(request.profile) || !isRecord(value)) {
    return { ...GRAVEL_ATLAS_DEFAULT }
  }
  const intensity = value.intensity
  if (
    value.enabled !== true ||
    typeof intensity !== "string" ||
    !GRAVEL_ATLAS_INTENSITIES.has(intensity as GravelAtlasIntensity)
  ) {
    return { ...GRAVEL_ATLAS_DEFAULT }
  }
  return {
    enabled: true,
    intensity: intensity as GravelAtlasIntensity
  }
}

/**
 * Normalize any route request into the provider contract. Derives shape,
 * generates a stable request id when absent, and makes every constraint
 * field explicit with its documented default so adapters never guess.
 */
export function normalizeRouteRequest(request: RouteRequest): NormalizedRouteRequest {
  return {
    ...request,
    requestId: request.requestId ?? randomRequestId(),
    shape: shapeOf(request),
    source: request.source ?? "manual",
    avoidHighways: request.avoidHighways ?? false,
    avoidAreas: request.avoidAreas ?? [],
    tollPolicy: request.tollPolicy ?? "allow-with-warning",
    gravelAtlas: normalizeGravelAtlas(request),
    roadLocks: request.roadLocks ?? []
  }
}
