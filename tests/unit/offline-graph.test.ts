import { describe, expect, it } from "vitest"

import {
  buildOfflineGraphAdjacency,
  isEdgeOpenAt,
  validateOfflineGraph,
  type OfflineGraph,
  type OfflineGraphEdge
} from "@/lib/offline/graph"
import { findOfflinePath } from "@/lib/offline/a-star"

const T1 = 1_000_000
const T2 = 2_000_000

function triangleGraph(): OfflineGraph {
  // 3 nodes A=0, B=1, C=2 forming a triangle with one edge per side
  // (directed A→B, B→C, A→C). Lengths chosen so each edge is ≥ the
  // haversine between its endpoints, keeping heuristics admissible.
  return {
    schemaVersion: 1,
    nodes: [
      { index: 0, coordinate: [0, 0] },
      { index: 1, coordinate: [0.0001, 0] },
      { index: 2, coordinate: [0, 0.0001] }
    ],
    edges: [
      { id: "A_B", from: 0, to: 1, lengthMeters: 100, restrictions: [] },
      { id: "B_C", from: 1, to: 2, lengthMeters: 100, restrictions: [] },
      { id: "A_C", from: 0, to: 2, lengthMeters: 150, restrictions: [] }
    ],
    shapingPoints: []
  }
}

function diamondGraph(): OfflineGraph {
  // 4-node diamond: A=0, B=1, C=2, D=3.
  // Three candidate paths A→D:
  //   A→B→D = 100 + 100 = 200  (shortest)
  //   A→C→D = 200 + 200 = 400
  //   A→D   = 500              (direct)
  return {
    schemaVersion: 1,
    nodes: [
      { index: 0, coordinate: [0, 0] },
      { index: 1, coordinate: [0.0001, 0] },
      { index: 2, coordinate: [0, 0.0001] },
      { index: 3, coordinate: [0.0001, 0.0001] }
    ],
    edges: [
      { id: "A_B", from: 0, to: 1, lengthMeters: 100, restrictions: [] },
      { id: "A_C", from: 0, to: 2, lengthMeters: 200, restrictions: [] },
      { id: "B_D", from: 1, to: 3, lengthMeters: 100, restrictions: [] },
      { id: "C_D", from: 2, to: 3, lengthMeters: 200, restrictions: [] },
      { id: "A_D", from: 0, to: 3, lengthMeters: 500, restrictions: [] }
    ],
    shapingPoints: []
  }
}

function linearGraph4(): OfflineGraph {
  // A=0 → B=1 → C=2 → D=3
  return {
    schemaVersion: 1,
    nodes: [
      { index: 0, coordinate: [0, 0] },
      { index: 1, coordinate: [0.0001, 0] },
      { index: 2, coordinate: [0.0002, 0] },
      { index: 3, coordinate: [0.0003, 0] }
    ],
    edges: [
      { id: "A_B", from: 0, to: 1, lengthMeters: 100, restrictions: [] },
      { id: "B_C", from: 1, to: 2, lengthMeters: 100, restrictions: [] },
      { id: "C_D", from: 2, to: 3, lengthMeters: 100, restrictions: [] }
    ],
    shapingPoints: []
  }
}

describe("buildOfflineGraphAdjacency", () => {
  it("1. produces correct outgoing/incoming lists for a 3-node triangle", () => {
    const graph = triangleGraph()
    const adj = buildOfflineGraphAdjacency(graph)
    expect(adj.outgoing).toEqual([[0, 2], [1], []])
    expect(adj.incoming).toEqual([[], [0], [1, 2]])
  })
})

describe("validateOfflineGraph", () => {
  it("2a. throws on missing node index", () => {
    const graph = triangleGraph()
    graph.nodes[1]!.index = 99
    expect(() => validateOfflineGraph(graph)).toThrow(/mismatched index/)
  })

  it("2b. throws on edge with bad from", () => {
    const graph = triangleGraph()
    graph.edges[0]!.from = 999
    expect(() => validateOfflineGraph(graph)).toThrow(/invalid from/)
  })

  it("2c. throws on self-loop", () => {
    const graph = triangleGraph()
    graph.edges[0]!.to = graph.edges[0]!.from
    expect(() => validateOfflineGraph(graph)).toThrow(/self-loop/)
  })

  it("2d. throws on NaN coordinate", () => {
    const graph = triangleGraph()
    graph.nodes[1]!.coordinate = [Number.NaN, 0]
    expect(() => validateOfflineGraph(graph)).toThrow(/non-finite longitude/)
  })

  it("2e. throws on duplicate shaping-point order", () => {
    const graph = triangleGraph()
    graph.shapingPoints = [
      { id: "sp1", nodeIndex: 0, order: 1 },
      { id: "sp2", nodeIndex: 1, order: 1 }
    ]
    expect(() => validateOfflineGraph(graph)).toThrow(/duplicate order/)
  })
})

