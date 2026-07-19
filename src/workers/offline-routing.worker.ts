/// <reference lib="webworker" />
import {
  OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
  buildOfflineRoutingWorkerFailure,
  buildOfflineRoutingWorkerOk,
  parseOfflineRoutingWorkerRequest,
  type OfflineRoutingWorkerResult
} from "@/lib/offline/worker-protocol"

interface TrackedRequest {
  cancelled: boolean
  startedAt: number
}

/**
 * Best-effort shape of the dynamic-imported graph module. Defining it locally
 * (rather than importing types from `@/lib/offline/graph`) lets the worker
 * compile even before that module exists on disk.
 */
interface GraphModuleShape {
  validateOfflineGraph(graph: unknown): void
}

interface AStarFailureResult {
  kind?:
    | "invalid_graph"
    | "invalid_nodes"
    | "missing_shaping_point"
    | "no_path"
    | "max_visited"
    | "cancelled"
    | "stale"
    | "unsupported"
  message?: string
}

interface AStarResult {
  result?: unknown
  failure?: AStarFailureResult
}

/**
 * Best-effort shape of the dynamic-imported A* module. Same rationale as
 * {@link GraphModuleShape}: keeps the worker buildable before the real module
 * is linked into the bundle.
 */
interface AStarModuleShape {
  findOfflinePath(
    graph: unknown,
    adjacency: unknown,
    startNodeIndex: number,
    goalNodeIndex: number,
    options: {
      atEpochMillis: number
      maxVisitedNodes: number
      respectOneWay: boolean
    }
  ): AStarResult
}

interface OfflineRoutingWorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent) => void
  ): void
  postMessage(message: OfflineRoutingWorkerResult): void
}

const workerScope = self as unknown as OfflineRoutingWorkerScope
const tracked = new Map<string, TrackedRequest>()

workerScope.addEventListener("message", async (event: MessageEvent) => {
  const raw = event.data
  const parsed = parseOfflineRoutingWorkerRequest(raw)
  if (!parsed) {
    const fallbackRequestId =
      typeof (raw as { requestId?: unknown })?.requestId === "string"
        ? (raw as { requestId: string }).requestId
        : ""
    const failure: OfflineRoutingWorkerResult = {
      version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
      requestId: fallbackRequestId,
      status: "malformed_request",
      message: "Request was not a valid OfflineRoutingWorkerRequest.",
      result: {},
      kind: "route",
      workerProtocolVersion: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION
    }
    workerScope.postMessage(failure)
    return
  }

  if (parsed.version > OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION) {
    workerScope.postMessage(
      buildOfflineRoutingWorkerFailure(
        parsed,
        "unsupported_version",
        `Worker supports protocol v${OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION}; received v${parsed.version}.`
      )
    )
    return
  }

  switch (parsed.kind) {
    case "ping": {
      workerScope.postMessage(
        buildOfflineRoutingWorkerOk(parsed, { echo: parsed.echo })
      )
      return
    }
    case "cancel": {
      const target = tracked.get(parsed.cancelRequestId)
      if (target) {
        target.cancelled = true
      }
      workerScope.postMessage(
        buildOfflineRoutingWorkerOk(parsed, {
          cancelledRequestId: parsed.cancelRequestId
        })
      )
      return
    }
    case "route": {
      tracked.set(parsed.requestId, { cancelled: false, startedAt: Date.now() })
      let result: OfflineRoutingWorkerResult
      try {
        try {
          // Best-effort dynamic import. Falls back to `unsupported` if the
          // modules are not yet linked into the build (the lead wires these up
          // after the worker protocol package is accepted).
          //
          // The modules are intentionally fetched through a string-typed helper
          // so the worker can compile before `@/lib/offline/graph` and
          // `@/lib/offline/a-star` exist on disk.
          const graphModule = (await import(
            /* @vite-ignore */ "@/lib/offline/graph"
          )) as GraphModuleShape
          const aStarModule = (await import(
            /* @vite-ignore */ "@/lib/offline/a-star"
          )) as AStarModuleShape
          graphModule.validateOfflineGraph(parsed.graph)
          const found = aStarModule.findOfflinePath(
            parsed.graph,
            parsed.adjacency,
            parsed.startNodeIndex,
            parsed.goalNodeIndex,
            {
              atEpochMillis: parsed.atEpochMillis,
              maxVisitedNodes: parsed.maxVisitedNodes ?? 50_000,
              respectOneWay: parsed.respectOneWay ?? true
            }
          )
          result = found.result
            ? buildOfflineRoutingWorkerOk(parsed, found.result)
            : buildOfflineRoutingWorkerFailure(
                parsed,
                found.failure?.kind ?? "no_path",
                found.failure?.message ?? "No path found."
              )
        } catch {
          result = buildOfflineRoutingWorkerFailure(
            parsed,
            "unsupported",
            "Routing payload validation is not available in this worker build."
          )
        }
      } finally {
        const tracker = tracked.get(parsed.requestId)
        if (tracker?.cancelled) {
          result = buildOfflineRoutingWorkerFailure(
            parsed,
            "cancelled",
            "Request was cancelled before completion."
          )
        }
        tracked.delete(parsed.requestId)
      }
      workerScope.postMessage(result)
      return
    }
    default: {
      workerScope.postMessage(
        buildOfflineRoutingWorkerFailure(
          parsed,
          "unsupported_kind",
          `Unknown request kind: ${(parsed as { kind?: string }).kind}`
        )
      )
    }
  }
})
