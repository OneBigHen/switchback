import { describe, expect, it, vi } from "vitest"
import { createHybridRouteProvider } from "@/lib/routing/hybrid"
import type { RoutingResult } from "@/lib/routing/planner"
import { normalizeRouteRequest } from "@/lib/domain/routing/normalized-request"
import type { PlannedRoute, RouteRequest } from "@/lib/routing/types"
import { GraphHopperProviderError } from "@/lib/routing/graphhopper-response"

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

  it("does not fall back to Valhalla after a cancelled GraphHopper request", async () => {
    const cancelled = new GraphHopperProviderError("Route planning was cancelled.", "ROUTE_CANCELLED", 499)
    const graphHopper = vi.fn(async () => { throw cancelled })
    const valhalla = vi.fn(async () => result("valhalla", [candidate("vh-cancelled")]))
    const provider = createHybridRouteProvider({ graphHopper, valhalla })

    await expect(provider(normalizeRouteRequest(request), {
      signal: new AbortController().signal
    })).rejects.toBe(cancelled)
    expect(valhalla).not.toHaveBeenCalled()
  })

  it("preserves a normalized route score while attaching hybrid provenance", async () => {
    const score = { total: 7 } as PlannedRoute["routeScore"]
    const graphHopper = vi.fn(async () => result("graphhopper", [{ ...candidate("scored"), routeScore: score }]))
    const provider = createHybridRouteProvider({ graphHopper })

    const response = await provider(normalizeRouteRequest(request))

    expect(response.routes[0]?.routeScore).toBe(score)
    expect(response.routes[0]?.provider).toBe("graphhopper")
  })
})
