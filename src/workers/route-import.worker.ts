import { DOMParser } from "linkedom/worker"
import { parseRouteFile, type RouteXmlParser } from "@/lib/routing/gpx-import"
import {
  ROUTE_IMPORT_WORKER_VERSION,
  parseImportWorkerRequest,
  type ImportWorkerRequest,
  type ImportWorkerResult
} from "@/lib/routing/import-worker-protocol"

interface RouteImportWorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<ImportWorkerRequest>) => void): void
  postMessage(message: ImportWorkerResult): void
}

const workerScope = self as unknown as RouteImportWorkerScope
const parseWorkerXml: RouteXmlParser = (xml) => new DOMParser().parseFromString(xml, "text/xml") as unknown as Document
const activeRequests = new Map<string, boolean>()
const MAX_ACTIVE_IMPORTS = 1

workerScope.addEventListener("message", (event: MessageEvent<ImportWorkerRequest>) => {
  const request = parseImportWorkerRequest(event.data)
  if (!request) return
  if (request.kind === "cancel") {
    if (activeRequests.has(request.cancelRequestId)) activeRequests.set(request.cancelRequestId, true)
    return
  }
  if (activeRequests.size >= MAX_ACTIVE_IMPORTS) {
    workerScope.postMessage({
      version: ROUTE_IMPORT_WORKER_VERSION,
      kind: "import-error",
      requestId: request.requestId,
      generation: request.generation,
      message: "The route import worker is already processing a file."
    })
    return
  }

  activeRequests.set(request.requestId, false)

  void parseRouteFile({
    name: request.fileName,
    size: request.byteLength,
    arrayBuffer: async () => request.contents,
    text: async () => new TextDecoder().decode(request.contents)
  }, { parseXml: parseWorkerXml }).then((route) => {
    const cancelled = activeRequests.get(request.requestId) === true
    activeRequests.delete(request.requestId)
    if (cancelled) return
    const result: ImportWorkerResult = {
      version: ROUTE_IMPORT_WORKER_VERSION,
      kind: "parsed-route",
      requestId: request.requestId,
      generation: request.generation,
      route
    }
    workerScope.postMessage(result)
  }).catch((caught) => {
    const cancelled = activeRequests.get(request.requestId) === true
    activeRequests.delete(request.requestId)
    if (cancelled) return
    const result: ImportWorkerResult = {
      version: ROUTE_IMPORT_WORKER_VERSION,
      kind: "import-error",
      requestId: request.requestId,
      generation: request.generation,
      message: caught instanceof Error ? caught.message : "The route file could not be imported."
    }
    workerScope.postMessage(result)
  })
})
