import type { RuntimeDiagnostics } from "@/lib/domain/diagnostics"

export type RuntimeResourceKind = "timer" | "gps-watch" | "worker"

interface MapRuntimeMetrics {
  sourceCount: number
  layerCount: number
}

interface RouteRuntimeMetrics {
  entityCount: number
  geometryBytesEstimate: number
}

interface GeoWorkerRuntimeMetrics {
  loadedTiles: number
  bytes: number
}

interface PerformanceMemory {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

const resources: Record<RuntimeResourceKind, Set<symbol>> = {
  timer: new Set(),
  "gps-watch": new Set(),
  worker: new Set()
}

let mapProbe: (() => MapRuntimeMetrics) | null = null
let routeMetrics: RouteRuntimeMetrics | null = null
let geoWorkerMetrics: GeoWorkerRuntimeMetrics | null = null

function measuredCount(value: number | null | undefined): number | null {
  return value != null && Number.isInteger(value) && value >= 0 ? value : null
}

function measuredBytes(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value >= 0 ? value : null
}

/** Track one owned resource and release it exactly once during cleanup. */
export function trackRuntimeResource(kind: RuntimeResourceKind): () => void {
  const token = Symbol(kind)
  const active = resources[kind]
  active.add(token)
  return () => active.delete(token)
}

/** Register the live MapLibre counters without retaining the map itself here. */
export function setMapRuntimeProbe(probe: (() => MapRuntimeMetrics) | null): () => void {
  mapProbe = probe
  return () => {
    if (mapProbe === probe) mapProbe = null
  }
}

export function setRouteRuntimeMetrics(metrics: RouteRuntimeMetrics | null): void {
  routeMetrics = metrics
}

export function setGeoWorkerRuntimeMetrics(metrics: GeoWorkerRuntimeMetrics | null): void {
  geoWorkerMetrics = metrics
}

function readMapMetrics(): Pick<RuntimeDiagnostics, "mapSourceCount" | "mapLayerCount"> {
  if (!mapProbe) return { mapSourceCount: null, mapLayerCount: null }
  try {
    const metrics = mapProbe()
    return {
      mapSourceCount: measuredCount(metrics.sourceCount),
      mapLayerCount: measuredCount(metrics.layerCount)
    }
  } catch {
    return { mapSourceCount: null, mapLayerCount: null }
  }
}

/** Read values owned by Switchback; browser APIs are added by the async collector. */
export function readTrackedRuntimeDiagnostics(): RuntimeDiagnostics {
  const map = readMapMetrics()
  return {
    jsHeapUsedBytes: null,
    jsHeapTotalBytes: null,
    jsHeapLimitBytes: null,
    storageUsageBytes: null,
    storageQuotaBytes: null,
    cacheCount: null,
    cacheEntryCount: null,
    serviceWorkerCount: null,
    timerCount: resources.timer.size,
    gpsWatchCount: resources["gps-watch"].size,
    workerCount: resources.worker.size,
    routeEntityCount: measuredCount(routeMetrics?.entityCount),
    routeGeometryBytesEstimate: measuredBytes(routeMetrics?.geometryBytesEstimate),
    ...map,
    geoWorkerLoadedTiles: measuredCount(geoWorkerMetrics?.loadedTiles),
    geoWorkerBytes: measuredBytes(geoWorkerMetrics?.bytes)
  }
}

async function browserStorageMetrics(): Promise<Pick<RuntimeDiagnostics, "storageUsageBytes" | "storageQuotaBytes">> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { storageUsageBytes: null, storageQuotaBytes: null }
  }
  try {
    const estimate = await navigator.storage.estimate()
    return {
      storageUsageBytes: measuredBytes(estimate.usage),
      storageQuotaBytes: measuredBytes(estimate.quota)
    }
  } catch {
    return { storageUsageBytes: null, storageQuotaBytes: null }
  }
}

async function browserCacheMetrics(): Promise<Pick<RuntimeDiagnostics, "cacheCount" | "cacheEntryCount">> {
  if (typeof caches === "undefined") return { cacheCount: null, cacheEntryCount: null }
  try {
    const names = await caches.keys()
    const entries = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()))
    return {
      cacheCount: names.length,
      cacheEntryCount: entries.reduce((total, cacheEntries) => total + cacheEntries.length, 0)
    }
  } catch {
    return { cacheCount: null, cacheEntryCount: null }
  }
}

async function browserServiceWorkerCount(): Promise<number | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null
  try {
    return (await navigator.serviceWorker.getRegistrations()).length
  } catch {
    return null
  }
}

/** Collect browser measurements and merge them with the owned-resource registry. */
export async function collectRuntimeDiagnostics(): Promise<RuntimeDiagnostics> {
  const memory = typeof performance !== "undefined"
    ? (performance as Performance & { memory?: PerformanceMemory }).memory
    : undefined
  const [storage, cache, serviceWorkerCount] = await Promise.all([
    browserStorageMetrics(),
    browserCacheMetrics(),
    browserServiceWorkerCount()
  ])
  return {
    ...readTrackedRuntimeDiagnostics(),
    jsHeapUsedBytes: measuredBytes(memory?.usedJSHeapSize),
    jsHeapTotalBytes: measuredBytes(memory?.totalJSHeapSize),
    jsHeapLimitBytes: measuredBytes(memory?.jsHeapSizeLimit),
    ...storage,
    ...cache,
    serviceWorkerCount
  }
}
