/**
 * Versioned message protocol exchanged between the main thread and the
 * offline-routing Web Worker (`src/workers/offline-routing.worker.ts`).
 *
 * The protocol is intentionally self-contained: it has zero imports from
 * `@/lib/offline/a-star` or `@/lib/offline/graph` so that callers can validate
 * and build messages without dragging the routing engine into the bundle.
 * Deep payload validation happens inside the worker handler, not here.
 */

/**
 * Schema version of the offline-routing worker protocol.
 *
 * The parser is permissive (accepts any `>= 1` version for forward
 * compatibility) but the worker itself rejects any version greater than this
 * constant via {@link OfflineRoutingWorkerFailureKind:"unsupported_version"}.
 */
export const OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION = 2

export type OfflineRoutingWorkerRequestKind =
  | "route"
  | "route_v2"
  | "cancel"
  | "ping"

export interface OfflineRoutingWorkerBaseRequest {
  /** Protocol schema version, verbatim from {@link OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION}. */
  version: number
  /** Unique per-request id so callers can correlate results and cancel outstanding work. */
  requestId: string
  kind: OfflineRoutingWorkerRequestKind
}

export interface OfflineRoutingWorkerRouteRequest extends OfflineRoutingWorkerBaseRequest {
  kind: "route"
  /** Serialized OfflineGraph payload (graph.ts). Worker validates before invoking A*. */
  graph: unknown
  /** Serialized OfflineGraphAdjacency payload (graph.ts). */
  adjacency: unknown
  /** Start node index into the graph.nodes array. */
  startNodeIndex: number
  /** Goal node index into the graph.nodes array. */
  goalNodeIndex: number
  /** Reference epoch millis used to fall back to default heuristic when none provided. */
  atEpochMillis: number
  /** Optional maxNodes override (defaults to 50_000 inside the worker). */
  maxVisitedNodes?: number
  /** Whether to respect one-way restrictions during traversal. Defaults true. */
  respectOneWay?: boolean
}

export interface OfflineRoutingWorkerRouteV2Request extends OfflineRoutingWorkerBaseRequest {
  kind: "route_v2"
  /** Validated spatial graph tile payloads loaded for the bounded search area. */
  tiles: unknown[]
  /** Serialized OfflineRouteRequestV2. */
  routeRequest: unknown
}

export interface OfflineRoutingWorkerCancelRequest extends OfflineRoutingWorkerBaseRequest {
  kind: "cancel"
  /** requestId to cancel. May be the same as this request's id (self-cancel) or another active one. */
  cancelRequestId: string
}

export interface OfflineRoutingWorkerPingRequest extends OfflineRoutingWorkerBaseRequest {
  kind: "ping"
  /** Echoed back in the result so callers can verify protocol wiring. */
  echo: string
}

export type OfflineRoutingWorkerRequest =
  | OfflineRoutingWorkerRouteRequest
  | OfflineRoutingWorkerRouteV2Request
  | OfflineRoutingWorkerCancelRequest
  | OfflineRoutingWorkerPingRequest

export type OfflineRoutingWorkerFailureKind =
  | "unsupported_version"
  | "unsupported_kind"
  | "malformed_request"
  | "invalid_graph"
  | "invalid_nodes"
  | "missing_shaping_point"
  | "no_path"
  | "max_visited"
  | "missing_region"
  | "out_of_coverage"
  | "corrupt_data"
  | "search_budget"
  | "cancelled"
  | "stale"
  | "unsupported"

export interface OfflineRoutingWorkerResult {
  version: number
  /** Matches the originating request id. */
  requestId: string
  /** "ok" on success; otherwise one of {@link OfflineRoutingWorkerFailureKind}. */
  status: "ok" | OfflineRoutingWorkerFailureKind
  /** On ok+route: the serialized OfflineAStarResult payload. Empty object otherwise. */
  result?: unknown
  /** On failure: a human-readable message. Empty string on success. */
  message?: string
  /** Mirrors the request kind for clarity. */
  kind: OfflineRoutingWorkerRequestKind
  /** Mirrors the protocol version under which the worker replied. */
  workerProtocolVersion: number
}

