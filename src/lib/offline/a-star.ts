import type { Coordinate } from "@/lib/routing/types"
import type {
  OfflineGraph,
  OfflineGraphAdjacency,
  OfflineGraphEdge
} from "./graph"
import { isEdgeOpenAt, validateOfflineGraph } from "./graph"

export interface OfflineAStarHeuristic {
  /** Lower-bound cost (meters) between two node indices. Must be admissible. */
  (graph: OfflineGraph, fromNodeIndex: number, toNodeIndex: number): number
}

export interface OfflineAStarOptions {
  /** Reference time used to filter closed edges. Required. */
  atEpochMillis: number
  /** Optional custom heuristic. Defaults to haversine distance between node coords. */
  heuristic?: OfflineAStarHeuristic
  /** Hard cap on nodes visited before the search fails. Defaults to 50_000. */
  maxVisitedNodes?: number
  /**
   * If true, respect one-way restrictions (skipping edges marked "one-way"
   * in the wrong direction).
   */
  respectOneWay?: boolean
}

export type OfflineAStarFailure =
  | { kind: "no_path"; message: string }
  | { kind: "max_visited"; visited: number; message: string }
  | { kind: "invalid_graph"; message: string }
  | { kind: "invalid_nodes"; message: string }
  | { kind: "missing_shaping_point"; message: string }

export interface OfflineAStarResult {
  /** Total accumulated meters across the returned path. */
  totalMeters: number
  /** Ordered list of visited node indices from start to goal. */
  nodeIndices: number[]
  /** Ordered list of traversed edge ids (empty if start === goal). */
  edgeIds: string[]
  /** Number of nodes expanded (popped from the open set). */
  visitedCount: number
}

const DEFAULT_MAX_VISITED_NODES = 50_000

/**
 * Bounded A* search between two node indices in an {@link OfflineGraph}.
 * Respects shaping-point ordering when {@link OfflineGraph.shapingPoints}
 * is non-empty: the path must visit shaping points in ascending `order`
 * before reaching the goal. Returns null and a failure reason if no path
 * can be found within the visited-node budget or the graph is invalid.
 *
 * Pure: no Web Worker wiring, no UI, no storage.
 */
