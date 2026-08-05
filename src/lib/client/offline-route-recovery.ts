import { buildOfflineGraphAdjacency, validateOfflineGraph, type OfflineGraph } from "@/lib/offline/graph"
import { findOfflinePath } from "@/lib/offline/a-star"
import { getOfflineRoutePackExpiryState, type OfflineRoutePack } from "@/lib/storage/offline-route-pack"
import type { PlannedRoute, RouteInstruction, Waypoint } from "@/lib/routing/types"

const MAX_SNAP_METERS = 800

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
