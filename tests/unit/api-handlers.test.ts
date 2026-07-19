import { describe, expect, it, vi } from "vitest"
import { handleCurvatureRequest } from "@/app/api/curvature/handler"
import { handleGeocodeRequest } from "@/app/api/geocode/handler"
import { getSystemHealth } from "@/app/api/health/service"
import { handleRouteRequest } from "@/app/api/routes/handler"
import type { PlaceResult } from "@/lib/geocoding/photon"
import type { GraphHopperResult } from "@/lib/routing/graphhopper"
import type { PlannedRoute, RouteRequest } from "@/lib/routing/types"

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
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
      void request
      return { engine: "graphhopper", engineVersion: "11.0", routes: [route] }
    })
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

  it("applies optional server-side candidate intelligence before selecting a route", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
      void request
      return { engine: "graphhopper", engineVersion: "11.0", routes: [route] }
    })
    const enricher = vi.fn(async (_request, routes: PlannedRoute[]) => ({
      routes: routes.map((candidate) => ({
        ...candidate,
        officialUnpavedEvidence: {
          source: "Pennsylvania Department of Environmental Protection" as const,
          dataset: "Unpaved Roads 2009_07" as const,
          matchedMeters: 240,
          sharePercent: 1.4,
          matchedFeatureCount: 1,
          matchRadiusMeters: 40,
          minimumContiguousMeters: 120
        }
      })),
      warnings: []
    }))
    const response = await handleRouteRequest(new Request("http://switchback.test/api/routes", {
      method: "POST",
      body: JSON.stringify({
        profile: "adventure",
        compare: false,
        points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.3, lon: -76.8 }]
      })
    }), provider, enricher)

    expect(enricher).toHaveBeenCalledOnce()
    expect(await response.json()).toMatchObject({
      routes: [{ officialUnpavedEvidence: { sharePercent: 1.4 } }]
    })
  })

  it("validates and forwards explicit highway avoidance", async () => {
    const provider = vi.fn(async (): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [route]
    }))
    const response = await handleRouteRequest(
      new Request("http://switchback.test/api/routes", {
        method: "POST",
        body: JSON.stringify({
          profile: "quick",
          compare: false,
          avoidHighways: true,
          points: [
            { lat: 40.2, lon: -76.9 },
            { lat: 40.3, lon: -76.8 }
          ]
        })
      }),
      provider
    )

    expect(response.status).toBe(200)
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({
      profile: "quick",
      avoidHighways: true
    }))
  })

  it("accepts bounded per-leg styles and rider-drawn avoid zones", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
      void request
      return { engine: "graphhopper", engineVersion: "11.0", routes: [route] }
    })
    const response = await handleRouteRequest(new Request("http://switchback.test/api/routes", {
      method: "POST",
      body: JSON.stringify({
        profile: "twisty",
        compare: false,
        points: [
          { lat: 40.2, lon: -76.9 },
          { lat: 40.25, lon: -76.8, locked: true },
          { lat: 40.3, lon: -76.7 }
        ],
        segmentProfiles: ["twisty", "adventure"],
        avoidAreas: [{
          id: "closed bridge",
          polygon: [
            [-76.83, 40.2], [-76.81, 40.2], [-76.81, 40.22], [-76.83, 40.22]
          ]
        }]
      })
    }), provider)

    expect(response.status).toBe(200)
    expect(provider.mock.calls.map(([request]) => request.profile)).toEqual(["twisty", "adventure"])
    expect(provider.mock.calls[0]?.[0]).toMatchObject({
      points: [
        { lat: 40.2, lon: -76.9 },
        { lat: 40.25, lon: -76.8, locked: true }
      ],
      avoidAreas: [expect.objectContaining({ id: "closed bridge" })]
    })
  })

  it("rejects mismatched per-leg styles and malformed avoid-zone geometry", async () => {
    const provider = vi.fn()
    const response = await handleRouteRequest(new Request("http://switchback.test/api/routes", {
      method: "POST",
      body: JSON.stringify({
        profile: "twisty",
        points: [
          { lat: 40.2, lon: -76.9 },
          { lat: 40.25, lon: -76.8 },
          { lat: 40.3, lon: -76.7 }
        ],
        segmentProfiles: ["twisty"],
        avoidAreas: [{ id: "bad", polygon: [[-76.8, 40.2], [-76.7, 40.3]] }]
      })
    }), provider)

    expect(response.status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
  })

  it("rejects a non-boolean highway avoidance preference", async () => {
    const provider = vi.fn()
    const response = await handleRouteRequest(
      new Request("http://switchback.test/api/routes", {
        method: "POST",
        body: JSON.stringify({
          profile: "quick",
          avoidHighways: "yes",
          points: [
            { lat: 40.2, lon: -76.9 },
            { lat: 40.3, lon: -76.8 }
          ]
        })
      }),
      provider
    )

    expect(response.status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
  })

  it("accepts a bounded timeboxed loop from a single approximate start", async () => {
    const provider = vi.fn(async (): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [route]
    }))
    const response = await handleRouteRequest(
      new Request("http://switchback.test/api/routes", {
        method: "POST",
        body: JSON.stringify({
          profile: "adventure",
          compare: false,
          points: [{ lat: 40.2, lon: -76.9, label: "Near home" }],
          roundTrip: { targetMinutes: 120, seed: 23, heading: 90 }
        })
      }),
      provider
    )

    expect(response.status).toBe(200)
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({
      profile: "adventure",
      roundTrip: { targetMinutes: 120, seed: 23, heading: 90 }
    }))
  })

  it("accepts loop timebox metadata for explicitly shaped start-to-start routes", async () => {
    const provider = vi.fn(async (): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [route]
    }))
    const response = await handleRouteRequest(new Request("http://switchback.test/api/routes", {
      method: "POST",
      body: JSON.stringify({
        profile: "scenic",
        compare: false,
        loopTargetMinutes: 120,
        points: [
          { lat: 40.2, lon: -76.9 },
          { lat: 40.3, lon: -76.8 },
          { lat: 40.2, lon: -76.9 }
        ]
      })
    }), provider)

    expect(response.status).toBe(200)
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ loopTargetMinutes: 120 }))
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

  it("validates and forwards an optional geocoder location bias", async () => {
    const searcher = vi.fn(async (): Promise<PlaceResult[]> => [])
    const response = await handleGeocodeRequest(
      new Request("http://switchback.test/api/geocode?q=brewery&lat=40.3&lon=-76.7"),
      searcher
    )

    expect(response.status).toBe(200)
    expect(searcher).toHaveBeenCalledWith("brewery", { lat: 40.3, lon: -76.7 })
  })

  it("returns only nearby feature-compatible fun stops", async () => {
    const searcher = vi.fn(async (): Promise<PlaceResult[]> => [
      {
        id: "distant-brewery",
        label: "Distant Brewery, Pennsylvania",
        name: "Distant Brewery",
        region: "Pennsylvania",
        country: "United States",
        lat: 41.75,
        lon: -77.3,
        kind: "brewery"
      },
      {
        id: "near-town",
        label: "Brewery, Pennsylvania",
        name: "Brewery",
        region: "Pennsylvania",
        country: "United States",
        lat: 40.31,
        lon: -76.69,
        kind: "city"
      },
      {
        id: "near-pub",
        label: "Trailhead Brewing, Pennsylvania",
        name: "Trailhead Brewing",
        region: "Pennsylvania",
        country: "United States",
        lat: 40.34,
        lon: -76.66,
        kind: "pub"
      }
    ])

    const response = await handleGeocodeRequest(
      new Request(
        "http://switchback.test/api/geocode?q=brewery&lat=40.3&lon=-76.7&stopKind=brewery&radiusKm=35"
      ),
      searcher
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      places: [{ id: "near-pub" }]
    })
  })

  it("uses the safe 35 km corridor radius when a stop radius is omitted", async () => {
    const searcher = vi.fn(async (): Promise<PlaceResult[]> => [{
      id: "mid-corridor-cafe",
      label: "Ridge Coffee, Pennsylvania",
      name: "Ridge Coffee",
      region: "Pennsylvania",
      country: "United States",
      lat: 40.45,
      lon: -76.7,
      kind: "cafe"
    }])

    const response = await handleGeocodeRequest(
      new Request("http://switchback.test/api/geocode?q=coffee&lat=40.3&lon=-76.7&stopKind=coffee"),
      searcher
    )

    expect(await response.json()).toMatchObject({ places: [{ id: "mid-corridor-cafe" }] })
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

    expect(healthy).toMatchObject({
      ok: true,
      degraded: false,
      router: { ok: true },
      providers: { graphhopper: { ok: true } }
    })
    expect(degraded).toMatchObject({
      ok: false,
      degraded: false,
      router: { ok: false },
      providers: { graphhopper: { ok: false } }
    })
  })

  it("reports Valhalla independently without making the optional provider a readiness gate", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url === "http://router.test/health") {
        return new Response("OK", { status: 200 })
      }
      if (url === "http://valhalla.test/status") {
        return new Response("down", { status: 503 })
      }
      throw new Error(`Unexpected health probe: ${url}`)
    })

    const health = await getSystemHealth({
      routerBaseUrl: "http://router.test/",
      valhallaBaseUrl: "http://valhalla.test/",
      fetcher
    })

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(health).toMatchObject({
      ok: true,
      degraded: true,
      router: { ok: true },
      providers: {
        graphhopper: { ok: true, status: 200 },
        valhalla: { ok: false, status: 503 }
      }
    })
  })

  it("reports a healthy configured Valhalla provider without degradation", async () => {
    const health = await getSystemHealth({
      routerBaseUrl: "http://router.test",
      valhallaBaseUrl: "http://valhalla.test",
      fetcher: vi.fn(async (input: string | URL | Request) =>
        new Response(String(input).endsWith("/status") ? '{"version":"3.8.2"}' : "OK", {
          status: 200
        })
      )
    })

    expect(health).toMatchObject({
      ok: true,
      degraded: false,
      providers: {
        graphhopper: { ok: true },
        valhalla: { ok: true }
      }
    })
  })
})
