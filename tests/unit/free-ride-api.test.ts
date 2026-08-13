import { describe, expect, it } from "vitest"
import { handleFreeRideSuggestions } from "@/app/api/free-ride/suggestions/handler"
import { createCanonicalSegment } from "@/lib/roads/canonical-segments"
import { buildFreeRideGraph } from "@/lib/recommendation/free-ride-graph"
import type { RigCorridor } from "@/lib/roads/rig-corridors"
import type { ScoreableRoute } from "@/lib/recommendation/route-score"

function request(body: unknown): Request {
  return new Request("http://switchback.test/api/free-ride/suggestions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })
}

async function graphFixture() {
  const [approach, approach2, corridor1, corridor2, rejoin] = await Promise.all([
    createCanonicalSegment({ osmWayId: "1", fromOsmNodeId: "100", toOsmNodeId: "101", direction: "forward", osmSnapshot: "2026-08-01", topologyVersion: "graph-1", geometry: [[-77.1, 40.1], [-77.09, 40.1]] }),
    createCanonicalSegment({ osmWayId: "2", fromOsmNodeId: "101", toOsmNodeId: "102", direction: "forward", osmSnapshot: "2026-08-01", topologyVersion: "graph-1", geometry: [[-77.09, 40.1], [-77.08, 40.1]] }),
    createCanonicalSegment({ osmWayId: "3", fromOsmNodeId: "102", toOsmNodeId: "103", direction: "forward", osmSnapshot: "2026-08-01", topologyVersion: "graph-1", geometry: [[-77.08, 40.1], [-77.075, 40.105]] }),
    createCanonicalSegment({ osmWayId: "4", fromOsmNodeId: "103", toOsmNodeId: "104", direction: "forward", osmSnapshot: "2026-08-01", topologyVersion: "graph-1", geometry: [[-77.075, 40.105], [-77.07, 40.11]] }),
    createCanonicalSegment({ osmWayId: "5", fromOsmNodeId: "104", toOsmNodeId: "105", direction: "forward", osmSnapshot: "2026-08-01", topologyVersion: "graph-1", geometry: [[-77.07, 40.11], [-77.065, 40.115]] })
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
      builtAt: "2026-08-11T12:00:00.000Z",
      segmentCount: 2,
      observationCount: 4,
      independentSourceCount: 2
    }
  }
  return buildFreeRideGraph({
    schemaVersion: 1,
    sourceBuild: "test-build",
    graphVersion: "graph-1",
    builtAt: "2026-08-11T12:00:00.000Z",
    segments: [approach, approach2, corridor1, corridor2, rejoin],
    corridors: [corridor]
  })
}

function routed(request: { origin: [number, number]; destination?: [number, number]; via?: [number, number][] }, detour: boolean): ScoreableRoute {
  const geometry: [number, number][] = detour
    ? [request.origin, request.via![0]!, [-77.075, 40.105], request.via![1]!, request.destination!]
    : [request.origin, request.destination!]
  return {
    id: detour ? "detour" : "baseline",
    geometry,
    distanceMeters: detour ? 4_000 : 3_000,
    durationSeconds: detour ? 720 : 600,
    confidence: 0.95,
    segments: [{
      segmentId: detour ? "detour-segment" : "baseline-segment",
      geometry,
      roadClass: "secondary",
      surface: "gravel",
      curvature: 0.9,
      curveDensity: 0.9,
      curveSeverity: 0.9,
      headingChangePerKilometer: 0.9,
      scenicProxy: 0.8,
      gravelSuitability: 0.9,
      legalAccess: "permitted",
      seasonalAccess: "open",
      dataConfidence: 0.95,
      novelty: 0.8,
      safetyFlags: [],
      distanceMeters: detour ? 4_000 : 3_000
    }]
  }
}

describe("Free Ride suggestion API", () => {
  it("refuses to synthesize a suggestion without graph-backed evidence", async () => {
    const response = await handleFreeRideSuggestions(request({
      position: [-77.1, 40.1],
      headingDegrees: 45,
      gpsConfidence: 0.95,
      workload: "low",
      profile: "neural"
    }))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FREE_RIDE_GRAPH_UNAVAILABLE" }
    })
  })

  it("still validates the GPS request at the API boundary", async () => {
    const response = await handleFreeRideSuggestions(request({
      position: [999, 40.1]
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_FREE_RIDE_REQUEST" }
    })
  })

  it("answers a quiet-period request without loading the graph or router", async () => {
    const response = await handleFreeRideSuggestions(request({
      position: [-77.1, 40.1],
      gpsConfidence: 0.95,
      workload: "low",
      cooldownUntil: Date.parse("2026-08-11T12:05:00.000Z")
    }), {
      now: () => "2026-08-11T12:00:00.000Z",
      graph: null,
      routeProvider: async () => { throw new Error("router should not be called during quiet time") }
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      suppressed: true,
      suppressionReason: "cooldown"
    })
  })

  it("returns only a provider-verified RIG detour with provenance and rejoin anchors", async () => {
    const graph = await graphFixture()
    const calls: Array<{ via?: [number, number][] }> = []
    const response = await handleFreeRideSuggestions(request({
      position: [-77.099, 40.1],
      headingDegrees: 90,
      speedMph: 30,
      gpsConfidence: 0.95,
      workload: "low",
      profile: "neural"
    }), {
      graph,
      now: () => "2026-08-11T12:00:00.000Z",
      routeProvider: async (routeRequest) => {
        calls.push({ via: routeRequest.via })
        return routed(routeRequest, Boolean(routeRequest.via?.length))
      }
    })

    expect(response.status).toBe(200)
    const body = await response.json() as { suggestion?: { via?: unknown[]; addedDurationSeconds: number; provenance?: Record<string, unknown> } }
    expect(body.suggestion).toMatchObject({
      addedDurationSeconds: 120,
      via: [[-77.08, 40.1], [-77.07, 40.11]],
      provenance: {
        source: "rig",
        corridorId: "corridor-gravel",
        sourceBuild: "test-build"
      }
    })
    expect(calls).toHaveLength(2)
    expect(calls.some((call) => call.via?.length === 2)).toBe(true)
  })
})
