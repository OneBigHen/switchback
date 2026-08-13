import { describe, expect, it } from "vitest"

import type { OfflineGraphTileV2 } from "@/lib/offline/v2-contracts"
import { offlineProfileWeight, routeOfflineV2 } from "@/lib/offline/v2-router"

function edge(id: string, from: string, to: string, way: string, quick = 100, scenic = quick) {
    const coordinates: Record<string, [number, number]> = {
      a: [-76, 40], b: [-75.99, 40], c: [-75.98, 40], d: [-75.99, 40.01],
      e: [-76.0005, 40.0005], f: [-76.001, 40.0005], g: [-75.9805, 40.0005]
  }
  return {
    id,
    fromNodeId: from,
    toNodeId: to,
    geometry: [coordinates[from], coordinates[to]] as [[number, number], [number, number]],
    osmWayId: way,
    motorcycleAccess: "permitted" as const,
    access: "permitted" as const,
    roadClass: "tertiary" as const,
    surface: "asphalt" as const,
    profileWeights: { quick, twisty: quick, scenic, adventure: scenic },
    uncertainty: []
  }
}

function tile(): OfflineGraphTileV2 {
  return {
    schemaVersion: 2,
    tileId: "fixture",
    bounds: { minLon: -76.1, minLat: 39.9, maxLon: -75.9, maxLat: 40.1 },
    nodes: [
      { id: "a", coordinate: [-76, 40] },
      { id: "b", coordinate: [-75.99, 40] },
      { id: "c", coordinate: [-75.98, 40] },
      { id: "d", coordinate: [-75.99, 40.01] }
    ],
    edges: [
      edge("ab", "a", "b", "10", 10, 10),
      edge("ba", "b", "a", "10", 10, 10),
      edge("bc", "b", "c", "11", 10, 50),
      edge("cb", "c", "b", "11", 10, 50),
      edge("bd", "b", "d", "12", 30, 5),
      edge("dc", "d", "c", "12", 30, 5),
      edge("db", "d", "b", "12", 30, 5),
      edge("cd", "c", "d", "12", 30, 5)
    ],
    turnRestrictions: []
  }
}

const request = {
  start: [-76, 40] as [number, number],
  finish: [-75.98, 40] as [number, number],
  profile: "quick" as const,
  bikeCompatibility: "dual-sport" as const,
  requiredRegionIds: ["pennsylvania"],
  installedRegionIds: ["pennsylvania"]
}

