import type { Coordinate } from "@/lib/routing/types"

/**
 * Schema version of the persisted offline graph payload.
 *
 * New saves always write the current version. Callers that hydrate a
 * graph from persisted state should refuse or migrate payloads whose
 * `schemaVersion` is greater than this constant.
 */
export const OFFLINE_GRAPH_SCHEMA_VERSION = 1

/**
 * Kind of restriction attached to an {@link OfflineGraphEdge}.
 *
 * `"one-way"` is a directional flag consulted by the A* worker when
 * `respectOneWay` is enabled. The remaining kinds are time-windowed
 * closures consulted by {@link isEdgeOpenAt}.
 */
export type OfflineGraphRestrictionKind =
  | "no-through"
  | "one-way"
  | "seasonal-closure"
  | "weight-limit"
  | "access-permit-required"

const RESTRICTION_KINDS: ReadonlySet<OfflineGraphRestrictionKind> = new Set([
  "no-through",
  "one-way",
  "seasonal-closure",
  "weight-limit",
  "access-permit-required"
])

/**
 * Restriction kinds that, when their time window is active, render an
 * edge impassable for {@link isEdgeOpenAt}. The `"one-way"` kind is
 * intentionally excluded — it is directional, not a closure.
 */
const CLOSURE_KINDS: ReadonlySet<OfflineGraphRestrictionKind> = new Set([
  "no-through",
  "seasonal-closure",
  "weight-limit",
  "access-permit-required"
])

export interface OfflineGraphRestriction {
  kind: OfflineGraphRestrictionKind
  /** Starting epoch millis when this restriction becomes active. null = always. */
  startsAt?: number | null
  /** Ending epoch millis when this restriction lifts. null = indefinite. */
  endsAt?: number | null
  /** Free-form reason used to surface provenance in UI (not for routing logic). */
  reason?: string
}

export interface OfflineGraphShapingPoint {
  /** Stable id used to require ordering in A*. */
  id: string
  /** Graph node index this shaping point pins to. */
  nodeIndex: number
  /** Required traversal order — A* must visit shaping points in ascending order. */
  order: number
}

export interface OfflineGraphEdge {
  /** Directed edge id (for symmetry, an opposite-direction edge is a separate edge id). */
  id: string
  /** Origin node index. */
  from: number
  /** Destination node index. */
  to: number
  /** Direct polyline distance in meters between the node coordinates (precomputed). */
  lengthMeters: number
  /** Public-road access flags the worker should respect. */
  restrictions: OfflineGraphRestriction[]
  /** Index of the originating corridor segment in the corridor manifest, if known. */
  corridorSegmentIndex?: number
}

export interface OfflineGraphNode {
  index: number
  coordinate: Coordinate
}

export interface OfflineGraph {
  schemaVersion: typeof OFFLINE_GRAPH_SCHEMA_VERSION
  nodes: OfflineGraphNode[]
  edges: OfflineGraphEdge[]
  shapingPoints: OfflineGraphShapingPoint[]
  /** Source-route / corridor provenance for transparency in the UI. */
  provenance?: { routeId: string; builtAt: string }
}

/**
 * Adjacency list over an {@link OfflineGraph} — precomputed and bounded.
 * Indexed by node index.
 *
 * The entries are indices into {@link OfflineGraph.edges `graph.edges`}
 * (not edge `id` strings), so consumers should resolve an entry via
 * `graph.edges[edgeIndex]`.
 */
export interface OfflineGraphAdjacency {
  /** For each node, the index list of outgoing edge ids. */
  outgoing: number[][]
  /** For each node, the index list of incoming edge ids (used for one-way checks). */
  incoming: number[][]
}

/**
 * Build an adjacency list for the given graph. Pure.
 *
 * Defensive: edges whose `from` or `to` fall outside the node range are
 * silently skipped so that this builder never throws — callers that
 * want strict validation should run {@link validateOfflineGraph} first.
 */
export function buildOfflineGraphAdjacency(graph: OfflineGraph): OfflineGraphAdjacency {
  const nodeCount = graph.nodes.length
  const outgoing: number[][] = new Array(nodeCount)
  const incoming: number[][] = new Array(nodeCount)
  for (let i = 0; i < nodeCount; i++) {
    outgoing[i] = []
    incoming[i] = []
  }
  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i]
    if (!edge) continue
    const from = edge.from
    const to = edge.to
    if (typeof from !== "number" || from < 0 || from >= nodeCount) continue
    if (typeof to !== "number" || to < 0 || to >= nodeCount) continue
    outgoing[from]!.push(i)
    incoming[to]!.push(i)
  }
  return { outgoing, incoming }
}

/**
 * Validate that the graph is internally consistent. Throws on the first issue found.
 *
 * Checks:
 * - `nodes`, `edges`, and `shapingPoints` are arrays.
 * - Each node's `index` matches its array position.
 * - Each node's `coordinate` is a `[number, number]` tuple with finite
 *   longitude and a latitude in [-90, 90].
 * - Each edge's `from` and `to` refer to a valid node index.
 * - An edge may not be a self-loop (`from === to`).
 * - Each edge's `lengthMeters` is finite and non-negative.
 * - Each edge's `restrictions` array is well-formed (kinds in the
 *   allowed set, timestamps numeric when present).
 * - Each shaping point references a valid node index and `order` values
 *   are unique across the array.
 */
