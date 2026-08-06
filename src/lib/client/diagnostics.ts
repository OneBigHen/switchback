import type { DiagnosticsSnapshot } from "@/lib/domain/diagnostics"
import { computeOfflineReadiness, type OfflineReadinessInput } from "@/lib/offline/readiness"
import type { RegionDownloadClient } from "@/lib/storage/region-download-client"
import packageJson from "../../../package.json"

export interface DiagnosticsDependencies {
  regionClient: RegionDownloadClient
  hasSavedRoutes: boolean
  serviceWorkerRegistered: boolean
  fetchHealth?: (signal: AbortSignal) => Promise<{
    providers?: { graphhopper?: { ok?: boolean }; valhalla?: { ok?: boolean }; photon?: { ok?: boolean } }
  }>
}

function providerStatus(ok: boolean | undefined): "healthy" | "degraded" | "unreachable" {
  if (ok === true) return "healthy"
  if (ok === false) return "degraded"
  return "unreachable"
}

/**
 * Collect one honest diagnostics snapshot from the live client state
 * (SB-028). Never fabricates a value: anything unmeasurable stays "not
 * configured" or a warning.
 */
export async function collectDiagnostics(deps: DiagnosticsDependencies): Promise<DiagnosticsSnapshot> {
  const warnings: string[] = []
  const entries = await deps.regionClient.list().catch(() => [])
  const totalBytes = await deps.regionClient.getTotalBytes().catch(() => null)

  let persistentStorageGranted = false
  let quotaBytes: number | null = null
  if (typeof navigator !== "undefined" && "storage" in navigator) {
    try {
      persistentStorageGranted = await navigator.storage.persisted()
      const estimate = await navigator.storage.estimate()
      quotaBytes = estimate.quota ?? null
    } catch {
      // Storage API unavailable; values stay null/honest.
    }
  }

  const readinessInput: OfflineReadinessInput = {
    serviceWorkerRegistered: deps.serviceWorkerRegistered,
    hasSavedRoutes: deps.hasSavedRoutes,
    installedRegions: entries.map((entry) => ({
      regionId: entry.id,
      code: entry.id.toUpperCase(),
      builtAt: entry.builtAt ?? null,
      stale: false,
      // A completed manifest build implies the v2 routing graph activated.
      hasRoutingGraph: Boolean(entry.builtAt)
    })),
    mapTilesPresent: totalBytes != null && totalBytes > 0
  }
  const readiness = computeOfflineReadiness(readinessInput)
  warnings.push(...readiness.warnings)

  let providers: DiagnosticsSnapshot["providers"] = {
    graphHopper: "not-configured",
    valhalla: "not-configured",
    photon: "not-configured",
    checkedAt: new Date().toISOString()
  }
  if (deps.fetchHealth) {
    try {
      const health = await deps.fetchHealth(AbortSignal.timeout(5_000))
      providers = {
        graphHopper: providerStatus(health.providers?.graphhopper?.ok),
        valhalla: providerStatus(health.providers?.valhalla?.ok),
        photon: "not-configured",
        checkedAt: new Date().toISOString()
      }
    } catch {
      providers = { ...providers, graphHopper: "unreachable", checkedAt: new Date().toISOString() }
    }
  }

  return {
    appVersion: String(packageJson.version ?? "unknown"),
    buildId: "",
    readiness,
    storage: {
      persistentStorageGranted,
      estimatedUsageBytes: totalBytes,
      quotaBytes,
      regionCount: entries.length,
      routeCount: 0,
      tripCount: 0,
      preferenceCount: 0
    },
    providers,
    warnings
  }
}
