import { MAX_GPX_IMPORT_BYTES } from "@/lib/routing/gpx-import"
import {
  ROUTE_IMPORT_WORKER_VERSION,
  type ImportWorkerRequest,
  type ImportWorkerResult
} from "@/lib/routing/import-worker-protocol"
import type { PlannedRoute } from "@/lib/routing/types"

export interface RouteImportWorker {
  onmessage: ((event: MessageEvent<ImportWorkerResult>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
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

export async function parseRouteFileInWorker(
  file: File,
  createWorker: RouteImportWorkerFactory = createRouteImportWorker
): Promise<PlannedRoute> {
  if (file.size > MAX_GPX_IMPORT_BYTES) {
    throw new Error("Route imports must be 5 MB or smaller.")
  }

  const worker = createWorker()
  const requestId = createRequestId()
  const contents = await file.arrayBuffer()

  return new Promise<PlannedRoute>((resolve, reject) => {
    const finish = () => worker.terminate()
    worker.onerror = () => {
      finish()
      reject(new Error("The route import worker stopped unexpectedly."))
    }
    worker.onmessage = ({ data }) => {
      if (data.version !== ROUTE_IMPORT_WORKER_VERSION || data.requestId !== requestId) return
      finish()
      if (data.kind === "import-error") {
        reject(new Error(data.message))
        return
      }
      resolve(data.route)
    }
    const request: ImportWorkerRequest = {
      version: ROUTE_IMPORT_WORKER_VERSION,
      kind: "parse-route",
      requestId,
      fileName: file.name,
      byteLength: file.size,
      contents
    }
    worker.postMessage(request, [contents])
  })
}
