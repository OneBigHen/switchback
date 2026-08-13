import { describe, expect, it, vi } from "vitest"
import { createHybridRouteProvider } from "@/lib/routing/hybrid"
import type { RoutingResult } from "@/lib/routing/planner"
import { normalizeRouteRequest } from "@/lib/domain/routing/normalized-request"
import type { PlannedRoute, RouteRequest } from "@/lib/routing/types"

function candidate(id: string, latitudeOffset = 0): PlannedRoute {
  return {
    id,
    name: id,
    profile: "twisty",
    geometry: [[-76.9, 40.2 + latitudeOffset], [-76.7, 40.3 + latitudeOffset]],
    waypoints: [],
    instructions: [],
    distanceMiles: 20,
    durationMinutes: 35,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 50,
    turnCount: 12,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

const request: RouteRequest = {
  profile: "twisty",
  points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.3, lon: -76.7 }]
}

function result(engine: "graphhopper" | "valhalla", routes: PlannedRoute[]): RoutingResult {
  return { engine, engineVersion: engine === "graphhopper" ? "11.0" : "3.8.2", routes }
}

describe("hybrid route provider", () => {
  it("keeps a primary request on GraphHopper without calling optional Valhalla", async () => {
    const graphHopper = vi.fn(async () => result("graphhopper", [candidate("gh")]))
    const valhalla = vi.fn(async () => result("valhalla", [candidate("vh", 0.05)]))
    const provider = createHybridRouteProvider({ graphHopper, valhalla })

    await expect(provider(normalizeRouteRequest(request))).resolves.toMatchObject({
      engine: "graphhopper",
      routes: [
        expect.objectContaining({
          id: "gh",
          provider: "graphhopper",
          provenance: { provider: "graphhopper", version: "11.0", fallback: false }
        })
      ]
    })
    expect(valhalla).not.toHaveBeenCalled()
  })

  it("does not attempt optional Valhalla when GraphHopper succeeds, even if it would fail", async () => {
    const graphHopper = vi.fn(async () => result("graphhopper", [candidate("gh")]))
    const valhalla = vi.fn(async () => { throw new Error("Valhalla unavailable") })
    const provider = createHybridRouteProvider({ graphHopper, valhalla })

    const response = await provider(normalizeRouteRequest(request))
    expect(response.routes.map((route) => route.id)).toEqual(["gh"])
    expect(response.warnings).toBeUndefined()
    expect(valhalla).not.toHaveBeenCalled()
  })

  it("uses Valhalla as an explicit fallback for supported requests when GraphHopper fails", async () => {
    const provider = createHybridRouteProvider({
      graphHopper: async () => { throw new Error("GraphHopper unavailable") },
      valhalla: async () => result("valhalla", [candidate("vh")])
    })

    const response = await provider(normalizeRouteRequest(request))
    expect(response.routes[0]).toMatchObject({
      id: "vh",
      provider: "valhalla",
      provenance: {
        provider: "valhalla",
        version: "3.8.2",
        fallback: true,
        fallbackFrom: "graphhopper"
      }
    })
    expect(response.warnings?.join(" ")).toMatch(/GraphHopper.*fallback/i)
  })

  it("keeps native loops and Adventure evidence on GraphHopper", async () => {
    const graphHopper = vi.fn(async () => result("graphhopper", [candidate("gh-loop")]))
    const valhalla = vi.fn(async () => result("valhalla", [candidate("vh-loop")]))
    const provider = createHybridRouteProvider({ graphHopper, valhalla })

    await provider(normalizeRouteRequest({
      profile: "twisty",
      points: [{ lat: 40.2, lon: -76.9 }],
      roundTrip: { targetMinutes: 90, seed: 17, heading: 40 }
    }))
    await provider(normalizeRouteRequest({ ...request, profile: "adventure" }))

    expect(graphHopper).toHaveBeenCalledTimes(2)
    expect(valhalla).not.toHaveBeenCalled()
  })

  it("enriches alternatives but never a primary request", async () => {
    const enrich = vi.fn(async (routing: RoutingResult): Promise<RoutingResult> => ({
      ...routing,
      routes: routing.routes.map((route) => ({ ...route, ascentMeters: 321 }))
    }))
    const provider = createHybridRouteProvider({
      graphHopper: async () => result("graphhopper", [candidate("gh")]),
      enrich
    })

    // Primary: no elevation enrichment on the critical path.
    const primary = await provider(normalizeRouteRequest(request))
    expect(enrich).not.toHaveBeenCalled()
    expect(primary.routes[0].ascentMeters).toBeNull()

    // Alternatives: enrichment runs as background evidence.
    const alternatives = await provider(normalizeRouteRequest({ ...request, candidateSet: "alternatives" }))
    expect(enrich).toHaveBeenCalledOnce()
    expect(alternatives.routes.every((route) => route.ascentMeters === 321)).toBe(true)
  })
})