describe("isEdgeOpenAt", () => {
  it("3. returns true for unrestricted, false in active closure window, true after", () => {
    const noRestrictions: OfflineGraphEdge = {
      id: "e",
      from: 0,
      to: 1,
      lengthMeters: 10,
      restrictions: []
    }
    expect(isEdgeOpenAt(noRestrictions, T1)).toBe(true)

    const seasonal: OfflineGraphEdge = {
      id: "e2",
      from: 0,
      to: 1,
      lengthMeters: 10,
      restrictions: [
        { kind: "seasonal-closure", startsAt: T1, endsAt: T2 }
      ]
    }
    // Before the window opens.
    expect(isEdgeOpenAt(seasonal, T1 - 1)).toBe(true)
    // Inside the window — closed.
    expect(isEdgeOpenAt(seasonal, T1)).toBe(false)
    expect(isEdgeOpenAt(seasonal, T1 + 1)).toBe(false)
    expect(isEdgeOpenAt(seasonal, T2 - 1)).toBe(false)
    // Window lifts — open again.
    expect(isEdgeOpenAt(seasonal, T2)).toBe(true)
  })

  it("treats null end time as indefinite closure", () => {
    const indefinite: OfflineGraphEdge = {
      id: "e3",
      from: 0,
      to: 1,
      lengthMeters: 10,
      restrictions: [
        { kind: "seasonal-closure", startsAt: T1, endsAt: null }
      ]
    }
    expect(isEdgeOpenAt(indefinite, T1 - 1)).toBe(true)
    expect(isEdgeOpenAt(indefinite, T1)).toBe(false)
    expect(isEdgeOpenAt(indefinite, Number.MAX_SAFE_INTEGER)).toBe(false)
  })
})

