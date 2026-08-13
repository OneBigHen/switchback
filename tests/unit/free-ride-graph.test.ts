import { describe, expect, it } from "vitest"
import { createCanonicalSegment } from "@/lib/roads/canonical-segments"
import { buildFreeRideGraph, findFreeRideOpportunities, reachableHorizonMeters } from "@/lib/recommendation/free-ride-graph"
import type { RigCorridor } from "@/lib/roads/rig-corridors"

const builtAt = "2026-08-11T12:00:00.000Z"

async function segment(
  way: string,
  from: string,
  to: string,
  geometry: [[number, number], [number, number]]
) {
  return createCanonicalSegment({
    osmWayId: way,
    fromOsmNodeId: from,
    toOsmNodeId: to,
    direction: "forward",
    osmSnapshot: "2026-08-01",
    topologyVersion: "graph-1",
    geometry
  })
}

async function graphFixture() {
  const [approach, approach2, corridor1, corridor2, rejoin] = await Promise.all([
    segment("1", "100", "101", [[-77.1, 40.1], [-77.09, 40.1]]),
    segment("2", "101", "102", [[-77.09, 40.1], [-77.08, 40.1]]),
    segment("3", "102", "103", [[-77.08, 40.1], [-77.075, 40.105]]),
    segment("4", "103", "104", [[-77.075, 40.105], [-77.07, 40.11]]),
    segment("5", "104", "105", [[-77.07, 40.11], [-77.065, 40.115]])
  ])
  const corridor: RigCorridor = {
    corridorId: "corridor-gravel",
    segmentUids: [corridor1.segmentUid, corridor2.segmentUid],
    entryNodeId: "102",
    exitNodeId: "104",
    lengthMeters: corridor1.lengthMeters + corridor2.lengthMeters,
    expectedUtility: 0.9,
    confidence: 0.8,
    dominantRole: "highlight",
    dimensions: { gravelInterest: 0.95, scenicProxy: 0.8 },
    bounds: { minLon: -77.08, minLat: 40.1, maxLon: -77.07, maxLat: 40.11 },
    provenance: {
      sourceBuild: "test-build",
      builtAt,
      segmentCount: 2,
      observationCount: 4,
      independentSourceCount: 2
    }
  }
  return buildFreeRideGraph({
    schemaVersion: 1,
    sourceBuild: "test-build",
    graphVersion: "graph-1",
    builtAt,
    segments: [approach, approach2, corridor1, corridor2, rejoin],
    corridors: [corridor]
  })
}

describe("graph-backed Free Ride reachability", () => {
  it("finds an ahead corridor only when directed edges reach it and a forward rejoin exists", async () => {
    const graph = await graphFixture()
    const opportunities = findFreeRideOpportunities(graph, [-77.099, 40.1], 90, 30)

    expect(opportunities).toHaveLength(1)
    expect(opportunities[0]).toMatchObject({
      id: "rig-test-build-corridor-gravel",
      triggerDistanceMeters: expect.any(Number),
      via: [[-77.08, 40.1], [-77.07, 40.11]],
      destination: [-77.065, 40.115]
    })
    expect(opportunities[0]!.triggerDistanceMeters).toBeGreaterThan(400)
  })

  it("rejects a corridor behind the current directed heading", async () => {
    const graph = await graphFixture()

    expect(findFreeRideOpportunities(graph, [-77.099, 40.1], 270, 30)).toEqual([])
  })

  it("keeps the reachable horizon speed-sensitive and bounded", () => {
    expect(reachableHorizonMeters(20)).toBe(6 * 1_609.344)
    expect(reachableHorizonMeters(50)).toBe(16 * 1_609.344)
    expect(reachableHorizonMeters(90)).toBe(22 * 1_609.344)
  })
})
