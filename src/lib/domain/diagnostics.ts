import type { OfflineReadiness } from "@/lib/offline/readiness"

/**
 * Diagnostics aggregation (SB-028): one honest snapshot of app, provider,
 * storage, and offline health for the rider — no fake "all good" claims.
 */

export interface StorageDiagnostics {
  persistentStorageGranted: boolean
  estimatedUsageBytes: number | null
  quotaBytes: number | null
  regionCount: number
  routeCount: number
  tripCount: number
  preferenceCount: number
}

export interface ProviderDiagnostics {
  graphHopper: "healthy" | "degraded" | "unreachable" | "not-configured"
  valhalla: "healthy" | "degraded" | "unreachable" | "not-configured"
  photon: "healthy" | "degraded" | "unreachable" | "not-configured"
  checkedAt: string
}

export interface RuntimeDiagnostics {
  jsHeapUsedBytes: number | null
  jsHeapTotalBytes: number | null
  jsHeapLimitBytes: number | null
  storageUsageBytes: number | null
  storageQuotaBytes: number | null
  cacheCount: number | null
  cacheEntryCount: number | null
  serviceWorkerCount: number | null
  timerCount: number
  gpsWatchCount: number
  workerCount: number
  routeEntityCount: number | null
  routeGeometryBytesEstimate: number | null
  mapSourceCount: number | null
  mapLayerCount: number | null
  geoWorkerLoadedTiles: number | null
  geoWorkerBytes: number | null
}

export interface ServerRuntimeDiagnostics {
  rssBytes: number | null
  heapUsedBytes: number | null
  heapTotalBytes: number | null
  externalBytes: number | null
  arrayBuffersBytes: number | null
  routeRunningJobs: number | null
  routeQueuedJobs: number | null
  routeCacheEntries: number | null
}

export interface DiagnosticsSnapshot {
  appVersion: string
  buildId: string
  readiness: OfflineReadiness
  storage: StorageDiagnostics
  providers: ProviderDiagnostics
  runtime: RuntimeDiagnostics
  server: ServerRuntimeDiagnostics
  warnings: string[]
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return "not measurable"
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function summarizeStorage(storage: StorageDiagnostics): string {
  const usageMb = storage.estimatedUsageBytes == null
    ? null
    : (storage.estimatedUsageBytes / (1024 * 1024)).toFixed(1)
  if (usageMb == null) return "Storage usage is not measurable in this browser."
  const quotaMb = storage.quotaBytes == null
    ? null
    : (storage.quotaBytes / (1024 * 1024)).toFixed(0)
  const persistence = storage.persistentStorageGranted
    ? "persistent storage granted"
    : "storage is not persistent — the browser may evict offline data"
  return `Using ${usageMb} MB${quotaMb ? ` of ~${quotaMb} MB quota` : ""}; ${persistence}.`
}

export function providerLabel(status: ProviderDiagnostics[keyof Omit<ProviderDiagnostics, "checkedAt">]): string {
  switch (status) {
    case "healthy": return "healthy"
    case "degraded": return "degraded"
    case "unreachable": return "unreachable"
    default: return "not configured"
  }
}
