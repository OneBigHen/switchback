import type { PlannedRoute } from "./types"
import { isIntrinsicFeatureProvenanceMap } from "@/lib/roads/intrinsic-features"

export const ROUTE_IMPORT_WORKER_VERSION = 1 as const

interface ImportWorkerRequestBase {
  version: typeof ROUTE_IMPORT_WORKER_VERSION
  kind: "parse-route"
  requestId: string
  generation: number
}

export interface ImportWorkerParseRequest extends ImportWorkerRequestBase {
  fileName: string
  byteLength: number
  contents: ArrayBuffer
}

export interface ImportWorkerCancelRequest {
  version: typeof ROUTE_IMPORT_WORKER_VERSION
  kind: "cancel"
  requestId: string
  generation: number
  cancelRequestId: string
}

export type ImportWorkerRequest = ImportWorkerParseRequest | ImportWorkerCancelRequest

export interface ImportWorkerSuccess {
  version: typeof ROUTE_IMPORT_WORKER_VERSION
  kind: "parsed-route"
  requestId: string
  generation: number
  route: PlannedRoute
}

export interface ImportWorkerFailure {
  version: typeof ROUTE_IMPORT_WORKER_VERSION
  kind: "import-error"
  requestId: string
  generation: number
  message: string
}

export type ImportWorkerResult = ImportWorkerSuccess | ImportWorkerFailure

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

/** Validate untrusted messages before a worker reads their payload. */
export function parseImportWorkerRequest(raw: unknown): ImportWorkerRequest | null {
  if (!isRecord(raw) || raw.version !== ROUTE_IMPORT_WORKER_VERSION) return null
  if (typeof raw.requestId !== "string" || raw.requestId.length === 0) return null
  if (!isGeneration(raw.generation)) return null

  if (raw.kind === "cancel") {
    return typeof raw.cancelRequestId === "string" && raw.cancelRequestId.length > 0
      ? {
          version: ROUTE_IMPORT_WORKER_VERSION,
          kind: "cancel",
          requestId: raw.requestId,
          generation: raw.generation,
          cancelRequestId: raw.cancelRequestId
        }
      : null
  }

  const byteLength = raw.byteLength
  const contents = raw.contents
  if (
    raw.kind !== "parse-route" ||
    typeof raw.fileName !== "string" ||
    raw.fileName.length === 0 ||
    typeof byteLength !== "number" ||
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    !(contents instanceof ArrayBuffer) ||
    byteLength !== contents.byteLength
  ) return null

  return {
    version: ROUTE_IMPORT_WORKER_VERSION,
    kind: "parse-route",
    requestId: raw.requestId,
    generation: raw.generation,
    fileName: raw.fileName,
    byteLength,
    contents
  }
}

/** Validate worker responses before they cross back into the UI. */
export function parseImportWorkerResult(raw: unknown): ImportWorkerResult | null {
  if (!isRecord(raw) || raw.version !== ROUTE_IMPORT_WORKER_VERSION) return null
  if (typeof raw.requestId !== "string" || raw.requestId.length === 0) return null
  if (!isGeneration(raw.generation)) return null
  if (raw.kind === "import-error") {
    return typeof raw.message === "string"
      ? {
          version: ROUTE_IMPORT_WORKER_VERSION,
          kind: "import-error",
          requestId: raw.requestId,
          generation: raw.generation,
          message: raw.message
        }
      : null
  }
  return raw.kind === "parsed-route" && isImportedRoute(raw.route)
    ? {
        version: ROUTE_IMPORT_WORKER_VERSION,
        kind: "parsed-route",
        requestId: raw.requestId,
        generation: raw.generation,
        route: raw.route as PlannedRoute
      }
    : null
}

function isImportedRoute(value: unknown): value is PlannedRoute {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.name !== "string" ||
    !["quick", "balanced", "twisty", "scenic", "adventure", "gravel", "avoid-highways", "neural"].includes(value.profile as string) ||
    !Array.isArray(value.waypoints) ||
    !Array.isArray(value.instructions) ||
    !Number.isFinite(value.distanceMiles) ||
    !Number.isFinite(value.durationMinutes) ||
    !(value.ascentMeters === null || Number.isFinite(value.ascentMeters)) ||
    !(value.descentMeters === null || Number.isFinite(value.descentMeters)) ||
    !Number.isFinite(value.twistiness) ||
    !Number.isFinite(value.turnCount) ||
    !isNumberRecord(value.roadMix) ||
    !isNumberRecord(value.surfaceMix) ||
    (value.featureProvenance !== undefined && !isIntrinsicFeatureProvenanceMap(value.featureProvenance)) ||
    value.routingSource !== "imported" ||
    value.previewOnly !== false
  ) return false
  if (!Array.isArray(value.geometry) || value.geometry.length < 2) return false
  return value.geometry.every((coordinate) =>
    Array.isArray(coordinate) &&
    coordinate.length === 2 &&
    coordinate.every((value) => typeof value === "number" && Number.isFinite(value))
  )
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "number" && Number.isFinite(entry))
}
