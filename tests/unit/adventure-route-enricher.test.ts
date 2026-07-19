import { describe, expect, it, vi } from "vitest"
import { enrichAdventureRoutesWithPaData } from "@/lib/roads/adventure-route-enricher"
import type { PaUnpavedRoadFeatureCollection } from "@/lib/roads/types"
import type { PlannedRoute, RouteRequest } from "@/lib/routing/types"

function route(id: string, latitudeOffset = 0): PlannedRoute {
  return {
    id,
    name: id,
    profile: "adventure",
    geometry: [[-76.9, 40.2 + latitudeOffset], [-76.89, 40.2 + latitudeOffset]],
    waypoints: [],
    instructions: [],
    distanceMiles: 1,
    durationMinutes: 3,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 20,
    turnCount: 2,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

const request: RouteRequest = {
  profile: "adventure",
  points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.2, lon: -76.89 }]
}

function officialRoads(truncated = false): PaUnpavedRoadFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      id: "pa-unpaved-1",
      geometry: { type: "LineString", coordinates: [[-76.9, 40.2], [-76.89, 40.2]] },
      properties: {
        id: "pa-unpaved-1",
        county: "Dauphin",
        lengthMeters: null,
        source: "Pennsylvania Department of Environmental Protection",
        dataset: "Unpaved Roads 2009_07"
      }
    }],
    metadata: {
      count: 1,
      limit: 500,
      truncated,
      source: "Pennsylvania Department of Environmental Protection",
      dataset: "Unpaved Roads 2009_07"
    }
  }
}

describe("Adventure route official-road enrichment", () => {
  it("queries every candidate corridor once and attaches positive official evidence", async () => {
    const fetchRoads = vi.fn(async () => officialRoads())
    const routes = [route("official"), route("parallel", 0.002)]

    const result = await enrichAdventureRoutesWithPaData(request, routes, { fetchRoads })

    expect(fetchRoads).toHaveBeenCalledOnce()
    expect(fetchRoads).toHaveBeenCalledWith({
      paths: routes.map((candidate) => candidate.geometry),
      bufferMeters: 50,
      limit: 500
    })
    expect(result.routes[0].officialUnpavedEvidence?.sharePercent).toBe(100)
    expect(result.routes[1].officialUnpavedEvidence?.sharePercent).toBe(0)
    expect(result.warnings).toEqual([])
  })

  it("skips non-Adventure and out-of-Pennsylvania candidates", async () => {
    const fetchRoads = vi.fn(async () => officialRoads())
    const quickRequest = { ...request, profile: "quick" as const }
    const outside = route("outside")
    outside.geometry = [[-2.6, 54.8], [-2.5, 54.9]]

    expect((await enrichAdventureRoutesWithPaData(quickRequest, [route("quick")], { fetchRoads })).routes)
      .toHaveLength(1)
    expect((await enrichAdventureRoutesWithPaData(request, [outside], { fetchRoads })).routes)
      .toHaveLength(1)
    expect(fetchRoads).not.toHaveBeenCalled()
  })

  it("falls back unchanged when PASDA is unavailable or truncated", async () => {
    const routes = [route("candidate")]
    const unavailable = await enrichAdventureRoutesWithPaData(request, routes, {
      fetchRoads: vi.fn(async () => { throw new Error("provider down") })
    })
    const truncated = await enrichAdventureRoutesWithPaData(request, routes, {
      fetchRoads: vi.fn(async () => officialRoads(true))
    })

    expect(unavailable.routes).toEqual(routes)
    expect(unavailable.warnings.join(" ")).toMatch(/official PA unpaved-road scoring unavailable/i)
    expect(truncated.routes).toEqual(routes)
    expect(truncated.warnings.join(" ")).toMatch(/incomplete/i)
  })
})
