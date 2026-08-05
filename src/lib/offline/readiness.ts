/**
 * Offline readiness model (SB-020).
 *
 * The UI states the achieved offline level honestly:
 * - Level 1 — shell: the app reloads offline and local routes/rides are
 *   visible; provider failures stay honest.
 * - Level 2 — prepared route: the saved route's corridor data is available.
 * - Level 3 — offline routing: an installed regional graph supports reroute
 *   and recovery without a live router.
 */

export type ReadinessLevel = "ready" | "partial" | "not-ready"

export interface RegionReadiness {
  regionId: string
  code: string
  status: ReadinessLevel
  builtAt: string | null
  stale: boolean
}

export interface OfflineReadinessInput {
  /** Service worker registered → the shell can reload offline. */
  serviceWorkerRegistered: boolean
  /** A route is saved in the local library. */
  hasSavedRoutes: boolean
  installedRegions: Array<{
    regionId: string
    code: string
    builtAt: string | null
    stale: boolean
    /** The region carries a v2 routing graph (not just map tiles). */
    hasRoutingGraph: boolean
  }>
  mapTilesPresent: boolean
}

export interface OfflineReadiness {
  shell: ReadinessLevel
  route: ReadinessLevel
  routing: ReadinessLevel
  regions: RegionReadiness[]
  mapTiles: ReadinessLevel
  warnings: string[]
}

export function computeOfflineReadiness(input: OfflineReadinessInput): OfflineReadiness {
  const warnings: string[] = []

  const shell: ReadinessLevel = input.serviceWorkerRegistered ? "ready" : "not-ready"

  const routingRegions = input.installedRegions.filter((region) => region.hasRoutingGraph)
  const routing: ReadinessLevel = routingRegions.length > 0
    ? "ready"
    : input.installedRegions.length > 0 ? "partial" : "not-ready"

  const route: ReadinessLevel = !input.hasSavedRoutes
    ? "not-ready"
    : routingRegions.length > 0 || input.mapTilesPresent ? "ready" : "partial"

  const mapTiles: ReadinessLevel = input.mapTilesPresent ? "ready" : "partial"

  const regions: RegionReadiness[] = input.installedRegions.map((region) => {
    const status: ReadinessLevel = !region.hasRoutingGraph
      ? "partial"
      : region.stale ? "partial" : "ready"
    if (region.stale && region.hasRoutingGraph) {
      warnings.push(`Region ${region.code} is stale; routing still works but data may be old.`)
    }
    if (!region.hasRoutingGraph) {
      warnings.push(`Region ${region.code} has no offline routing graph; rerouting needs a live router.`)
    }
    return {
      regionId: region.regionId,
      code: region.code,
      status,
      builtAt: region.builtAt,
      stale: region.stale
    }
  })

  if (shell !== "ready") {
    warnings.push("Install the app (or allow the service worker) for offline reload.")
  }

  return { shell, route, routing, regions, mapTiles, warnings }
}

/** The strongest level the app can honestly claim right now. */
export function offlineLevelLabel(readiness: OfflineReadiness): string {
  if (readiness.routing === "ready") return "Level 3 — offline routing"
  if (readiness.route === "ready") return "Level 2 — prepared route"
  if (readiness.shell === "ready") return "Level 1 — offline shell"
  return "Not ready for offline"
}
