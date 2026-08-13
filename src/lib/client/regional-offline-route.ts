import type { OfflineGeoWorkerLike } from "@/lib/offline/geo-worker-client"
import { OfflineGeoWorkerClient } from "@/lib/offline/geo-worker-client"
import { suggestRegionsForRoute } from "@/lib/offline/region-catalog"
import type { OfflineRouteFailureV2, OfflineRouteSuccessV2 } from "@/lib/offline/v2-router"
import type { PlannedRoute, Waypoint } from "@/lib/routing/types"
import { RegionDownloadClient } from "@/lib/storage/region-download-client"
import { offlineInstruction } from "./offline-route-recovery"

const MILES_PER_METER = 1 / 1_609.344

export interface RegionalOfflineRouteOptions {
  signal?: AbortSignal
  workerFactory?: () => OfflineGeoWorkerLike
}

export function selectRegionalOfflineRegionIds(points: Waypoint[], installedRegionIds: readonly string[]): {
  requiredRegionIds: string[]
  missingRegionIds: string[]
} {
  const requiredRegionIds = suggestRegionsForRoute(points.map((point) => [point.lon, point.lat]))
    .map((region) => region.id)
  const installed = new Set(installedRegionIds)
  return {
    requiredRegionIds,
    missingRegionIds: requiredRegionIds.filter((regionId) => !installed.has(regionId))
  }
}

function bikeCompatibility(route: PlannedRoute): "street" | "adventure" | "dual-sport" {
  if (route.profile === "gravel" || route.profile === "adventure") return "adventure"
  return "street"
}

function failureMessage(result: OfflineRouteFailureV2): string {
  return result.message
}

function buildRecoveredRoute(route: PlannedRoute, points: Waypoint[], result: OfflineRouteSuccessV2): PlannedRoute {
  const distanceMiles = result.distanceMeters * MILES_PER_METER
  const durationMinutes = route.distanceMiles > 0
    ? Math.max(1, route.durationMinutes * distanceMiles / route.distanceMiles)
    : Math.max(1, distanceMiles * 2)
  return {
    ...structuredClone(route),
    id: `${route.id}-regional-offline-recovery`,
    name: `${route.name} · Regional offline recovery`,
    geometry: result.geometry,
    waypoints: points.map((point) => ({ ...point })),
    instructions: [offlineInstruction(result.geometry)],
    distanceMiles: Number(distanceMiles.toFixed(2)),
    durationMinutes: Number(durationMinutes.toFixed(1)),
    routingSource: "imported",
    provider: undefined,
    providerVersion: undefined,
    previewOnly: false
  }
}

/**
 * Attempt local rerouting from installed region packs. This is deliberately
 * separate from saved-corridor recovery so the caller can fall back without
 * deleting or rewriting either store.
 */
export async function recoverRouteFromInstalledRegions(
  route: PlannedRoute,
  points: Waypoint[],
  options: RegionalOfflineRouteOptions = {}
): Promise<{ route: PlannedRoute | null; error: string | null }> {
  const regionClient = new RegionDownloadClient()
  let worker: OfflineGeoWorkerClient | null = null
  try {
    if (points.length < 2) return { route: null, error: "Regional offline recovery needs a start and finish." }
    const installed = await regionClient.list()
    const selection = selectRegionalOfflineRegionIds(points, installed.map((entry) => entry.id))
    if (selection.requiredRegionIds.length === 0) {
      return { route: null, error: "The current route is outside the published offline region catalog." }
    }
    if (selection.missingRegionIds.length > 0) {
      return { route: null, error: `Install offline data for ${selection.missingRegionIds.join(", ")}.` }
    }
    worker = new OfflineGeoWorkerClient(regionClient, { workerFactory: options.workerFactory })
    const result = await worker.route({
      start: [points[0]!.lon, points[0]!.lat],
      shapingPoints: points.slice(1, -1).map((point) => [point.lon, point.lat]),
      finish: [points.at(-1)!.lon, points.at(-1)!.lat],
      profile: route.profile,
      bikeCompatibility: bikeCompatibility(route),
      avoidHighways: route.avoidHighways,
      requiredRegionIds: selection.requiredRegionIds,
      installedRegionIds: installed.map((entry) => entry.id),
      maxSnapMeters: 800,
      maxVisitedStates: 200_000
    }, { signal: options.signal })
    if (!result.ok) return { route: null, error: failureMessage(result) }
    if (result.geometry.length < 2) return { route: null, error: "Regional offline routing returned no usable geometry." }
    return { route: buildRecoveredRoute(route, points, result), error: null }
  } catch (caught) {
    return { route: null, error: caught instanceof Error ? caught.message : "Regional offline recovery failed." }
  } finally {
    worker?.dispose()
    regionClient.close()
  }
}
