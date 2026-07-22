import type { Coordinate } from "@/lib/routing/types"
import {
  validateOfflineGraphTileV2,
  type OfflineGraphEdgeV2,
  type OfflineGraphNodeV2,
  type OfflineGraphTileV2,
  type OfflineTurnRestriction
} from "./v2-contracts"

export type OfflineRouteProfile = "quick" | "twisty" | "scenic" | "adventure"
export type OfflineBikeCompatibility = "street" | "adventure" | "dual-sport"

export interface OfflineRoadLockV2 {
  osmWayId: string
  mode: "must" | "prefer" | "avoid"
}

export interface OfflineRouteRequestV2 {
  start: Coordinate
  finish: Coordinate
  shapingPoints?: Coordinate[]
  profile: OfflineRouteProfile
  bikeCompatibility: OfflineBikeCompatibility
  avoidHighways?: boolean
  roadLocks?: OfflineRoadLockV2[]
  requiredRegionIds: string[]
  installedRegionIds: string[]
  maxSnapMeters?: number
  maxVisitedStates?: number
}

export type OfflineRouteFailureV2 =
  | { ok: false; kind: "missing_region"; missingRegionIds: string[]; message: string }
  | { ok: false; kind: "out_of_coverage"; message: string }
  | { ok: false; kind: "corrupt_data"; message: string }
  | { ok: false; kind: "no_path"; message: string }
  | { ok: false; kind: "search_budget"; visitedStates: number; message: string }

export interface OfflineRouteSuccessV2 {
  ok: true
  edgeIds: string[]
  geometry: Coordinate[]
  distanceMeters: number
  visitedStates: number
  snappedWaypoints: Array<{ coordinate: Coordinate; nodeId: string; edgeId: string }>
}

interface MergedGraph {
  nodes: Map<string, OfflineGraphNodeV2>
  edges: Map<string, OfflineGraphEdgeV2>
  outgoing: Map<string, OfflineGraphEdgeV2[]>
  restrictions: Map<string, OfflineTurnRestriction[]>
}

interface SearchState {
  nodeId: string
  incomingEdgeId: string
  targetIndex: number
  lockMask: number
}

interface QueueEntry {
  key: string
  cost: number
}

const MAX_MUST_LOCKS = 20

