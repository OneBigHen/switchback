import { DOMParser } from "linkedom/worker"
import { parseRouteFile, type RouteXmlParser } from "@/lib/routing/gpx-import"
import {
  ROUTE_IMPORT_WORKER_VERSION,
  type ImportWorkerRequest,
  type ImportWorkerResult
} from "@/lib/routing/import-worker-protocol"

interface RouteImportWorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<ImportWorkerRequest>) => void): void
  postMessage(message: ImportWorkerResult): void
}

const workerScope = self as unknown as RouteImportWorkerScope
const parseWorkerXml: RouteXmlParser = (xml) => new DOMParser().parseFromString(xml, "text/xml") as unknown as Document

workerScope.addEventListener("message", (event: MessageEvent<ImportWorkerRequest>) => {
  const request = event.data
  if (request.version !== ROUTE_IMPORT_WORKER_VERSION || request.kind !== "parse-route") return

  void parseRouteFile({
    name: request.fileName,
    size: request.byteLength,
    arrayBuffer: async () => request.contents,
    text: async () => new TextDecoder().decode(request.contents)
  }, { parseXml: parseWorkerXml }).then((route) => {
    const result: ImportWorkerResult = {
      version: ROUTE_IMPORT_WORKER_VERSION,
      kind: "parsed-route",
      requestId: request.requestId,
      route
    }
    workerScope.postMessage(result)
  }).catch((caught) => {
    const result: ImportWorkerResult = {
      version: ROUTE_IMPORT_WORKER_VERSION,
      kind: "import-error",
      requestId: request.requestId,
      message: caught instanceof Error ? caught.message : "The route file could not be imported."
    }
    workerScope.postMessage(result)
  })
})
