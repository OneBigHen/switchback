import { describe, expect, it } from "vitest"
import { extractCorridorGraph } from "@/lib/offline/corridor-extractor"
import type { OfflineGraph } from "@/lib/offline/graph"
import { OFFLINE_GRAPH_SCHEMA_VERSION } from "@/lib/offline/graph"
import type { CorridorManifest, CorridorManifestSegment } from "@/lib/offline/corridor-manifest"

import type { Coordinate } from "@/lib/routing/types"

const PT_A: Coordinate = [-76.9, 40.25]
const PT_B: Coordinate = [-76.8, 40.35]

function makeManifest(segments: CorridorManifestSegment[]): CorridorManifest {
  return {
    schemaVersion: 1 as const,
    routeId: "test-route",
    routeName: "Test Route",
    builtAt: new Date().toISOString(),
    settings: {
      corridorWidthMeters: 500,
      maxGraphSegments: 10,
      maxEstimatedBytes: 10_000_000,
      sampleSpacingMeters: 100
    },
    centerline: segments.flatMap((s) => s.centerline),
    bounds: { minLon: -77, minLat: 40, maxLon: -76, maxLat: 41 },
    segments,
    estimatedBytes: 1000,
    truncated: false
  }
}

function simpleRegionGraph(): OfflineGraph {
  return {
    schemaVersion: OFFLINE_GRAPH_SCHEMA_VERSION,
    nodes: [
      { index: 0, coordinate: [-76.9, 40.25] },
      { index: 1, coordinate: [-76.85, 40.30] },
      { index: 2, coordinate: [-76.80, 40.35] },
      { index: 3, coordinate: [-75.00, 41.00] } // far away
    ],
    edges: [
      { id: "e0", from: 0, to: 1, lengthMeters: 100, restrictions: [] },
      { id: "e1", from: 1, to: 2, lengthMeters: 100, restrictions: [] },
      { id: "e2", from: 2, to: 3, lengthMeters: 100, restrictions: [] }, // has far endpoint
      { id: "e3", from: 0, to: 2, lengthMeters: 200, restrictions: [] }
    ],
    shapingPoints: [],
    provenance: { routeId: "test", builtAt: new Date().toISOString() }
  }
}

describe("corridor extractor", () => {
  const center: Array<{ centerline: Coordinate[]; halfWidthMeters: number }> = [
    { centerline: [PT_A, PT_B], halfWidthMeters: 500 }
  ]

  it("extracts nodes within corridor of a simple graph", () => {
    const manifest = makeManifest([{ sourceEdgeIndex: 0, ...center[0]! }])
    const { result } = extractCorridorGraph(simpleRegionGraph(), manifest)
    expect(result).not.toBeNull()
    expect(result!.nodeCount).toBeGreaterThanOrEqual(1)
    expect(result!.nodeCount).toBeLessThanOrEqual(3)
    expect(result!.edgeCount).toBeGreaterThanOrEqual(1)
    expect(result!.ignoredNodesOutside).toBeGreaterThanOrEqual(1)
  })

  it("reindexes nodes starting from 0 in the output graph", () => {
    const manifest = makeManifest([{ sourceEdgeIndex: 0, ...center[0]! }])
    const { result } = extractCorridorGraph(simpleRegionGraph(), manifest)
    expect(result).not.toBeNull()
    const indices = result!.graph.nodes.map((n) => n.index)
    expect(indices[0]).toBe(0)
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBe(indices[i - 1]! + 1)
    }
  })

  it("reindexes edge endpoints to match new node indices", () => {
    const manifest = makeManifest([{ sourceEdgeIndex: 0, ...center[0]! }])
    const { result } = extractCorridorGraph(simpleRegionGraph(), manifest)
    const nodeCount = result!.graph.nodes.length
    for (const edge of result!.graph.edges) {
      expect(edge.from).toBeGreaterThanOrEqual(0)
      expect(edge.from).toBeLessThan(nodeCount)
      expect(edge.to).toBeGreaterThanOrEqual(0)
      expect(edge.to).toBeLessThan(nodeCount)
    }
  })

  it("returns error for empty manifest segments", () => {
    const manifest = makeManifest([])
    const { result, error } = extractCorridorGraph(simpleRegionGraph(), manifest)
    expect(result).toBeNull()
    expect(error).toContain("no segments")
  })

  it("returns error for empty region graph", () => {
    const manifest = makeManifest([{ sourceEdgeIndex: 0, ...center[0]! }])
    const empty: OfflineGraph = { schemaVersion: OFFLINE_GRAPH_SCHEMA_VERSION, nodes: [], edges: [], shapingPoints: [] }
    const { result, error } = extractCorridorGraph(empty, manifest)
    expect(result).toBeNull()
    expect(error).toContain("no nodes")
  })

  it("includes provenance from manifest in output graph", () => {
    const manifest = makeManifest([{ sourceEdgeIndex: 0, ...center[0]! }])
    const { result } = extractCorridorGraph(simpleRegionGraph(), manifest)
    expect(result!.graph.provenance).toEqual({
      routeId: "test-route",
      builtAt: manifest.builtAt
    })
  })

  it("returns error when no nodes fall within corridor", () => {
    const farPoints: Coordinate[] = [[-75.5, 41.5], [-75.6, 41.6]]
    const manifest = makeManifest([
      { sourceEdgeIndex: 0, centerline: farPoints, halfWidthMeters: 10 }
    ])
    const { result, error } = extractCorridorGraph(simpleRegionGraph(), manifest)
    expect(result).toBeNull()
    expect(error).toContain("no graph nodes found within corridor")
  })
})
