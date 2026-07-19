import { describe, expect, it, vi } from "vitest"
import { createHybridRouteProvider } from "@/lib/routing/hybrid"
import type { RoutingResult } from "@/lib/routing/planner"
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
  it("merges distinct GraphHopper and Valhalla candidates with provenance", async () => {
    const graphHopper = vi.fn(async () => result("graphhopper", [candidate("gh")]))
    const valhalla = vi.fn(async () => result("valhalla", [candidate("vh", 0.05)]))
    const provider = createHybridRouteProvider({ graphHopper, valhalla })

    await expect(provider(request)).resolves.toMatchObject({
      engine: "hybrid",
      routes: [
        expect.objectContaining({ id: "gh", provider: "graphhopper" }),
        expect.objectContaining({ id: "vh", provider: "valhalla" })
      ]
    })
  })

  it("keeps GraphHopper results when optional Valhalla fails", async () => {
    const provider = createHybridRouteProvider({
      graphHopper: async () => result("graphhopper", [candidate("gh")]),
      valhalla: async () => { throw new Error("Valhalla unavailable") }
    })

    const response = await provider(request)
    expect(response.routes.map((route) => route.id)).toEqual(["gh"])
    expect(response.warnings?.join(" ")).toMatch(/Valhalla.*unavailable/i)
  })

  it("uses Valhalla as an explicit fallback for supported requests when GraphHopper fails", async () => {
    const provider = createHybridRouteProvider({
      graphHopper: async () => { throw new Error("GraphHopper unavailable") },
      valhalla: async () => result("valhalla", [candidate("vh")])
    })

    const response = await provider(request)
    expect(response.routes[0]).toMatchObject({ id: "vh", provider: "valhalla" })
    expect(response.warnings?.join(" ")).toMatch(/GraphHopper.*fallback/i)
  })

  it("keeps native loops and Adventure evidence on GraphHopper", async () => {
    const graphHopper = vi.fn(async () => result("graphhopper", [candidate("gh-loop")]))
    const valhalla = vi.fn(async () => result("valhalla", [candidate("vh-loop")]))
    const provider = createHybridRouteProvider({ graphHopper, valhalla })

    await provider({
      profile: "twisty",
      points: [{ lat: 40.2, lon: -76.9 }],
      roundTrip: { targetMinutes: 90, seed: 17, heading: 40 }
    })
    await provider({ ...request, profile: "adventure" })

    expect(graphHopper).toHaveBeenCalledTimes(2)
    expect(valhalla).not.toHaveBeenCalled()
  })

  it("enriches the merged candidate set once", async () => {
    const enrich = vi.fn(async (routing: RoutingResult): Promise<RoutingResult> => ({
      ...routing,
      routes: routing.routes.map((route) => ({ ...route, ascentMeters: 321 }))
    }))
    const provider = createHybridRouteProvider({
      graphHopper: async () => result("graphhopper", [candidate("gh")]),
      valhalla: async () => result("valhalla", [candidate("vh", 0.05)]),
      enrich
    })

    const response = await provider(request)
    expect(enrich).toHaveBeenCalledOnce()
    expect(response.routes.every((route) => route.ascentMeters === 321)).toBe(true)
  })
})
