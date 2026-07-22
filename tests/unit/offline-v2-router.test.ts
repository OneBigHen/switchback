import { describe, expect, it } from "vitest"

import type { OfflineGraphTileV2 } from "@/lib/offline/v2-contracts"
import { routeOfflineV2 } from "@/lib/offline/v2-router"

function edge(id: string, from: string, to: string, way: string, quick = 100, scenic = quick) {
  const coordinates: Record<string, [number, number]> = {
    a: [-76, 40], b: [-75.99, 40], c: [-75.98, 40], d: [-75.99, 40.01]
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
    expect(routeOfflineV2([graph], request)).toMatchObject({ ok: false, kind: "no_path" })
  })
})
