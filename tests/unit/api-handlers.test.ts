import { describe, expect, it, vi } from "vitest"
import { handleCurvatureRequest } from "@/app/api/curvature/handler"
import { handleGeocodeRequest } from "@/app/api/geocode/handler"
import { getSystemHealth } from "@/app/api/health/service"
import { handleRouteRequest } from "@/app/api/routes/handler"
import type { PlaceResult } from "@/lib/geocoding/photon"
import type { GraphHopperResult } from "@/lib/routing/graphhopper"
import type { PlannedRoute } from "@/lib/routing/types"

const route: PlannedRoute = {
  id: "twisty-live",
  name: "Twisty route",
  profile: "twisty",
  geometry: [
    [-76.9, 40.2],
    [-76.8, 40.3]
  ],
  waypoints: [],
  instructions: [],
  distanceMiles: 18,
  durationMinutes: 31,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 72,
  turnCount: 22,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

describe("route HTTP contract", () => {
  it("rejects oversized request bodies before route planning", async () => {
    const provider = vi.fn()
    const response = await handleRouteRequest(
      new Request("http://switchback.test/api/routes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: "twisty",
          points: [
            { lat: 40.2, lon: -76.9, label: "x".repeat(20_000) },
            { lat: 40.3, lon: -76.8 }
          ]
        })
      }),
      provider
    )

    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({
      error: { code: "ROUTE_REQUEST_TOO_LARGE" }
    })
    expect(provider).not.toHaveBeenCalled()
  })

  it("rejects malformed route requests at the boundary", async () => {
    const provider = vi.fn()
    const response = await handleRouteRequest(
      new Request("http://switchback.test/api/routes", {
        method: "POST",
        body: JSON.stringify({ profile: "car", points: [{ lat: 40, lon: -76 }] })
      }),
      provider
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_ROUTE_REQUEST" }
    })
    expect(provider).not.toHaveBeenCalled()
  })

  it("returns a normalized live trip plan", async () => {
    const provider = vi.fn(async (): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [route]
    }))
    const response = await handleRouteRequest(
      new Request("http://switchback.test/api/routes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: "twisty",
          compare: false,
          points: [
            { lat: 40.2, lon: -76.9, label: "Start" },
            { lat: 40.3, lon: -76.8, label: "Finish" }
          ]
        })
      }),
      provider
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      selectedRouteId: "twisty-live",
      routes: [{ id: "twisty-live", routingSource: "live", previewOnly: false }]
    })
  })
})

describe("supporting HTTP contracts", () => {
  it("keeps geocoding behind a same-origin route", async () => {
    const searcher = vi.fn(async (): Promise<PlaceResult[]> => [
      {
        id: "N-1",
        label: "New Hope, Pennsylvania",
        name: "New Hope",
        region: "Pennsylvania",
        country: "United States",
        lat: 40.3643,
        lon: -74.9513
      }
    ])
    const response = await handleGeocodeRequest(
      new Request("http://switchback.test/api/geocode?q=New%20Hope"),
      searcher
    )

    expect(response.status).toBe(200)
    expect(searcher).toHaveBeenCalledWith("New Hope")
    expect(await response.json()).toMatchObject({ places: [{ id: "N-1" }] })
  })

  it("validates and forwards only bounded curvature requests", async () => {
    const repository = {
      queryBounds: vi.fn(() => [
        {
          id: "road-1",
          name: "River Road",
          score: 900,
          surface: "unknown",
          geometry: [[-76.9, 40.2], [-76.8, 40.3]] as [number, number][]
        }
      ])
    }
    const response = await handleCurvatureRequest(
      new Request(
        "http://switchback.test/api/curvature?south=40&west=-77&north=40.5&east=-76.5&minScore=700&limit=200"
      ),
      repository
    )

    expect(response.status).toBe(200)
    expect(repository.queryBounds).toHaveBeenCalledWith({
      south: 40,
      west: -77,
      north: 40.5,
      east: -76.5,
      minScore: 700,
      limit: 200
    })
    expect(await response.json()).toMatchObject({
      type: "FeatureCollection",
      features: [{ properties: { curvature: 900 } }]
    })
  })

  it("reports router readiness from the dependency itself", async () => {
    const healthy = await getSystemHealth({
      routerBaseUrl: "http://router.test",
      fetcher: vi.fn(async () => new Response("OK", { status: 200 }))
    })
    const degraded = await getSystemHealth({
      routerBaseUrl: "http://router.test",
      fetcher: vi.fn(async () => new Response("down", { status: 503 }))
    })

    expect(healthy).toMatchObject({ ok: true, router: { ok: true } })
    expect(degraded).toMatchObject({ ok: false, router: { ok: false } })
  })
})
