import type { PlannedRoute } from "./types"

export const ROUTE_IMPORT_WORKER_VERSION = 1 as const

export interface ImportWorkerRequest {
  version: typeof ROUTE_IMPORT_WORKER_VERSION
  kind: "parse-route"
  requestId: string
  fileName: string
  byteLength: number
  contents: ArrayBuffer
}

export interface ImportWorkerSuccess {
  version: typeof ROUTE_IMPORT_WORKER_VERSION
  kind: "parsed-route"
  requestId: string
  route: PlannedRoute
}

export interface ImportWorkerFailure {
  version: typeof ROUTE_IMPORT_WORKER_VERSION
  kind: "import-error"
  requestId: string
  message: string
}

export type ImportWorkerResult = ImportWorkerSuccess | ImportWorkerFailure