/**
 * Validate that an incoming message is well-formed at the protocol level.
 *
 * The parser is intentionally permissive on payload shape; deeper validation
 * of the graph/adjacency happens inside the worker handler. Returns the typed
 * request on success, or `null` when the message cannot be interpreted as a
 * valid {@link OfflineRoutingWorkerRequest}.
 */
export function parseOfflineRoutingWorkerRequest(
  raw: unknown
): OfflineRoutingWorkerRequest | null {
  if (raw === null || typeof raw !== "object") return null
  const message = raw as Record<string, unknown>

  // Version: must be present, a number, and >= 1 (forward-compat in the
  // parser). The worker itself may still reject newer versions.
  const version = message.version
  if (typeof version !== "number" || !Number.isFinite(version) || version < 1) {
    return null
  }

  // requestId: must be a non-empty string.
  const requestId = message.requestId
  if (typeof requestId !== "string" || requestId.length === 0) return null

  // kind: must be one of the supported values.
  const kind = message.kind
  if (kind !== "route" && kind !== "route_v2" && kind !== "cancel" && kind !== "ping") return null

  if (kind === "route_v2") {
    if (!Array.isArray(message.tiles) || !isObject(message.routeRequest)) return null
    return { version, requestId, kind, tiles: message.tiles, routeRequest: message.routeRequest }
  }

  if (kind === "route") {
    if (!isObject(message.graph)) return null
    if (!isObject(message.adjacency)) return null
    const startNodeIndex = message.startNodeIndex
    if (!isNonNegativeFiniteInteger(startNodeIndex)) return null
    const goalNodeIndex = message.goalNodeIndex
    if (!isNonNegativeFiniteInteger(goalNodeIndex)) return null
    const atEpochMillis = message.atEpochMillis
    if (typeof atEpochMillis !== "number" || !Number.isFinite(atEpochMillis)) {
      return null
    }
    return {
      version,
      requestId,
      kind,
      graph: message.graph,
      adjacency: message.adjacency,
      startNodeIndex,
      goalNodeIndex,
      atEpochMillis,
      maxVisitedNodes:
        typeof message.maxVisitedNodes === "number" ? message.maxVisitedNodes : undefined,
      respectOneWay:
        typeof message.respectOneWay === "boolean" ? message.respectOneWay : undefined
    }
  }

  if (kind === "cancel") {
    const cancelRequestId = message.cancelRequestId
    if (typeof cancelRequestId !== "string" || cancelRequestId.length === 0) {
      return null
    }
    return { version, requestId, kind, cancelRequestId }
  }

  // kind === "ping"
  const echo = message.echo
  if (typeof echo !== "string") return null
  return { version, requestId, kind, echo }
}

/**
 * Build a normalized ok result. Pure.
 */
export function buildOfflineRoutingWorkerOk(
  request: Pick<OfflineRoutingWorkerRequest, "requestId" | "kind">,
  result: unknown
): OfflineRoutingWorkerResult {
  return {
    version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
    requestId: request.requestId,
    status: "ok",
    result,
    message: "",
    kind: request.kind,
    workerProtocolVersion: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION
  }
}

/**
 * Build a normalized failure result. Pure.
 */
export function buildOfflineRoutingWorkerFailure(
  request:
    | Pick<OfflineRoutingWorkerRequest, "requestId" | "kind">
    | { requestId: string; kind: OfflineRoutingWorkerRequestKind },
  status: OfflineRoutingWorkerFailureKind,
  message: string
): OfflineRoutingWorkerResult {
  return {
    version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
    requestId: request.requestId,
    status,
    result: {},
    message,
    kind: request.kind,
    workerProtocolVersion: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isNonNegativeFiniteInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  )
}
