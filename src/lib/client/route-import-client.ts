import { MAX_GPX_IMPORT_BYTES } from "@/lib/routing/gpx-import"
import {
  parseImportWorkerResult,
  ROUTE_IMPORT_WORKER_VERSION,
  type ImportWorkerRequest,
  type ImportWorkerResult
} from "@/lib/routing/import-worker-protocol"
import type { PlannedRoute } from "@/lib/routing/types"
import { trackRuntimeResource } from "@/lib/client/runtime-diagnostics"

export interface RouteImportWorker {
  onmessage: ((event: MessageEvent<ImportWorkerResult>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror?: ((event: MessageEvent) => void) | null
  postMessage(message: ImportWorkerRequest, transfer: Transferable[]): void
  terminate(): void
}

export type RouteImportWorkerFactory = () => RouteImportWorker

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `route-import-${Date.now().toString(36)}`
}

function createRouteImportWorker(): RouteImportWorker {
  return new Worker(
    new URL("../../workers/route-import.worker.ts", import.meta.url),
    { type: "module", name: "switchback-route-import" }
  )
}

let nextGeneration = 0
let activeImportWorkers = 0
const MAX_ACTIVE_IMPORT_WORKERS = 1
const ROUTE_IMPORT_DEADLINE_MS = 30_000

function createGeneration(): number {
  nextGeneration = nextGeneration === Number.MAX_SAFE_INTEGER ? 1 : nextGeneration + 1
  return nextGeneration
}

function abortError(): Error {
  const error = new Error("Route import was cancelled.")
  error.name = "AbortError"
  return error
}

export async function parseRouteFileInWorker(
  file: File,
  createWorker: RouteImportWorkerFactory = createRouteImportWorker,
  signal?: AbortSignal
): Promise<PlannedRoute> {
  if (file.size > MAX_GPX_IMPORT_BYTES) {
    throw new Error("Route imports must be 5 MB or smaller.")
  }
  if (signal?.aborted) throw abortError()

  const contents = await file.arrayBuffer()
  if (signal?.aborted) throw abortError()
  if (activeImportWorkers >= MAX_ACTIVE_IMPORT_WORKERS) {
    throw new Error("Another route import is already in progress.")
  }
  activeImportWorkers += 1
  let worker: RouteImportWorker
  try {
    worker = createWorker()
  } catch (caught) {
    activeImportWorkers -= 1
    throw caught
  }
  const releaseWorkerMetric = trackRuntimeResource("worker")
  const requestId = createRequestId()
  const generation = createGeneration()
  const request: ImportWorkerRequest = {
    version: ROUTE_IMPORT_WORKER_VERSION,
    kind: "parse-route",
    requestId,
    generation,
    fileName: file.name,
    byteLength: file.size,
    contents
  }

  return new Promise<PlannedRoute>((resolve, reject) => {
    let settled = false
    const onAbort = () => {
      if (settled) return
      try {
        worker.postMessage({
          version: ROUTE_IMPORT_WORKER_VERSION,
          kind: "cancel",
          requestId,
          generation,
          cancelRequestId: requestId
        }, [])
      } catch {
        // Terminating the worker below is the authoritative cancellation path.
      }
      finish()
      reject(abortError())
    }
    const finish = () => {
      if (settled) return
      settled = true
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      signal?.removeEventListener("abort", onAbort)
      worker.onmessage = null
      worker.onerror = null
      if (worker.onmessageerror) worker.onmessageerror = null
      releaseWorkerMetric()
      activeImportWorkers -= 1
      worker.terminate()
    }
    const onTimeout = () => {
      if (settled) return
      finish()
      reject(new Error("The route import timed out."))
    }
    const timeoutId = setTimeout(onTimeout, ROUTE_IMPORT_DEADLINE_MS)
    worker.onerror = () => {
      if (settled) return
      finish()
      reject(new Error("The route import worker stopped unexpectedly."))
    }
    if (worker.onmessageerror !== undefined) {
      worker.onmessageerror = () => {
        if (settled) return
        finish()
        reject(new Error("The route import worker returned an unreadable response."))
      }
    }
    worker.onmessage = ({ data }) => {
      const metadata = typeof data === "object" && data !== null
        ? data as { requestId?: unknown; generation?: unknown }
        : null
      if (
        metadata &&
        ((metadata.requestId !== undefined && metadata.requestId !== requestId) ||
          (metadata.generation !== undefined && metadata.generation !== generation))
      ) return
      if (!metadata || metadata.requestId !== requestId || metadata.generation !== generation) {
        finish()
        reject(new Error("The route import worker returned an invalid response."))
        return
      }
      const result = parseImportWorkerResult(data)
      if (!result) {
        finish()
        reject(new Error("The route import worker returned an invalid response."))
        return
      }
      finish()
      if (result.kind === "import-error") {
        reject(new Error(result.message))
        return
      }
      resolve(result.route)
    }
    signal?.addEventListener("abort", onAbort, { once: true })
    if (signal?.aborted) {
      onAbort()
      return
    }
    try {
      worker.postMessage(request, [contents])
    } catch (caught) {
      if (settled) return
      finish()
      reject(caught instanceof Error ? caught : new Error("The route import worker could not start."))
    }
  })
}
