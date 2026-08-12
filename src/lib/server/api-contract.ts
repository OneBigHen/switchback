const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/

const ACTIONS: Record<string, string> = {
  LOCATION_DENIED: "Allow location access or choose a start point.",
  LOCATION_UNCERTAIN: "Wait for a better GPS fix.",
  SEARCH_UNAVAILABLE: "Try again when search is available.",
  ROUTER_UNAVAILABLE: "Try again in a moment.",
  PROVIDER_UNAVAILABLE: "Try again in a moment.",
  ROUTE_IMPOSSIBLE: "Choose different start or finish points.",
  OUT_OF_COVERAGE: "Choose different start or finish points.",
  ROUTING_REJECTED: "Choose different start or finish points.",
  OFFLINE_REGION_MISSING: "Download the needed offline region or reconnect.",
  PACK_CORRUPT: "Remove and download the offline pack again.",
  GPX_INVALID: "Choose a valid GPX file.",
  GPX_TOO_LARGE: "Choose a smaller GPX file.",
  AUTH_REQUIRED: "Sign in to continue.",
  CSRF_REQUIRED: "Refresh the page and retry the action.",
  RATE_LIMITED: "Wait a moment and try again.",
  ROUTING_QUEUE_FULL: "Wait a moment and try again.",
  PROVIDER_BUDGET_EXCEEDED: "Try again later.",
  FREE_RIDE_UNAVAILABLE: "Choose a destination route instead.",
  FREE_RIDE_GRAPH_UNAVAILABLE: "Install a verified Free Ride graph or choose a destination route.",
  FREE_RIDE_GRAPH_INVALID: "Repair the verified Free Ride graph before riding.",
  FREE_RIDE_ROUTER_UNAVAILABLE: "Try Free Ride again when routing is available.",
  ROUTE_PLANNING_FAILED: "Try again in a moment."
}

function generatedRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `req-${crypto.randomUUID()}`
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Read a safe correlation id or make one for this request. */
export function readRequestId(request: Request): string {
  const candidate = request.headers.get("x-request-id")?.trim()
  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : generatedRequestId()
}

/** Keep a route's own body id when it is more specific than the edge header. */
export function withRequestId(response: Response, requestId: string): Response {
  if (!response.headers.has("x-request-id")) response.headers.set("x-request-id", requestId)
  return response
}

export function jsonWithRequestId(
  body: unknown,
  requestId: string,
  init: ResponseInit = {}
): Response {
  const headers = new Headers(init.headers)
  headers.set("x-request-id", requestId)
  return Response.json(body, { ...init, headers })
}

export function apiErrorResponse(
  code: string,
  message: string,
  status: number,
  requestId: string,
  details?: unknown
): Response {
  return jsonWithRequestId({
    error: {
      code,
      message,
      action: ACTIONS[code] ?? "Try again in a moment.",
      requestId,
      ...(details ? { details } : {})
    }
  }, requestId, { status })
}
