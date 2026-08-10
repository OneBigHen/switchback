import { buildOfflineGraphAdjacency, validateOfflineGraph, type OfflineGraph } from "@/lib/offline/graph"
import { findOfflinePath } from "@/lib/offline/a-star"
import { getOfflineRoutePackExpiryState, type OfflineRoutePack } from "@/lib/storage/offline-route-pack"
import type { PlannedRoute, RouteInstruction, Waypoint } from "@/lib/routing/types"
import { suggestRegionsForRoute } from "@/lib/offline/region-catalog"
import type { OfflineGraphTileV2 } from "@/lib/offline/v2-contracts"
import type { OfflineRouteRequestV2, OfflineRouteSuccessV2 } from "@/lib/offline/v2-router"
import {
  routeOfflineV2InWorker,
  OfflineRoutingError,
  type OfflineRoutingWorkerFactory
} from "@/lib/client/offline-routing-client"

const MAX_SNAP_METERS = 800

/** Default max-visit bound for regional offline reroute, mirroring the v2 router default. */
const DEFAULT_MAX_VISITED_STATES = 200_000

function coordinateDistanceMeters(first: [number, number], second: [number, number]): number {
  const toRadians = (value: number) => value * Math.PI / 180
  const latitude = toRadians((first[1] + second[1]) / 2)
  const dx = toRadians(second[0] - first[0]) * 6_371_000 * Math.cos(latitude)
  const dy = toRadians(second[1] - first[1]) * 6_371_000
  return Math.hypot(dx, dy)
}

function nearestNode(graph: OfflineGraph, point: Waypoint): number | null {
  const coordinate: [number, number] = [point.lon, point.lat]
  let best: { index: number; distance: number } | null = null
  for (const node of graph.nodes) {
    const distance = coordinateDistanceMeters(coordinate, node.coordinate)
    if (!best || distance < best.distance) best = { index: node.index, distance }
  }
  return best && best.distance <= MAX_SNAP_METERS ? best.index : null
}

function offlineInstruction(geometry: PlannedRoute["geometry"]): RouteInstruction {
  return {
    distanceMeters: geometry.reduce((total, point, index) => {
      const next = geometry[index + 1]
      return next ? total + coordinateDistanceMeters(point, next) : total
    }, 0),
    timeMilliseconds: 0,
    sign: 0,
    text: "Follow the offline corridor",
    streetName: "Offline route",
    interval: [0, Math.max(0, geometry.length - 1)]
  }
}

/**
 * Recover a route from a saved corridor pack without a network request.
 * This intentionally refuses missing, expired, corrupt, or out-of-corridor
 * data; there is no straight-line fallback that could send a rider through
 * an illegal or unknown road.
 */
export function recoverRouteFromOfflinePack(
  pack: OfflineRoutePack,
  points: Waypoint[],
  now = new Date()
): { route: PlannedRoute | null; error: string | null } {
  if (getOfflineRoutePackExpiryState(pack, now) === "expired") {
    return { route: null, error: "The saved offline route pack has expired." }
  }
  if (pack.routingCapability !== "in-corridor-routing" || !pack.corridorGraph) {
    return { route: null, error: "No offline routing corridor is saved for this route." }
  }
  if (points.length < 2) return { route: null, error: "Offline recovery needs a start and rejoin point." }

  let graph: OfflineGraph
  try {
    graph = JSON.parse(pack.corridorGraph) as OfflineGraph
    validateOfflineGraph(graph)
  } catch {
    return { route: null, error: "The saved offline routing graph is corrupt." }
  }

  const snapped = points.map((point) => nearestNode(graph, point))
  if (snapped.some((node) => node === null)) {
    return { route: null, error: "The current position is outside the saved offline corridor." }
  }
  const nodeIndices = snapped as number[]
  const routeGraph: OfflineGraph = {
    ...graph,
    shapingPoints: nodeIndices.slice(1, -1).map((nodeIndex, order) => ({
      id: `rejoin-${order}`,
      nodeIndex,
      order
    }))
  }
  const result = findOfflinePath(
    routeGraph,
    buildOfflineGraphAdjacency(routeGraph),
    nodeIndices[0]!,
    nodeIndices.at(-1)!,
    { atEpochMillis: now.getTime(), maxVisitedNodes: 50_000, respectOneWay: true }
  )
  if (!result.result || result.result.nodeIndices.length < 2) {
    return { route: null, error: result.failure?.message ?? "No legal path exists in the saved offline corridor." }
  }

  const geometry = result.result.nodeIndices
    .map((index) => routeGraph.nodes[index]?.coordinate)
    .filter((coordinate): coordinate is [number, number] => Boolean(coordinate))
  if (geometry.length < 2) return { route: null, error: "The saved offline graph returned no usable geometry." }

  const distanceMiles = result.result.totalMeters / 1_609.344
  const durationMinutes = pack.route.distanceMiles > 0
    ? Math.max(1, pack.route.durationMinutes * distanceMiles / pack.route.distanceMiles)
    : Math.max(1, distanceMiles * 2)
  const route: PlannedRoute = {
    ...structuredClone(pack.route),
    id: `${pack.route.id}-offline-recovery`,
    name: `${pack.route.name} · Offline recovery`,
    geometry,
    waypoints: points.map((point) => ({ ...point })),
    instructions: [offlineInstruction(geometry)],
    distanceMiles: Number(distanceMiles.toFixed(2)),
    durationMinutes: Number(durationMinutes.toFixed(1)),
    routingSource: "imported",
    provider: undefined,
    providerVersion: undefined,
    previewOnly: false
  }
  return { route, error: null }
}

