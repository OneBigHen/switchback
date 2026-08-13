import type { Coordinate } from "@/lib/routing/types"
import {
  buildOfflineRoutingWorkerFailure,
  OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
  type OfflineRoutingWorkerRequest,
  type OfflineRoutingWorkerResult
} from "./worker-protocol"
import type { OfflineBounds, OfflineGraphTileV2 } from "./v2-contracts"
import { ByteLru, type ByteLruStats } from "./byte-lru"
import type { OfflineGraphTileSource } from "./geo-tile-source"
import {
  type OfflineRouteFailureV2,
  type OfflineRouteRequestV2,
  type OfflineRouteSuccessV2
} from "./v2-router"

const DEFAULT_MAX_CACHE_BYTES = 128 * 1024 * 1024
const DEFAULT_MAX_REQUEST_BYTES = 32 * 1024 * 1024
const DEFAULT_MAX_TILES = 256
const TILE_SEARCH_PADDING_METERS = 5_000

export interface OfflineGeoWorkerLike {
  addEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void): void
  removeEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void): void
  postMessage(message: OfflineRoutingWorkerRequest): void
  terminate(): void
}

export interface OfflineGeoWorkerClientOptions {
  workerFactory?: () => OfflineGeoWorkerLike
  maxCacheBytes?: number
  maxRequestBytes?: number
  maxTiles?: number
}

export interface OfflineGeoWorkerRouteOptions {
  signal?: AbortSignal
}

function createBrowserWorker(): OfflineGeoWorkerLike {
  if (typeof Worker === "undefined") throw new Error("Offline Geo Worker is unavailable in this environment")
  return new Worker(new URL("../../workers/offline-routing.worker.ts", import.meta.url), { type: "module" })
}

