import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PlannedRoute, RouteRequest } from "@/lib/routing/types"

vi.mock("@/lib/routing/graphhopper", () => ({
  requestGraphHopperRoutes: vi.fn()
}))

vi.mock("@/lib/routing/valhalla", () => ({
  requestValhallaRoutes: vi.fn(),
  enrichWithElevations: vi.fn()
}))

vi.mock("@/lib/roads/adventure-route-enricher", () => ({
  enrichAdventureRoutesWithPaData: vi.fn(async (_request: RouteRequest, routes: PlannedRoute[]) => ({
    routes,
    warnings: []
  }))
}))

import { POST } from "@/app/api/routes/route"
import { requestGraphHopperRoutes } from "@/lib/routing/graphhopper"
import { enrichWithElevations, requestValhallaRoutes } from "@/lib/routing/valhalla"

const originalEnvironment = {
  graphHopperUrl: process.env.GRAPHHOPPER_URL,
  valhallaUrl: process.env.VALHALLA_URL,
  elevationUrl: process.env.VALHALLA_ELEVATION_URL
}

function candidate(id: string, provider: "graphhopper" | "valhalla", latitudeOffset = 0): PlannedRoute {
  return {
    id,
    name: `${provider} candidate`,
    profile: "twisty",
    geometry: [
      [-76.9, 40.2 + latitudeOffset],
      [-76.7, 40.4 + latitudeOffset]
    ],
    waypoints: [],
    instructions: [],
    distanceMiles: 25,
    durationMinutes: 40,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 60,
    turnCount: 20,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

function routeRequest(): Request {
  return new Request("http://switchback.test/api/routes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      profile: "twisty",
      compare: false,
      points: [
        { lat: 40.2, lon: -76.9 },
        { lat: 40.4, lon: -76.7 }
      ]
    })
  })
}

function restoreEnvironment(): void {
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  restore("GRAPHHOPPER_URL", originalEnvironment.graphHopperUrl)
  restore("VALHALLA_URL", originalEnvironment.valhallaUrl)
  restore("VALHALLA_ELEVATION_URL", originalEnvironment.elevationUrl)
}

describe("routes API provider wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GRAPHHOPPER_URL = "http://graphhopper.test"
    delete process.env.VALHALLA_URL
    delete process.env.VALHALLA_ELEVATION_URL

    vi.mocked(requestGraphHopperRoutes).mockResolvedValue({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [candidate("gh-primary", "graphhopper")]
    })
    vi.mocked(requestValhallaRoutes).mockResolvedValue({
      engine: "valhalla",
      engineVersion: "3.8.2",
      routes: [candidate("vh-supplemental", "valhalla", 1)]
    })
    vi.mocked(enrichWithElevations).mockImplementation(async (result) => result)
  })

  afterEach(restoreEnvironment)

  it("always routes through GraphHopper when optional Valhalla is not configured", async () => {
    const response = await POST(routeRequest())

    expect(response.status).toBe(200)
    expect(requestGraphHopperRoutes).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "twisty" }),
      { baseUrl: "http://graphhopper.test" }
    )
    expect(requestValhallaRoutes).not.toHaveBeenCalled()
    expect(enrichWithElevations).not.toHaveBeenCalled()
  })

  it("uses Valhalla as a supplement and enriches the merged provider result exactly once", async () => {
    process.env.VALHALLA_URL = "http://valhalla.test"
    process.env.VALHALLA_ELEVATION_URL = "http://elevation.test"

    const response = await POST(routeRequest())

    expect(response.status).toBe(200)
    expect(requestGraphHopperRoutes).toHaveBeenCalledOnce()
    expect(requestValhallaRoutes).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "twisty" }),
      { baseUrl: "http://valhalla.test" }
    )
    expect(enrichWithElevations).toHaveBeenCalledOnce()
    expect(enrichWithElevations).toHaveBeenCalledWith(
      expect.objectContaining({
        engine: "hybrid",
        routes: [
          expect.objectContaining({ id: "gh-primary", provider: "graphhopper" }),
          expect.objectContaining({ id: "vh-supplemental", provider: "valhalla" })
        ]
      }),
      { baseUrl: "http://elevation.test" }
    )
  })
})
