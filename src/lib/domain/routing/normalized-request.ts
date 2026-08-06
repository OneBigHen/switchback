import type {
  AvoidArea,
  Coordinate,
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
 * guesses defaults, so bike, toll, access, road-requirement, and avoidance
 * constraints apply identically in every mode (destination, loop, timeboxed,
 * segmented, alternatives, fallback, offline recovery).
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

function randomRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function shapeOf(request: RouteRequest): "destination" | "loop" {
  if (request.roundTrip || request.loopTargetMinutes != null) return "loop"
  return "destination"
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
    roadLocks: request.roadLocks ?? []
  }
}