function requestId(): string {
  return `offline-route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "number" && Number.isFinite(part))
}

function boundsFor(request: OfflineRouteRequestV2): OfflineBounds {
  const points = [request.start, ...(request.shapingPoints ?? []), request.finish]
  const paddingLat = TILE_SEARCH_PADDING_METERS / 111_320
  const latitude = points.reduce((sum, point) => sum + point[1], 0) / points.length
  const paddingLon = TILE_SEARCH_PADDING_METERS / Math.max(1, 111_320 * Math.cos(latitude * Math.PI / 180))
  return {
    minLon: Math.min(...points.map((point) => point[0])) - paddingLon,
    minLat: Math.min(...points.map((point) => point[1])) - paddingLat,
    maxLon: Math.max(...points.map((point) => point[0])) + paddingLon,
    maxLat: Math.max(...points.map((point) => point[1])) + paddingLat
  }
}

function intersects(a: OfflineBounds, b: OfflineBounds): boolean {
  return a.minLon <= b.maxLon && a.maxLon >= b.minLon && a.minLat <= b.maxLat && a.maxLat >= b.minLat
}

function estimateTileBytes(tile: OfflineGraphTileV2): number {
  return new TextEncoder().encode(JSON.stringify(tile)).byteLength
}

function isOfflineRouteSuccess(value: unknown): value is OfflineRouteSuccessV2 {
  if (!value || typeof value !== "object") return false
  const result = value as Record<string, unknown>
  return result.ok === true &&
    Array.isArray(result.edgeIds) && result.edgeIds.every((id) => typeof id === "string") &&
    Array.isArray(result.geometry) && result.geometry.every(isCoordinate) &&
    typeof result.distanceMeters === "number" && Number.isFinite(result.distanceMeters) &&
    typeof result.visitedStates === "number" && Number.isInteger(result.visitedStates) &&
    Array.isArray(result.snappedWaypoints)
}

function failureFromWorker(status: string, message: string): OfflineRouteFailureV2 {
  switch (status) {
    case "missing_region":
      return { ok: false, kind: "missing_region", missingRegionIds: [], message }
    case "out_of_coverage":
      return { ok: false, kind: "out_of_coverage", message }
    case "no_path":
      return { ok: false, kind: "no_path", message }
    case "search_budget":
      return { ok: false, kind: "search_budget", visitedStates: 0, message }
    case "cancelled":
      return { ok: false, kind: "cancelled", message }
    default:
      return { ok: false, kind: "corrupt_data", message }
  }
}

export class OfflineGeoWorkerClient {
  private readonly worker: OfflineGeoWorkerLike
  private readonly source: OfflineGraphTileSource
  private readonly cache: ByteLru<OfflineGraphTileV2>
  private readonly maxRequestBytes: number
  private readonly maxTiles: number
  private readonly pending = new Map<string, {
    resolve: (result: OfflineRoutingWorkerResult) => void
    reject: (error: Error) => void
  }>()
  private disposed = false

  private readonly onMessage = (event: MessageEvent | ErrorEvent): void => {
    if (!("data" in event)) return
    const result = event.data as OfflineRoutingWorkerResult
    if (!result || typeof result.requestId !== "string") return
    const pending = this.pending.get(result.requestId)
    if (!pending) return
    this.pending.delete(result.requestId)
    pending.resolve(result)
  }

  private readonly onError = (event: MessageEvent | ErrorEvent): void => {
    const message = "message" in event && event.message ? event.message : "Offline Geo Worker failed"
    for (const pending of this.pending.values()) pending.reject(new Error(message))
    this.pending.clear()
  }

  constructor(source: OfflineGraphTileSource, options: OfflineGeoWorkerClientOptions = {}) {
    this.source = source
    this.cache = new ByteLru(options.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES)
    this.maxRequestBytes = options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES
    this.maxTiles = options.maxTiles ?? DEFAULT_MAX_TILES
    if (!Number.isSafeInteger(this.maxRequestBytes) || this.maxRequestBytes <= 0) {
      throw new Error("Offline Geo Worker maxRequestBytes must be a positive safe integer")
    }
    if (!Number.isSafeInteger(this.maxTiles) || this.maxTiles <= 0) {
      throw new Error("Offline Geo Worker maxTiles must be a positive safe integer")
    }
    this.worker = options.workerFactory?.() ?? createBrowserWorker()
    this.worker.addEventListener("message", this.onMessage)
    this.worker.addEventListener("error", this.onError)
  }

  getCacheStats(): ByteLruStats {
    return this.cache.stats()
  }

  async route(
    request: OfflineRouteRequestV2,
    options: OfflineGeoWorkerRouteOptions = {}
  ): Promise<OfflineRouteSuccessV2 | OfflineRouteFailureV2> {
    if (this.disposed) throw new Error("Offline Geo Worker client is disposed")
    if (!isCoordinate(request.start) || !isCoordinate(request.finish)) {
      return { ok: false, kind: "corrupt_data", message: "Offline route coordinates are invalid" }
    }
    if (options.signal?.aborted) return { ok: false, kind: "cancelled", message: "Offline route was cancelled" }

    const requiredRegionIds = [...new Set(request.requiredRegionIds)]
    const installedRegionIds = new Set(request.installedRegionIds)
    const missingRegionIds = requiredRegionIds.filter((regionId) => !installedRegionIds.has(regionId))
    if (missingRegionIds.length > 0) {
      return {
        ok: false,
        kind: "missing_region",
        missingRegionIds,
        message: `Install offline data for ${missingRegionIds.join(", ")}`
      }
    }

    const bounds = boundsFor(request)
    const referencesByRegion = await Promise.all(requiredRegionIds.map((regionId) =>
      this.source.listActiveTileReferences(regionId, bounds)))
    if (referencesByRegion.some((references) => references.length > this.maxTiles)) {
      return { ok: false, kind: "search_budget", visitedStates: 0, message: `Offline tile window exceeds ${this.maxTiles} tiles` }
    }
    const references = [...new Map(
      referencesByRegion.flat()
        .filter((reference) => intersects(reference.bounds, bounds))
        .map((reference) => [`${reference.regionId}:${reference.version}:${reference.tileId}`, reference] as const)
    ).values()]
    if (references.length > this.maxTiles) {
      return { ok: false, kind: "search_budget", visitedStates: 0, message: `Offline tile window exceeds ${this.maxTiles} tiles` }
    }

    let requestBytes = 0
    const tiles: OfflineGraphTileV2[] = []
    for (const reference of references) {
      if (options.signal?.aborted) return { ok: false, kind: "cancelled", message: "Offline route was cancelled" }
      requestBytes += reference.bytes
      if (requestBytes > this.maxRequestBytes) {
        return { ok: false, kind: "search_budget", visitedStates: 0, message: `Offline tile request exceeds ${this.maxRequestBytes} bytes` }
      }
      const key = `${reference.regionId}:${reference.version}:${reference.tileId}`
      let tile = this.cache.get(key)
      if (!tile) {
        tile = await this.source.loadActiveTile(reference.regionId, reference.tileId)
        if (!tile) return { ok: false, kind: "corrupt_data", message: `Offline tile ${reference.tileId} is missing` }
        this.cache.set(key, tile, Math.max(reference.bytes, estimateTileBytes(tile)))
      }
      tiles.push(tile)
    }

    const id = requestId()
    const workerRequest: OfflineRoutingWorkerRequest = {
      version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
      requestId: id,
      kind: "route_v2",
      tiles,
      routeRequest: request
    }
    const resultPromise = new Promise<OfflineRoutingWorkerResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage(workerRequest)
    })
    const cancel = () => {
      const pending = this.pending.get(id)
      if (pending) {
        this.pending.delete(id)
        pending.resolve(buildOfflineRoutingWorkerFailure(
          { requestId: id, kind: "route_v2" },
          "cancelled",
          "Offline route was cancelled"
        ))
      }
      this.worker.postMessage({
        version: OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION,
        requestId: `${id}-cancel`,
        kind: "cancel",
        cancelRequestId: id
      })
    }
    options.signal?.addEventListener("abort", cancel, { once: true })
    try {
      const workerResult = await resultPromise
      if (workerResult.status === "ok") {
        return isOfflineRouteSuccess(workerResult.result)
          ? workerResult.result
          : { ok: false, kind: "corrupt_data", message: "Offline Geo Worker returned an invalid route" }
      }
      return failureFromWorker(workerResult.status, workerResult.message ?? "Offline route failed")
    } catch (error) {
      return { ok: false, kind: "corrupt_data", message: error instanceof Error ? error.message : "Offline Geo Worker failed" }
    } finally {
      options.signal?.removeEventListener("abort", cancel)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.worker.removeEventListener("message", this.onMessage)
    this.worker.removeEventListener("error", this.onError)
    this.worker.terminate()
    this.cache.clear()
    for (const pending of this.pending.values()) pending.reject(new Error("Offline Geo Worker client disposed"))
    this.pending.clear()
  }
}
export function createOfflineGeoWorkerClient(source: OfflineGraphTileSource, options?: OfflineGeoWorkerClientOptions): OfflineGeoWorkerClient {
  return new OfflineGeoWorkerClient(source, options)
}