describe("offline v2 router", () => {
  it("routes over directed edges and returns road geometry, never a straight fallback", () => {
    const result = routeOfflineV2([tile()], request)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.edgeIds).toEqual(["ab", "bc"])
      expect(result.geometry).toEqual([[-76, 40], [-75.99, 40], [-75.98, 40]])
    }
  })

  it("enforces incoming-edge-aware no-turn restrictions", () => {
    const graph = tile()
    graph.turnRestrictions = [{
      incomingEdgeId: "ab",
      viaNodeId: "b",
      outgoingEdgeId: "bc",
      restriction: "no_turn"
    }]
    const result = routeOfflineV2([graph], request)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.edgeIds).toEqual(["ab", "bd", "dc"])
  })

  it("uses profile weights and applicable road locks", () => {
    const scenic = routeOfflineV2([tile()], { ...request, profile: "scenic" })
    expect(scenic.ok && scenic.edgeIds).toEqual(["ab", "bd", "dc"])

    const avoid = routeOfflineV2([tile()], {
      ...request,
      roadLocks: [{ osmWayId: "11", mode: "avoid" }]
    })
    expect(avoid.ok && avoid.edgeIds).toEqual(["ab", "bd", "dc"])
  })

  it("resolves all eight product profiles onto stable offline primitives", () => {
    const candidate = tile().edges.find((item) => item.id === "bc")!
    candidate.surface = "gravel"
    candidate.profileWeights = { quick: 10, twisty: 50, scenic: 60, adventure: 70 }
    expect(offlineProfileWeight(candidate, "quick")).toBe(10)
    expect(offlineProfileWeight(candidate, "balanced")).toBe(30)
    expect(offlineProfileWeight(candidate, "twisty")).toBe(50)
    expect(offlineProfileWeight(candidate, "scenic")).toBe(60)
    expect(offlineProfileWeight(candidate, "adventure")).toBe(70)
    expect(offlineProfileWeight(candidate, "gravel")).toBe(57.4)
    expect(offlineProfileWeight(candidate, "avoid-highways")).toBe(10)
    expect(offlineProfileWeight(candidate, "neural")).toBe(53.5)

    candidate.roadClass = "trunk"
    expect(offlineProfileWeight(candidate, "adventure")).toBe(560)
    expect(offlineProfileWeight(candidate, "gravel")).toBe(459.2)
  })

  it("treats the Avoid Highways profile as a hard motorway/trunk penalty", () => {
    const graph = tile()
    graph.edges.find((item) => item.id === "bc")!.roadClass = "motorway"
    const result = routeOfflineV2([graph], { ...request, profile: "avoid-highways" })
    expect(result.ok && result.edgeIds).toEqual(["ab", "bd", "dc"])
  })

  it("supports shaping points in order", () => {
    const result = routeOfflineV2([tile()], {
      ...request,
      shapingPoints: [[-75.99, 40.01]]
    })
    expect(result.ok && result.edgeIds).toEqual(["ab", "bd", "dc"])
  })

  it("returns explicit missing-region, corrupt-data, out-of-coverage, and no-path failures", () => {
    expect(routeOfflineV2([tile()], { ...request, installedRegionIds: [] })).toMatchObject({
      ok: false, kind: "missing_region"
    })
    expect(routeOfflineV2([{ ...tile(), schemaVersion: 1 } as unknown as OfflineGraphTileV2], request)).toMatchObject({
      ok: false, kind: "corrupt_data"
    })
    expect(routeOfflineV2([tile()], { ...request, start: [0, 0] })).toMatchObject({
      ok: false, kind: "out_of_coverage"
    })

    const graph = tile()
    graph.edges = graph.edges.filter((candidate) => candidate.fromNodeId !== "b")
    expect(routeOfflineV2([graph], { ...request, maxSnapMeters: 100 })).toMatchObject({ ok: false, kind: "no_path" })
  })

  it("tries a farther legal snap when the nearest component cannot reach the finish", () => {
    const graph = tile()
    graph.nodes.push(
      { id: "e", coordinate: [-76.0005, 40.0005] },
      { id: "f", coordinate: [-76.001, 40.0005] }
    )
    graph.edges.push(
      edge("ef", "e", "f", "20"),
      edge("fe", "f", "e", "20")
    )
    const result = routeOfflineV2([graph], {
      ...request,
      start: [-76.0005, 40.0005],
      maxSnapMeters: 800
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.edgeIds).toEqual(["ab", "bc"])
  })

  it("prefers the nearest viable snap over a cheaper farther snap", () => {
    const graph = tile()
    graph.edges = graph.edges.filter((item) => !["bc", "bd", "dc", "cd", "db"].includes(item.id))
    graph.nodes.push(
      { id: "e", coordinate: [-76.0005, 40.0005] },
      { id: "f", coordinate: [-76.001, 40.0005] },
      { id: "g", coordinate: [-75.9805, 40.0005] }
    )
    graph.edges.push(
      edge("bg", "b", "g", "21", 1_000),
      edge("ef", "e", "f", "20", 1),
      edge("fg", "f", "g", "21", 1)
    )
    const result = routeOfflineV2([graph], {
      ...request,
      maxSnapMeters: 800
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.edgeIds).toEqual(["ab", "bg"])
  })

  it("keeps Street routes off tagged rough-surface edges", () => {
    const graph = tile()
    graph.edges.find((item) => item.id === "bc")!.surface = "gravel"
    const result = routeOfflineV2([graph], {
      ...request,
      bikeCompatibility: "street"
    })
    expect(result.ok && result.edgeIds).toEqual(["ab", "bd", "dc"])
  })

})