/** Map a v2 offline profile to a v2 router profile id. */
function toOfflineRouteProfile(profile: PlannedRoute["profile"]): OfflineRouteRequestV2["profile"] {
  return profile
}

/**
 * Recover a route from installed regional v2 graph tiles when the live routing
 * provider is unreachable (SB-020 Level 3). Loads only the tiles that intersect
 * the reroute points, routes them through the offline-routing worker, and maps
 * the bounded result back onto a {@link PlannedRoute}.
 *
 * Unlike the corridor-pack path, this does not require a saved pack: any
 * installed region whose graph covers the reroute points can rejoin the ride.
 * Missing, corrupt, or out-of-coverage data is refused with an explicit reason —
 * there is no straight-line fallback.
 */
export interface InstalledRegionSource {
  list(): Promise<Array<{ id: string; builtAt: string; downloadedAt: string }>>
  getActiveGraphTiles(
    regionId: string,
    searchBounds?: { minLon: number; minLat: number; maxLon: number; maxLat: number }
  ): Promise<OfflineGraphTileV2[]>
}

export interface RecoverFromRegionsInput {
  route: PlannedRoute
  points: Waypoint[]
  regions: InstalledRegionSource
  createWorker?: OfflineRoutingWorkerFactory
  signal?: AbortSignal
  /** Offline bike compatibility tier; defaults to `street` when unknown. */
  bikeCompatibility?: OfflineRouteRequestV2["bikeCompatibility"]
}

export async function recoverRouteFromInstalledRegions(
  input: RecoverFromRegionsInput
): Promise<{ route: PlannedRoute | null; error: string | null }> {
  const { route, points, regions } = input
  if (points.length < 2) return { route: null, error: "Offline recovery needs a start and rejoin point." }

  const coordinates: Array<[number, number]> = points.map((point) => [point.lon, point.lat])
  const required = suggestRegionsForRoute(coordinates)
  if (required.length === 0) {
    return { route: null, error: "No installed offline region covers this ride's position." }
  }

  const installed = new Set((await regions.list()).map((region) => region.id))
  const missing = required.filter((region) => !installed.has(region.id))
  if (missing.length > 0) {
    return {
      route: null,
      error: `Offline rerouting needs region data for ${missing.map((region) => region.code).join(", ")}.`
    }
  }

  const searchBounds = boundsAround(points)
  const tiles: OfflineGraphTileV2[] = []
  for (const region of required) {
    try {
      tiles.push(...await regions.getActiveGraphTiles(region.id, searchBounds))
    } catch {
      // A region whose tiles are unreadable cannot contribute; the caller may
      // still have other regions, so continue rather than fail here.
    }
  }
  if (tiles.length === 0) {
    return {
      route: null,
      error: "Installed region data is unreadable — reinstall the offline region or ride online."
    }
  }

  const request: OfflineRouteRequestV2 = {
    start: [points[0]!.lon, points[0]!.lat],
    finish: [points.at(-1)!.lon, points.at(-1)!.lat],
    shapingPoints: points.slice(1, -1).map((point) => [point.lon, point.lat] as const),
    profile: toOfflineRouteProfile(route.profile),
    bikeCompatibility: input.bikeCompatibility ?? "street",
    avoidHighways: route.avoidHighways ?? false,
    requiredRegionIds: required.map((region) => region.id),
    installedRegionIds: required.map((region) => region.id),
    maxSnapMeters: 5_000,
    maxVisitedStates: DEFAULT_MAX_VISITED_STATES
  }

  let result: OfflineRouteSuccessV2
  try {
    result = await routeOfflineV2InWorker(request, tiles, {
      createWorker: input.createWorker,
      signal: input.signal
    })
  } catch (caught) {
    if (caught instanceof OfflineRoutingError && caught.kind === "cancelled") throw caught
    const message = caught instanceof Error ? caught.message : "Offline regional reroute failed."
    return { route: null, error: message }
  }

  if (result.geometry.length < 2) {
    return { route: null, error: "Offline regional data returned no usable geometry." }
  }

  const distanceMiles = result.distanceMeters / 1_609.344
  const durationMinutes = route.distanceMiles > 0
    ? Math.max(1, route.durationMinutes * distanceMiles / route.distanceMiles)
    : Math.max(1, distanceMiles * 2)
  const recovered: PlannedRoute = {
    ...structuredClone(route),
    id: `${route.id}-offline-recovery`,
    name: `${route.name} · Offline recovery`,
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
  return { route: recovered, error: null }
}

/** Compute a padded bounding box around reroute points for tile scoping. */
function boundsAround(points: Waypoint[]): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
  const lons = points.map((point) => point.lon)
  const lats = points.map((point) => point.lat)
  const pad = 0.05
  return {
    minLon: Math.min(...lons) - pad,
    minLat: Math.min(...lats) - pad,
    maxLon: Math.max(...lons) + pad,
    maxLat: Math.max(...lats) + pad
  }
}
