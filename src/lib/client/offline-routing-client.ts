import {
  OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
  type OfflineRoutingWorkerRequest,
  type OfflineRoutingWorkerResult
} from "@/lib/offline/worker-protocol"
import type { OfflineGraphTileV2 } from "@/lib/offline/v2-contracts"
import type {
  OfflineRouteRequestV2,
  OfflineRouteSuccessV2
} from "@/lib/offline/v2-router"

/**
 * Worker side of the offline routing protocol.
 *
 * The offline-routing Web Worker runs `routeOfflineV2` off the main thread so
 * a bounded regional reroute never blocks planner interactions. This interface
 * is the main-thread contract; production uses a real `Worker`, tests inject a
 * fake factory.
 */
export interface OfflineRoutingWorker {
  onmessage: ((event: MessageEvent<OfflineRoutingWorkerResult>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: OfflineRoutingWorkerRequest): void
  terminate(): void
}

export type OfflineRoutingWorkerFactory = () => OfflineRoutingWorker

export interface RouteOfflineV2Options {
  /** Override the worker factory (tests inject a fake; production uses the real worker). */
  createWorker?: OfflineRoutingWorkerFactory
  /** Cancel the request; the worker is told to cancel and the promise rejects. */
  signal?: AbortSignal
}

/** Failure kind raised when the worker reports a non-ok `route_v2` result. */
export class OfflineRoutingError extends Error {
  readonly kind: string

  constructor(kind: string, message: string) {
    super(message)
    this.name = "OfflineRoutingError"
    this.kind = kind
  }
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `offline-route-${Date.now().toString(36)}`
}

function createOfflineRoutingWorker(): OfflineRoutingWorker {
  return new Worker(
    new URL("../../workers/offline-routing.worker.ts", import.meta.url),
    { type: "module", name: "switchback-offline-routing" }
  )
}

/**
 * Route an {@link OfflineRouteRequestV2} against installed regional tiles in
 * the worker, returning the bounded search result.
 *
 * Rejects with {@link OfflineRoutingError} carrying the worker's failure kind
 * (e.g. `missing_region`, `out_of_coverage`, `no_path`) and its message, so
 * ride recovery can surface an honest, actionable reason instead of claiming
 * success or failing with a generic error.
 */
export async function routeOfflineV2InWorker(
  request: OfflineRouteRequestV2,
  tiles: OfflineGraphTileV2[],
  options: RouteOfflineV2Options = {}
): Promise<OfflineRouteSuccessV2> {
  const createWorker = options.createWorker ?? createOfflineRoutingWorker
  const signal = options.signal
  const worker = createWorker()
  const requestId = createRequestId()

  return new Promise<OfflineRouteSuccessV2>((resolve, reject) => {
    const finish = () => {
      worker.terminate()
      signal?.removeEventListener("abort", onAbort)
    }
    const onAbort = () => {
      worker.postMessage({
        version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
        requestId,
        kind: "cancel",
        cancelRequestId: requestId
      })
      finish()
      reject(new OfflineRoutingError("cancelled", "The offline reroute was cancelled."))
    }

    worker.onerror = () => {
      finish()
      reject(new OfflineRoutingError("worker_error", "The offline routing worker stopped unexpectedly."))
    }
    worker.onmessage = ({ data }) => {
      if (data.version !== OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION || data.requestId !== requestId) return
      finish()
      if (data.status !== "ok") {
        reject(new OfflineRoutingError(data.status, data.message ?? "Offline routing failed."))
        return
      }
      resolve(data.result as OfflineRouteSuccessV2)
    }

    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener("abort", onAbort, { once: true })
    }

    worker.postMessage({
      version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
      requestId,
      kind: "route_v2",
      tiles,
      routeRequest: request
    })
  })
}