export function routeOfflineV2(
  tiles: OfflineGraphTileV2[],
  request: OfflineRouteRequestV2
): OfflineRouteSuccessV2 | OfflineRouteFailureV2 {
  const installed = new Set(request.installedRegionIds)
  const missingRegionIds = [...new Set(request.requiredRegionIds)].filter((id) => !installed.has(id))
  if (missingRegionIds.length > 0) {
    return {
      ok: false,
      kind: "missing_region",
      missingRegionIds,
      message: `Install offline data for ${missingRegionIds.join(", ")}`
    }
  }
  if (tiles.length === 0 || tiles.some((tile) => !validateOfflineGraphTileV2(tile))) {
    return { ok: false, kind: "corrupt_data", message: "Offline graph tiles are missing or corrupt" }
  }

  const graph = mergeTiles(tiles)
  const requestedCoordinates = [request.start, ...(request.shapingPoints ?? []), request.finish]
  const snapped = requestedCoordinates.map((coordinate) => snapToLegalEdge(graph, coordinate, request))
  if (snapped.some((value) => value === null)) {
    return { ok: false, kind: "out_of_coverage", message: "A route point is outside installed road coverage" }
  }
  const snappedWaypoints = snapped.filter((value): value is NonNullable<typeof value> => value !== null)
  const targetNodeIds = snappedWaypoints.map((value) => value.nodeId)

  const mustLocks = [...new Set((request.roadLocks ?? []).filter((lock) => lock.mode === "must").map((lock) => lock.osmWayId))]
  if (mustLocks.length > MAX_MUST_LOCKS) {
    return { ok: false, kind: "no_path", message: `Offline routing supports at most ${MAX_MUST_LOCKS} required road locks` }
  }
  const mustBit = new Map(mustLocks.map((wayId, index) => [wayId, 1 << index]))
  const requiredMask = mustLocks.reduce((mask, _, index) => mask | (1 << index), 0)
  const avoidWays = new Set((request.roadLocks ?? []).filter((lock) => lock.mode === "avoid").map((lock) => lock.osmWayId))
  const preferWays = new Set((request.roadLocks ?? []).filter((lock) => lock.mode === "prefer").map((lock) => lock.osmWayId))

  let initialTargetIndex = 1
  while (initialTargetIndex < targetNodeIds.length && targetNodeIds[initialTargetIndex] === targetNodeIds[0]) {
    initialTargetIndex += 1
  }
  const initial: SearchState = {
    nodeId: targetNodeIds[0],
    incomingEdgeId: "",
    targetIndex: initialTargetIndex,
    lockMask: 0
  }
  const initialKey = stateKey(initial)
  const queue = new MinQueue()
  queue.push(initialKey, 0)
  const scores = new Map([[initialKey, 0]])
  const states = new Map([[initialKey, initial]])
  const previous = new Map<string, { key: string; edge: OfflineGraphEdgeV2 }>()
  let visitedStates = 0
  const maxVisited = request.maxVisitedStates ?? 200_000

  while (queue.size > 0) {
    const currentEntry = queue.pop()!
    if (currentEntry.cost !== scores.get(currentEntry.key)) continue
    const current = states.get(currentEntry.key)!
    visitedStates += 1
    if (visitedStates > maxVisited) {
      return {
        ok: false,
        kind: "search_budget",
        visitedStates,
        message: `Offline search exceeded ${maxVisited} states`
      }
    }
    if (current.targetIndex >= targetNodeIds.length && current.lockMask === requiredMask) {
      return buildSuccess(currentEntry.key, previous, snappedWaypoints, visitedStates)
    }

    for (const edge of graph.outgoing.get(current.nodeId) ?? []) {
      if (!edgeIsCompatible(edge, request) || avoidWays.has(edge.osmWayId)) continue
      if (turnIsRestricted(graph, current, edge)) continue

      let nextTargetIndex = current.targetIndex
      while (nextTargetIndex < targetNodeIds.length && edge.toNodeId === targetNodeIds[nextTargetIndex]) {
        nextTargetIndex += 1
      }
      const next: SearchState = {
        nodeId: edge.toNodeId,
        incomingEdgeId: edge.id,
        targetIndex: nextTargetIndex,
        lockMask: current.lockMask | (mustBit.get(edge.osmWayId) ?? 0)
      }
      const key = stateKey(next)
      const weight = edge.profileWeights[request.profile]
      const highwayPenalty = request.avoidHighways && (edge.roadClass === "motorway" || edge.roadClass === "trunk") ? 8 : 1
      const preference = preferWays.has(edge.osmWayId) ? 0.7 : 1
      const tentative = currentEntry.cost + weight * highwayPenalty * preference
      if (tentative >= (scores.get(key) ?? Number.POSITIVE_INFINITY)) continue
      scores.set(key, tentative)
      states.set(key, next)
      previous.set(key, { key: currentEntry.key, edge })
      queue.push(key, tentative)
    }
  }

  return { ok: false, kind: "no_path", message: "No legal offline road path connects these points" }
}

function mergeTiles(tiles: OfflineGraphTileV2[]): MergedGraph {
  const nodes = new Map<string, OfflineGraphNodeV2>()
  const edges = new Map<string, OfflineGraphEdgeV2>()
  const restrictions = new Map<string, OfflineTurnRestriction[]>()
  for (const tile of tiles) {
    for (const node of tile.nodes) nodes.set(node.id, node)
    for (const edge of tile.edges) edges.set(edge.id, edge)
    for (const restriction of tile.turnRestrictions) {
      const key = `${restriction.incomingEdgeId}:${restriction.viaNodeId}`
      const list = restrictions.get(key) ?? []
      if (!list.some((candidate) => candidate.outgoingEdgeId === restriction.outgoingEdgeId && candidate.restriction === restriction.restriction)) {
        list.push(restriction)
      }
      restrictions.set(key, list)
    }
  }
  const outgoing = new Map<string, OfflineGraphEdgeV2[]>()
  for (const edge of edges.values()) {
    const list = outgoing.get(edge.fromNodeId) ?? []
    list.push(edge)
    outgoing.set(edge.fromNodeId, list)
  }
  return { nodes, edges, outgoing, restrictions }
}

function edgeIsCompatible(edge: OfflineGraphEdgeV2, request: OfflineRouteRequestV2): boolean {
  if (edge.access === "forbidden" || edge.motorcycleAccess === "forbidden") return false
  if (request.bikeCompatibility === "street") {
    if (["track", "path"].includes(edge.roadClass)) return false
    if (["gravel", "dirt", "unpaved", "ground"].includes(edge.surface)) return false
  }
  return true
}

