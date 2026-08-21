import type { PlannedRoute, RouteRequest } from "./types"
import { normalizeRouteRequest, type NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"
import {
  createGraphHopperRequest,
  estimateRoundTripDistanceMeters,
  expandMustLockWaypoints,
  REQUESTED_DETAILS
} from "./graphhopper-request"
import {
  GraphHopperProviderError,
  createRouteId,
  normalizeGraphHopperPath,
  normalizeGraphHopperProviderError,
  type GraphHopperResponse
} from "./graphhopper-response"

export {
  createGraphHopperRequest,
  estimateRoundTripDistanceMeters,
  expandMustLockWaypoints,
  GraphHopperProviderError,
  createRouteId
}

export interface GraphHopperOptions {
  baseUrl: string
  fetcher?: typeof fetch
  /** Lifecycle cancellation signal, combined with the request timeout. */
  signal?: AbortSignal
}

export interface GraphHopperResult {
  engine: "graphhopper"
  engineVersion: string
  routes: PlannedRoute[]
  warnings?: string[]
}

/** AbortError travels across runtimes/realms, so check the name, not the class. */
function isAbortError(caught: unknown): boolean {
  return caught !== null && typeof caught === "object"
    && (caught as { name?: unknown }).name === "AbortError"
}

interface RouteFetchResult {
  response: Response
  payload: GraphHopperResponse
  /** Detail name the active graph cannot serve, when the request was rejected. */
  unsupportedDetail: string | null
  /** Request-time encoded value missing from an older active graph. */
  unsupportedEncodedValue: string | null
}

async function fetchRouteOnce(
  request: NormalizedRouteRequest,
  options: GraphHopperOptions,
  details: string[],
  omitSmoothness = false
): Promise<RouteFetchResult> {
  const fetcher = options.fetcher ?? fetch
  let response: Response
  try {
    response = await fetcher(`${options.baseUrl.replace(/\/$/, "")}/route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createGraphHopperRequest(request, details, omitSmoothness)),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000)
    })
  } catch (caught) {
    if (isAbortError(caught)) {
      throw new GraphHopperProviderError(
        "Route planning was cancelled.",
        "ROUTE_CANCELLED",
        499
      )
    }
    throw new GraphHopperProviderError(
      "Cannot reach the routing engine. Check that GraphHopper is running and try again.",
      "PROVIDER_UNAVAILABLE",
      503
    )
  }

  let payload: GraphHopperResponse
  try {
    payload = (await response.json()) as GraphHopperResponse
  } catch {
    throw new GraphHopperProviderError(
      "GraphHopper returned an unreadable response",
      "INVALID_PROVIDER_RESPONSE",
      502
    )
  }

  const missingDetail = response.ok
    ? null
    : payload.message?.match(/Cannot find the path details: \[([^\]]+)\]/)?.[1] ?? null
  const missingEncodedValue = response.ok
    ? null
    : payload.message?.match(/'([^']+)' not available/)?.[1] ?? null
  return {
    response,
    payload,
    unsupportedDetail: missingDetail,
    unsupportedEncodedValue: missingEncodedValue
  }
}

export async function requestGraphHopperRoutes(
  _input: RouteRequest,
  options: GraphHopperOptions
): Promise<GraphHopperResult> {
  // Adapter boundary normalization (SB-001): even direct callers get the full
  // explicit constraint contract before any provider request is built.
  let request = normalizeRouteRequest(_input)
  // SB-014 ordered Must traversal: expand the wire points with must-lock
  // entry/exit anchors (in lock order) and remember the mapping so the parsed
  // route keeps only the rider's own waypoints.
  const expansion = expandMustLockWaypoints(request)
  if (expansion.wireToOriginal.some((index) => index === -1)) {
    request = { ...request, points: expansion.points, lockViaWireToOriginal: expansion.wireToOriginal }
  }
  // The active graph may predate an encoded-value change (e.g. the Phase 3
  // `toll` value). Retry once without the unsupported detail so a rolled-back
  // or not-yet-reimported graph degrades to missing evidence instead of
  // failing every route; the evidence fields already handle absence.
  let attempt = await fetchRouteOnce(request, options, REQUESTED_DETAILS)
  const warnings: string[] = []
  if (attempt.unsupportedDetail || attempt.unsupportedEncodedValue === "smoothness") {
    const degraded = REQUESTED_DETAILS.filter((detail) => detail !== attempt.unsupportedDetail)
    const omitSmoothness = attempt.unsupportedEncodedValue === "smoothness"
    attempt = await fetchRouteOnce(request, options, degraded, omitSmoothness)
    if (omitSmoothness) {
      warnings.push("The active routing graph lacks smoothness data; this route was served without that condition.")
    }
  }

  if (!attempt.response.ok) {
    throw normalizeGraphHopperProviderError(attempt.response.status, attempt.payload.message ?? attempt.response.statusText)
  }
  const payload = attempt.payload
  if (!payload.paths?.length) {
    throw normalizeGraphHopperProviderError(422, payload.message ?? "No route was found")
  }

  return {
    engine: "graphhopper",
    engineVersion: payload.info?.version ?? "11.0",
    routes: payload.paths.map((path, index) => normalizeGraphHopperPath(path, request, index)),
    ...(warnings.length > 0 ? { warnings } : {})
  }
}