export function validateOfflineGraph(graph: OfflineGraph): void {
  if (!graph || typeof graph !== "object") {
    throw new Error("OfflineGraph must be an object")
  }
  if (!Array.isArray(graph.nodes)) {
    throw new Error("OfflineGraph.nodes must be an array")
  }
  if (!Array.isArray(graph.edges)) {
    throw new Error("OfflineGraph.edges must be an array")
  }
  if (!Array.isArray(graph.shapingPoints)) {
    throw new Error("OfflineGraph.shapingPoints must be an array")
  }

  const nodeCount = graph.nodes.length

  for (let i = 0; i < nodeCount; i++) {
    const node = graph.nodes[i]
    if (!node || typeof node !== "object") {
      throw new Error(`Node at index ${i} is not an object`)
    }
    if (node.index !== i) {
      throw new Error(
        `Node at index ${i} has mismatched index ${String(node.index)}`
      )
    }
    const coord = node.coordinate
    if (!Array.isArray(coord) || coord.length !== 2) {
      throw new Error(`Node ${i} coordinate must be a [number, number] tuple`)
    }
    const lon = coord[0]
    const lat = coord[1]
    if (typeof lon !== "number" || !Number.isFinite(lon)) {
      throw new Error(`Node ${i} has non-finite longitude`)
    }
    if (
      typeof lat !== "number" ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90
    ) {
      throw new Error(
        `Node ${i} has invalid latitude (must be finite in [-90, 90])`
      )
    }
  }

  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i]
    if (!edge || typeof edge !== "object") {
      throw new Error(`Edge at index ${i} is not an object`)
    }
    if (typeof edge.id !== "string") {
      throw new Error(`Edge ${i} must have a string id`)
    }
    if (
      typeof edge.from !== "number" ||
      !Number.isInteger(edge.from) ||
      edge.from < 0 ||
      edge.from >= nodeCount
    ) {
      throw new Error(
        `Edge ${i} has invalid from=${String(edge.from)} (nodeCount=${nodeCount})`
      )
    }
    if (
      typeof edge.to !== "number" ||
      !Number.isInteger(edge.to) ||
      edge.to < 0 ||
      edge.to >= nodeCount
    ) {
      throw new Error(
        `Edge ${i} has invalid to=${String(edge.to)} (nodeCount=${nodeCount})`
      )
    }
    if (edge.from === edge.to) {
      throw new Error(`Edge ${i} is a self-loop (from === to === ${edge.from})`)
    }
    if (
      typeof edge.lengthMeters !== "number" ||
      !Number.isFinite(edge.lengthMeters) ||
      edge.lengthMeters < 0
    ) {
      throw new Error(
        `Edge ${i} has invalid lengthMeters=${String(edge.lengthMeters)}`
      )
    }
    if (!Array.isArray(edge.restrictions)) {
      throw new Error(`Edge ${i} restrictions must be an array`)
    }
    for (let j = 0; j < edge.restrictions.length; j++) {
      const r = edge.restrictions[j]
      if (!r || typeof r !== "object") {
        throw new Error(`Edge ${i} restriction ${j} is not an object`)
      }
      if (!RESTRICTION_KINDS.has(r.kind)) {
        throw new Error(
          `Edge ${i} restriction ${j} has invalid kind ${String(r.kind)}`
        )
      }
      if (r.startsAt != null && typeof r.startsAt !== "number") {
        throw new Error(
          `Edge ${i} restriction ${j} startsAt must be a number if present`
        )
      }
      if (r.endsAt != null && typeof r.endsAt !== "number") {
        throw new Error(
          `Edge ${i} restriction ${j} endsAt must be a number if present`
        )
      }
    }
  }

  const seenOrders = new Set<number>()
  for (let i = 0; i < graph.shapingPoints.length; i++) {
    const sp = graph.shapingPoints[i]
    if (!sp || typeof sp !== "object") {
      throw new Error(`Shaping point ${i} is not an object`)
    }
    if (typeof sp.id !== "string") {
      throw new Error(`Shaping point ${i} must have a string id`)
    }
    if (
      typeof sp.nodeIndex !== "number" ||
      !Number.isInteger(sp.nodeIndex) ||
      sp.nodeIndex < 0 ||
      sp.nodeIndex >= nodeCount
    ) {
      throw new Error(
        `Shaping point ${i} references invalid nodeIndex ${String(sp.nodeIndex)}`
      )
    }
    if (typeof sp.order !== "number" || !Number.isFinite(sp.order)) {
      throw new Error(
        `Shaping point ${i} has invalid order ${String(sp.order)}`
      )
    }
    if (seenOrders.has(sp.order)) {
      throw new Error(
        `Shaping point ${i} has duplicate order ${String(sp.order)}`
      )
    }
    seenOrders.add(sp.order)
  }
}

/**
 * Returns true if the given edge is open at the reference time, considering
 * its {@link OfflineGraphRestriction restrictions}. Closures with null
 * end time are considered indefinite.
 *
 * A restriction is "active" at `atEpochMillis` when:
 * - `startsAt` is null/undefined (always active), OR
 * - `atEpochMillis >= startsAt` AND (`endsAt` is null/undefined OR
 *   `atEpochMillis < endsAt`).
 *
 * Only closure-kind restrictions (`no-through`, `seasonal-closure`,
 * `weight-limit`, `access-permit-required`) close the edge. The
 * `one-way` kind is directional and never closes the edge here — the
 * A* worker consults it separately via `respectOneWay`.
 */
export function isEdgeOpenAt(edge: OfflineGraphEdge, atEpochMillis: number): boolean {
  if (!edge || !Array.isArray(edge.restrictions)) return true
  for (const r of edge.restrictions) {
    if (!r) continue
    if (!CLOSURE_KINDS.has(r.kind)) continue
    const startsAt = r.startsAt
    const endsAt = r.endsAt
    let active: boolean
    if (startsAt == null) {
      active = true
    } else if (atEpochMillis < startsAt) {
      active = false
    } else if (endsAt == null) {
      active = true
    } else {
      active = atEpochMillis < endsAt
    }
    if (active) return false
  }
  return true
}