describe("findOfflinePath", () => {
  it("4. returns the trivial zero-cost path when start === goal and no shaping points", () => {
    const graph = triangleGraph()
    const adj = buildOfflineGraphAdjacency(graph)
    const { result, failure } = findOfflinePath(
      graph,
      adj,
      1,
      1,
      { atEpochMillis: T1 }
    )
    expect(failure).toBeNull()
    expect(result).toEqual({
      totalMeters: 0,
      nodeIndices: [1],
      edgeIds: [],
      visitedCount: 1
    })
  })

  it("5. finds the shortest path in a 4-node diamond graph", () => {
    const graph = diamondGraph()
    const adj = buildOfflineGraphAdjacency(graph)
    const { result, failure } = findOfflinePath(
      graph,
      adj,
      0,
      3,
      { atEpochMillis: T1 }
    )
    expect(failure).toBeNull()
    expect(result).not.toBeNull()
    expect(result!.nodeIndices).toEqual([0, 1, 3])
    expect(result!.totalMeters).toBe(200)
    expect(result!.edgeIds).toEqual(["A_B", "B_D"])
  })

  it("6. returns no_path when an isolated node has no connecting edges", () => {
    const graph: OfflineGraph = {
      schemaVersion: 1,
      nodes: [
        { index: 0, coordinate: [0, 0] },
        { index: 1, coordinate: [0.0001, 0] },
        { index: 2, coordinate: [0.0002, 0] }
      ],
      edges: [
        { id: "A_B", from: 0, to: 1, lengthMeters: 100, restrictions: [] }
      ],
      shapingPoints: []
    }
    const adj = buildOfflineGraphAdjacency(graph)
    const { result, failure } = findOfflinePath(
      graph,
      adj,
      0,
      2,
      { atEpochMillis: T1 }
    )
    expect(result).toBeNull()
    expect(failure).not.toBeNull()
    expect(failure!.kind).toBe("no_path")
  })

  it("7. respects one-way restrictions when respectOneWay: true", () => {
    const graph: OfflineGraph = {
      schemaVersion: 1,
      nodes: [
        { index: 0, coordinate: [0, 0] },
        { index: 1, coordinate: [0.0001, 0] }
      ],
      edges: [
        {
          id: "A_B_OW",
          from: 0,
          to: 1,
          lengthMeters: 100,
          restrictions: [{ kind: "one-way" }]
        }
      ],
      shapingPoints: []
    }
    const adj = buildOfflineGraphAdjacency(graph)

    // Forward direction (A→B) — traversable.
    const forward = findOfflinePath(graph, adj, 0, 1, {
      atEpochMillis: T1,
      respectOneWay: true
    })
    expect(forward.failure).toBeNull()
    expect(forward.result!.nodeIndices).toEqual([0, 1])

    // Reverse direction (B→A) with respectOneWay — blocked.
    const reverseBlocked = findOfflinePath(graph, adj, 1, 0, {
      atEpochMillis: T1,
      respectOneWay: true
    })
    expect(reverseBlocked.result).toBeNull()
    expect(reverseBlocked.failure!.kind).toBe("no_path")

    // Reverse direction with respectOneWay: false — allowed.
    const reverseAllowed = findOfflinePath(graph, adj, 1, 0, {
      atEpochMillis: T1,
      respectOneWay: false
    })
    expect(reverseAllowed.failure).toBeNull()
    expect(reverseAllowed.result!.nodeIndices).toEqual([1, 0])
  })

  it("8. enforces shaping-point ordering on a linear A→B→C→D graph", () => {
    const graph = linearGraph4()
    graph.shapingPoints = [
      { id: "sp_B", nodeIndex: 1, order: 1 },
      { id: "sp_C", nodeIndex: 2, order: 2 }
    ]
    const adj = buildOfflineGraphAdjacency(graph)
    const { result, failure } = findOfflinePath(
      graph,
      adj,
      0,
      3,
      { atEpochMillis: T1 }
    )
    expect(failure).toBeNull()
    expect(result).not.toBeNull()
    expect(result!.nodeIndices).toEqual([0, 1, 2, 3])
    expect(result!.totalMeters).toBe(300)
    expect(result!.edgeIds).toEqual(["A_B", "B_C", "C_D"])
  })

  it("9. returns max_visited when maxVisitedNodes: 1 and goal is > 1 hop away", () => {
    const graph = linearGraph4()
    const adj = buildOfflineGraphAdjacency(graph)
    const { result, failure } = findOfflinePath(
      graph,
      adj,
      0,
      3,
      { atEpochMillis: T1, maxVisitedNodes: 1 }
    )
    expect(result).toBeNull()
    expect(failure).not.toBeNull()
    expect(failure!.kind).toBe("max_visited")
    expect((failure as { visited: number }).visited).toBeGreaterThan(1)
  })

  it("10. returns invalid_nodes when startNodeIndex is out of range", () => {
    const graph = triangleGraph()
    const adj = buildOfflineGraphAdjacency(graph)
    const { result, failure } = findOfflinePath(
      graph,
      adj,
      999,
      1,
      { atEpochMillis: T1 }
    )
    expect(result).toBeNull()
    expect(failure).not.toBeNull()
    expect(failure!.kind).toBe("invalid_nodes")
  })

  it("11. returns invalid_graph when given a graph with a self-loop edge", () => {
    const graph = triangleGraph()
    graph.edges.push({
      id: "self",
      from: 1,
      to: 1,
      lengthMeters: 0,
      restrictions: []
    })
    const adj = buildOfflineGraphAdjacency(graph)
    const { result, failure } = findOfflinePath(
      graph,
      adj,
      0,
      2,
      { atEpochMillis: T1 }
    )
    expect(result).toBeNull()
    expect(failure).not.toBeNull()
    expect(failure!.kind).toBe("invalid_graph")
    expect(failure!.message).toMatch(/self-loop/)
  })

  it("12a. skips closed edges and finds an alternate path", () => {
    // 4-node diamond: A→B→D, A→C→D, A→D direct. Close the A→C and C→D
    // edges (seasonal closure) so the worker must go A→B→D.
    const graph = diamondGraph()
    graph.edges[1]!.restrictions = [
      { kind: "seasonal-closure", startsAt: T1, endsAt: T2 }
    ]
    graph.edges[3]!.restrictions = [
      { kind: "seasonal-closure", startsAt: T1, endsAt: T2 }
    ]
    const adj = buildOfflineGraphAdjacency(graph)
    const { result, failure } = findOfflinePath(
      graph,
      adj,
      0,
      3,
      { atEpochMillis: T1 + 1 }
    )
    expect(failure).toBeNull()
    expect(result).not.toBeNull()
    expect(result!.nodeIndices).toEqual([0, 1, 3])
    expect(result!.totalMeters).toBe(200)
  })

  it("12b. returns no_path when all routes go through a closed edge", () => {
    // Linear A→B→C. Close A→B at T1. Searching A→C has no other route.
    const graph: OfflineGraph = {
      schemaVersion: 1,
      nodes: [
        { index: 0, coordinate: [0, 0] },
        { index: 1, coordinate: [0.0001, 0] },
        { index: 2, coordinate: [0.0002, 0] }
      ],
      edges: [
        {
          id: "A_B",
          from: 0,
          to: 1,
          lengthMeters: 100,
          restrictions: [
            { kind: "seasonal-closure", startsAt: T1, endsAt: T2 }
          ]
        },
        { id: "B_C", from: 1, to: 2, lengthMeters: 100, restrictions: [] }
      ],
      shapingPoints: []
    }
    const adj = buildOfflineGraphAdjacency(graph)
    const { result, failure } = findOfflinePath(
      graph,
      adj,
      0,
      2,
      { atEpochMillis: T1 + 1 }
    )
    expect(result).toBeNull()
    expect(failure).not.toBeNull()
    expect(failure!.kind).toBe("no_path")
  })
})