function turnIsRestricted(graph: MergedGraph, current: SearchState, outgoing: OfflineGraphEdgeV2): boolean {
  if (!current.incomingEdgeId) return false
  const restrictions = graph.restrictions.get(`${current.incomingEdgeId}:${current.nodeId}`) ?? []
  if (restrictions.some((restriction) => restriction.restriction === "no_turn" && restriction.outgoingEdgeId === outgoing.id)) {
    return true
  }
  const onlyTurns = restrictions.filter((restriction) => restriction.restriction === "only_turn")
  return onlyTurns.length > 0 && !onlyTurns.some((restriction) => restriction.outgoingEdgeId === outgoing.id)
}

function snapToLegalEdge(
  graph: MergedGraph,
  coordinate: Coordinate,
  request: OfflineRouteRequestV2
): { coordinate: Coordinate; nodeId: string; edgeId: string } | null {
  let best: { distance: number; nodeId: string; edgeId: string } | null = null
  for (const edge of graph.edges.values()) {
    if (!edgeIsCompatible(edge, request)) continue
    for (let index = 0; index < edge.geometry.length - 1; index += 1) {
      const distance = pointSegmentDistanceMeters(coordinate, edge.geometry[index], edge.geometry[index + 1])
      if (best && distance >= best.distance) continue
      const from = graph.nodes.get(edge.fromNodeId)?.coordinate
      const to = graph.nodes.get(edge.toNodeId)?.coordinate
      if (!from || !to) continue
      best = {
        distance,
        nodeId: haversineMeters(coordinate, from) <= haversineMeters(coordinate, to) ? edge.fromNodeId : edge.toNodeId,
        edgeId: edge.id
      }
    }
  }
  if (!best || best.distance > (request.maxSnapMeters ?? 5_000)) return null
  return { coordinate, nodeId: best.nodeId, edgeId: best.edgeId }
}

function pointSegmentDistanceMeters(point: Coordinate, start: Coordinate, finish: Coordinate): number {
  const latitudeScale = 111_320
  const longitudeScale = Math.cos(point[1] * Math.PI / 180) * latitudeScale
  const ax = (start[0] - point[0]) * longitudeScale
  const ay = (start[1] - point[1]) * latitudeScale
  const bx = (finish[0] - point[0]) * longitudeScale
  const by = (finish[1] - point[1]) * latitudeScale
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared))
  return Math.hypot(ax + t * dx, ay + t * dy)
}

function stateKey(state: SearchState): string {
  return `${state.nodeId}|${state.incomingEdgeId}|${state.targetIndex}|${state.lockMask}`
}

function buildSuccess(
  finalKey: string,
  previous: Map<string, { key: string; edge: OfflineGraphEdgeV2 }>,
  snappedWaypoints: Array<{ coordinate: Coordinate; nodeId: string; edgeId: string }>,
  visitedStates: number
): OfflineRouteSuccessV2 {
  const edges: OfflineGraphEdgeV2[] = []
  let key = finalKey
  while (previous.has(key)) {
    const step = previous.get(key)!
    edges.unshift(step.edge)
    key = step.key
  }
  const geometry: Coordinate[] = []
  let distanceMeters = 0
  for (const edge of edges) {
    for (const coordinate of edge.geometry) {
      const last = geometry.at(-1)
      if (!last || last[0] !== coordinate[0] || last[1] !== coordinate[1]) geometry.push(coordinate)
    }
    for (let index = 0; index < edge.geometry.length - 1; index += 1) {
      distanceMeters += haversineMeters(edge.geometry[index], edge.geometry[index + 1])
    }
  }
  return {
    ok: true,
    edgeIds: edges.map((edge) => edge.id),
    geometry,
    distanceMeters,
    visitedStates,
    snappedWaypoints
  }
}

function haversineMeters(a: Coordinate, b: Coordinate): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180
  const dLat = toRadians(b[1] - a[1])
  const dLon = toRadians(b[0] - a[0])
  const latA = toRadians(a[1])
  const latB = toRadians(b[1])
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

class MinQueue {
  private values: QueueEntry[] = []

  get size(): number {
    return this.values.length
  }

  push(key: string, cost: number): void {
    this.values.push({ key, cost })
    let index = this.values.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.values[parent].cost <= cost) break
      this.values[index] = this.values[parent]
      index = parent
    }
    this.values[index] = { key, cost }
  }

  pop(): QueueEntry | undefined {
    if (this.values.length === 0) return undefined
    const first = this.values[0]
    const last = this.values.pop()!
    if (this.values.length === 0) return first
    let index = 0
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      if (left >= this.values.length) break
      const child = right < this.values.length && this.values[right].cost < this.values[left].cost ? right : left
      if (this.values[child].cost >= last.cost) break
      this.values[index] = this.values[child]
      index = child
    }
    this.values[index] = last
    return first
  }
}
