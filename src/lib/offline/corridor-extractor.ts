import type { OfflineGraph, OfflineGraphEdge, OfflineGraphNode } from "@/lib/offline/graph"
import type { CorridorManifest, CorridorManifestSegment } from "@/lib/offline/corridor-manifest"

const EARTH_RADIUS_METERS = 6_371_000

function haversineMeters(lonA: number, latA: number, lonB: number, latB: number): number {
  const toRadians = (deg: number) => (deg * Math.PI) / 180
  const phiA = toRadians(latA)
  const phiB = toRadians(latB)
  const deltaPhi = toRadians(latB - latA)
  const deltaLambda = toRadians(lonB - lonA)
  const sinHalfPhi = Math.sin(deltaPhi / 2)
  const sinHalfLambda = Math.sin(deltaLambda / 2)
  const h = sinHalfPhi * sinHalfPhi + Math.cos(phiA) * Math.cos(phiB) * sinHalfLambda * sinHalfLambda
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}

function pointToSegmentDistanceMeters(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return haversineMeters(px, py, ax, ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const projX = ax + t * dx
  const projY = ay + t * dy
  return haversineMeters(px, py, projX, projY)
}

function isNodeInSegment(
  nodeLon: number, nodeLat: number,
  centerline: readonly { readonly 0: number; readonly 1: number }[],
  halfWidthMeters: number
): boolean {
  if (centerline.length < 2) {
    if (centerline.length === 1) {
      return haversineMeters(nodeLon, nodeLat, centerline[0]![0], centerline[0]![1]) <= halfWidthMeters
    }
    return false
  }
  for (let i = 0; i < centerline.length - 1; i++) {
    const a = centerline[i]!
    const b = centerline[i + 1]!
    const dist = pointToSegmentDistanceMeters(nodeLon, nodeLat, a[0], a[1], b[0], b[1])
    if (dist <= halfWidthMeters) return true
  }
  return false
}

function mergeSegments(segments: readonly CorridorManifestSegment[]): {
  centerlinePoints: Array<{ 0: number; 1: number }>
  halfWidthMeters: number
} {
  const points: Array<{ 0: number; 1: number }> = []
  let width = 200
  for (const seg of segments) {
    for (const pt of seg.centerline) {
      points.push({ 0: pt[0], 1: pt[1] })
    }
    width = seg.halfWidthMeters
  }
  return { centerlinePoints: points, halfWidthMeters: width }
}

export interface CorridorExtractionResult {
  graph: OfflineGraph
  nodeCount: number
  edgeCount: number
  ignoredNodesOutside: number
  ignoredEdgesOutside: number
  estimatedBytes: number
}

/**
 * Extract a bounded subgraph from a region graph that falls within the corridor
 * defined by the manifest. Only nodes whose coordinates are within
 * `halfWidthMeters` of any corridor centerline segment are included. Only edges
 * where both endpoints are included are retained.
 *
 * Pure: no I/O, no side effects.
 */
export function extractCorridorGraph(
  regionGraph: OfflineGraph,
  manifest: CorridorManifest
): { result: CorridorExtractionResult | null; error: string | null } {
  if (!regionGraph || !manifest) {
    return { result: null, error: "region graph and corridor manifest are required" }
  }
  if (manifest.segments.length === 0) {
    return { result: null, error: "corridor manifest has no segments" }
  }
  if (regionGraph.nodes.length === 0) {
    return { result: null, error: "region graph has no nodes" }
  }

  const { centerlinePoints, halfWidthMeters } = mergeSegments(manifest.segments)

  const nodeIndexMap = new Map<number, number>()
  const includedNodes: OfflineGraphNode[] = []
  let ignoredNodesOutside = 0

  for (const node of regionGraph.nodes) {
    const inside = isNodeInSegment(
      node.coordinate[0], node.coordinate[1],
      centerlinePoints, halfWidthMeters
    )
    if (inside) {
      nodeIndexMap.set(node.index, includedNodes.length)
      includedNodes.push({ ...node, index: includedNodes.length })
    } else {
      ignoredNodesOutside++
    }
  }

  if (includedNodes.length === 0) {
    return {
      result: null,
      error: "no graph nodes found within corridor boundaries"
    }
  }

  const includedEdges: OfflineGraphEdge[] = []
  let ignoredEdgesOutside = 0

  for (const edge of regionGraph.edges) {
    const fromNew = nodeIndexMap.get(edge.from)
    const toNew = nodeIndexMap.get(edge.to)
    if (fromNew !== undefined && toNew !== undefined) {
      includedEdges.push({ ...edge, from: fromNew, to: toNew })
    } else {
      ignoredEdgesOutside++
    }
  }

  if (includedEdges.length === 0) {
    return {
      result: null,
      error: "no edges connect corridor nodes (try widening the corridor)"
    }
  }

  const graph: OfflineGraph = {
    schemaVersion: regionGraph.schemaVersion,
    nodes: includedNodes,
    edges: includedEdges,
    shapingPoints: [],
    provenance: {
      routeId: manifest.routeId,
      builtAt: manifest.builtAt
    }
  }

  const estimatedBytes = new TextEncoder().encode(JSON.stringify(graph)).byteLength

  return {
    result: {
      graph,
      nodeCount: includedNodes.length,
      edgeCount: includedEdges.length,
      ignoredNodesOutside,
      ignoredEdgesOutside,
      estimatedBytes
    },
    error: null
  }
}
