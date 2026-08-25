import { describe, expect, it } from "vitest"
import { enrichWithElevations, fetchRouteElevations } from "@/lib/routing/valhalla"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"

const geometry: Coordinate[] = [
  [-76.8867, 40.2732],
  [-76.5, 40.15],
  [-76.3055, 40.0379]
]

function plannedRoute(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "route-1",
    name: "Test route",
    profile: "twisty",
    geometry,
    waypoints: [],
    instructions: [],
    distanceMiles: 20,
    durationMinutes: 40,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 0.5,
    turnCount: 3,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false,
    ...overrides
  }
}

function okResponse(payload: unknown): Response {
  return { ok: true, json: async () => payload } as Response
}

describe("fetchRouteElevations", () => {
  it("marks the fetch unavailable when the elevation request throws", async () => {
    const fetcher = async () => {
      throw new Error("network down")
    }
    const result = await fetchRouteElevations(geometry, "http://valhalla.test", fetcher as typeof fetch)
    expect(result).toEqual({ ascentMeters: null, descentMeters: null, unavailable: true })
  })

  it("marks the fetch unavailable when the elevation service returns a non-ok response", async () => {
    const fetcher = async () => ({ ok: false } as Response)
    const result = await fetchRouteElevations(geometry, "http://valhalla.test", fetcher as typeof fetch)
    expect(result).toEqual({ ascentMeters: null, descentMeters: null, unavailable: true })
  })

  it("marks the fetch unavailable when the elevation response body is unreadable", async () => {
    const fetcher = async () => ({
      ok: true,
      json: async () => {
        throw new Error("bad json")
      }
    } as unknown as Response)
    const result = await fetchRouteElevations(geometry, "http://valhalla.test", fetcher as typeof fetch)
    expect(result).toEqual({ ascentMeters: null, descentMeters: null, unavailable: true })
  })

  it("does not mark the fetch unavailable when the provider answers but has no usable height data", async () => {
    const fetcher = async () => okResponse({ range_height: [[0, null]] })
    const result = await fetchRouteElevations(geometry, "http://valhalla.test", fetcher as typeof fetch)
    expect(result).toEqual({ ascentMeters: null, descentMeters: null })
    expect(result.unavailable).toBeUndefined()
  })

  it("computes ascent and descent from a successful response", async () => {
    const fetcher = async () => okResponse({
      range_height: [[0, 100], [500, 140], [1000, 120]]
    })
    const result = await fetchRouteElevations(geometry, "http://valhalla.test", fetcher as typeof fetch)
    expect(result).toEqual({ ascentMeters: 40, descentMeters: 20 })
  })
})

describe("enrichWithElevations", () => {
  it("appends a warning when at least one route's elevation fetch fails, preserving prior warnings", async () => {
    const fetcher = async () => {
      throw new Error("network down")
    }
    const result = await enrichWithElevations(
      { routes: [plannedRoute()], warnings: ["existing warning"] },
      { baseUrl: "http://valhalla.test", fetcher: fetcher as typeof fetch }
    )
    expect(result.routes[0].ascentMeters).toBeNull()
    expect(result.routes[0].descentMeters).toBeNull()
    expect(result.warnings).toEqual([
      "existing warning",
      "Elevation data was unavailable for one or more routes; distances and turns are unaffected."
    ])
  })

  it("does not add a warning when the elevation service legitimately has no data for the route", async () => {
    const fetcher = async () => okResponse({ height: [] })
    const result = await enrichWithElevations(
      { routes: [plannedRoute()], warnings: [] },
      { baseUrl: "http://valhalla.test", fetcher: fetcher as typeof fetch }
    )
    expect(result.routes[0].ascentMeters).toBeNull()
    expect(result.warnings).toEqual([])
  })

  it("does not add a warning and merges elevation on a fully successful enrichment", async () => {
    const fetcher = async () => okResponse({ range_height: [[0, 100], [500, 160]] })
    const result = await enrichWithElevations(
      { routes: [plannedRoute()], warnings: [] },
      { baseUrl: "http://valhalla.test", fetcher: fetcher as typeof fetch }
    )
    expect(result.routes[0].ascentMeters).toBe(60)
    expect(result.routes[0].descentMeters).toBe(0)
    expect(result.warnings).toEqual([])
  })

  it("does not leak the internal unavailable flag onto the route object", async () => {
    const fetcher = async () => {
      throw new Error("network down")
    }
    const result = await enrichWithElevations(
      { routes: [plannedRoute()], warnings: [] },
      { baseUrl: "http://valhalla.test", fetcher: fetcher as typeof fetch }
    )
    expect(result.routes[0]).not.toHaveProperty("unavailable")
  })
})