export function findOfflinePath(
  graph: OfflineGraph,
  adjacency: OfflineGraphAdjacency,
  startNodeIndex: number,
  goalNodeIndex: number,
  options: OfflineAStarOptions
): { result: OfflineAStarResult | null; failure: OfflineAStarFailure | null } {
  try {
    validateOfflineGraph(graph)
  } catch (error) {
    return {
      result: null,
      failure: {
        kind: "invalid_graph",
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  const nodeCount = graph.nodes.length
  if (
    !Number.isInteger(startNodeIndex) ||
    startNodeIndex < 0 ||
    startNodeIndex >= nodeCount ||
    !Number.isInteger(goalNodeIndex) ||
    goalNodeIndex < 0 ||
    goalNodeIndex >= nodeCount
  ) {
    return {
      result: null,
      failure: {
        kind: "invalid_nodes",
        message: `Invalid start or goal node index (start=${startNodeIndex}, goal=${goalNodeIndex}, nodeCount=${nodeCount})`
      }
    }
  }

  const sortedShaping = [...graph.shapingPoints].sort((a, b) => a.order - b.order)
  for (const sp of sortedShaping) {
    if (
      !Number.isInteger(sp.nodeIndex) ||
      sp.nodeIndex < 0 ||
      sp.nodeIndex >= nodeCount
    ) {
      return {
        result: null,
        failure: {
          kind: "missing_shaping_point",
          message: `Shaping point references invalid node index ${sp.nodeIndex}`
        }
      }
    }
  }

  // Trivial short-circuit: start === goal with no shaping points.
  if (startNodeIndex === goalNodeIndex && sortedShaping.length === 0) {
    return {
      result: {
        totalMeters: 0,
        nodeIndices: [startNodeIndex],
        edgeIds: [],
        visitedCount: 1
      },
      failure: null
    }
  }

  const waypoints: number[] = [
    startNodeIndex,
    ...sortedShaping.map((s) => s.nodeIndex),
    goalNodeIndex
  ]

  const finalNodeIndices: number[] = []
  const finalEdgeIds: string[] = []
  let totalMeters = 0
  let totalVisited = 0

  for (let i = 0; i < waypoints.length - 1; i++) {
    const segStart = waypoints[i]!
    const segGoal = waypoints[i + 1]!
    const sub = aStarSearchSegment(
      graph,
      adjacency,
      segStart,
      segGoal,
      options,
      totalVisited
    )
    if (sub.failure) {
      return { result: null, failure: sub.failure }
    }
    const subResult = sub.result!
    if (finalNodeIndices.length === 0) {
      finalNodeIndices.push(...subResult.nodeIndices)
    } else {
      // Drop the first node of subsequent segments — it duplicates the
      // last node of the previous segment.
      finalNodeIndices.push(...subResult.nodeIndices.slice(1))
    }
    finalEdgeIds.push(...subResult.edgeIds)
    totalMeters += subResult.totalMeters
    totalVisited = subResult.visitedCount
  }

  return {
    result: {
      totalMeters,
      nodeIndices: finalNodeIndices,
      edgeIds: finalEdgeIds,
      visitedCount: totalVisited
    },
    failure: null
  }
}

interface SegmentResult {
  result: OfflineAStarResult | null
  failure: OfflineAStarFailure | null
}

/**
 * Run A* between two node indices that are guaranteed to be in range. The
 * `initialVisited` argument carries forward the budget consumed by prior
 * segments so that the overall `maxVisitedNodes` budget is enforced across
 * the whole shaping-point chain.
 */
function aStarSearchSegment(
  graph: OfflineGraph,
  adjacency: OfflineGraphAdjacency,
  start: number,
  goal: number,
  options: OfflineAStarOptions,
  initialVisited: number
): SegmentResult {
  const maxVisited = options.maxVisitedNodes ?? DEFAULT_MAX_VISITED_NODES
  const heuristic = options.heuristic ?? defaultHaversineHeuristic
  const respectOneWay = options.respectOneWay === true
  const at = options.atEpochMillis

  const open = new MinHeap()
  const gScore = new Map<number, number>()
  const cameFromNode = new Map<number, number>()
  const cameFromEdge = new Map<number, number>()
  const closed = new Set<number>()

  gScore.set(start, 0)
  open.push(start, heuristic(graph, start, goal))

  let visited = initialVisited

  while (open.size > 0) {
    const current = open.pop()!
    if (closed.has(current)) continue
    closed.add(current)
    visited++

    if (visited > maxVisited) {
      return {
        result: null,
        failure: {
          kind: "max_visited",
          visited,
          message: `Exceeded max visited nodes ${maxVisited} before reaching goal`
        }
      }
    }

    if (current === goal) {
      const nodeIndices: number[] = []
      const edgeIndices: number[] = []
      let n = current
      while (n !== start) {
        nodeIndices.unshift(n)
        const e = cameFromEdge.get(n)
        if (e === undefined) break
        edgeIndices.unshift(e)
        const prev = cameFromNode.get(n)
        if (prev === undefined) break
        n = prev
      }
      nodeIndices.unshift(start)
      const edgeIds = edgeIndices.map((i) => graph.edges[i]!.id)
      const totalMeters = edgeIndices.reduce(
        (sum, i) => sum + graph.edges[i]!.lengthMeters,
        0
      )
      return {
        result: { totalMeters, nodeIndices, edgeIds, visitedCount: visited },
        failure: null
      }
    }

    const gCurrent = gScore.get(current) ?? Infinity

    // Forward edges: always allowed (subject to closure filtering).
    for (const edgeIndex of adjacency.outgoing[current] ?? []) {
      const edge = graph.edges[edgeIndex]!
      if (!isEdgeOpenAt(edge, at)) continue
      const next = edge.to
      const tentative = gCurrent + edge.lengthMeters
      if (tentative < (gScore.get(next) ?? Infinity)) {
        gScore.set(next, tentative)
        cameFromNode.set(next, current)
        cameFromEdge.set(next, edgeIndex)
        open.push(next, tentative + heuristic(graph, next, goal))
      }
    }

    // Reverse edges (incoming): traverse from `current` to `edge.from`.
    // Forbid when respectOneWay is set and the edge carries a one-way
    // restriction (the edge is committed to its from→to direction only).
    for (const edgeIndex of adjacency.incoming[current] ?? []) {
      const edge = graph.edges[edgeIndex]!
      if (!isEdgeOpenAt(edge, at)) continue
      if (respectOneWay && hasOneWayRestriction(edge)) continue
      const next = edge.from
      const tentative = gCurrent + edge.lengthMeters
      if (tentative < (gScore.get(next) ?? Infinity)) {
        gScore.set(next, tentative)
        cameFromNode.set(next, current)
        cameFromEdge.set(next, edgeIndex)
        open.push(next, tentative + heuristic(graph, next, goal))
      }
    }
  }

  return {
    result: null,
    failure: {
      kind: "no_path",
      message: `No path from node ${start} to node ${goal}`
    }
  }
}

function hasOneWayRestriction(edge: OfflineGraphEdge): boolean {
  if (!Array.isArray(edge.restrictions)) return false
  for (const r of edge.restrictions) {
    if (r && r.kind === "one-way") return true
  }
  return false
}

/**
 * Default admissible heuristic: great-circle (haversine) distance between
 * node coordinates. Straight-line distance is always a lower bound on the
 * road distance, so this satisfies the admissibility requirement for A*.
 */
function defaultHaversineHeuristic(
  graph: OfflineGraph,
  fromNodeIndex: number,
  toNodeIndex: number
): number {
  const a = graph.nodes[fromNodeIndex]?.coordinate
  const b = graph.nodes[toNodeIndex]?.coordinate
  if (!a || !b) return 0
  return haversineMeters(a, b)
}

function haversineMeters(a: Coordinate, b: Coordinate): number {
  const R = 6371000 // earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180
  const lonA = a[0]
  const latA = a[1]
  const lonB = b[0]
  const latB = b[1]
  const dLat = toRad(latB - latA)
  const dLon = toRad(lonB - lonA)
  const sLat = Math.sin(dLat / 2)
  const sLon = Math.sin(dLon / 2)
  const h =
    sLat * sLat +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * sLon * sLon
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Minimal binary min-heap of node indices keyed on f-score. The graph sizes
 * handled by the offline worker are small enough that a sorted array would
 * also suffice, but a heap keeps worst-case pops near O(log n).
 */
class MinHeap {
  private readonly priorities: number[] = []
  private readonly values: number[] = []

  get size(): number {
    return this.values.length
  }

  push(value: number, priority: number): void {
    this.priorities.push(priority)
    this.values.push(value)
    this.siftUp(this.values.length - 1)
  }

  pop(): number | undefined {
    if (this.values.length === 0) return undefined
    const top = this.values[0]!
    const lastIdx = this.values.length - 1
    if (lastIdx === 0) {
      this.priorities.pop()
      return this.values.pop()!
    }
    this.values[0] = this.values[lastIdx]!
    this.priorities[0] = this.priorities[lastIdx]!
    this.values.pop()
    this.priorities.pop()
    this.siftDown(0)
    return top
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2)
      if (this.priorities[i]! < this.priorities[parent]!) {
        this.swap(i, parent)
        i = parent
      } else {
        break
      }
    }
  }

  private siftDown(i: number): void {
    const n = this.values.length
    while (true) {
      const l = 2 * i + 1
      const r = 2 * i + 2
      let best = i
      if (l < n && this.priorities[l]! < this.priorities[best]!) best = l
      if (r < n && this.priorities[r]! < this.priorities[best]!) best = r
      if (best === i) break
      this.swap(i, best)
      i = best
    }
  }

  private swap(i: number, j: number): void {
    const tmpP = this.priorities[i]!
    this.priorities[i] = this.priorities[j]!
    this.priorities[j] = tmpP
    const tmpV = this.values[i]!
    this.values[i] = this.values[j]!
    this.values[j] = tmpV
  }
}
