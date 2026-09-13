import { describe, expect, it, vi } from "vitest"
import { getRiderMapFeatures } from "@/lib/map-features/osm"
import { getTomTomTrafficForBounds } from "@/lib/traffic/tomtom"

const bounds = {
  west: -75.35,
  south: 40.10,
  east: -75.05,
  north: 40.30
}

const jamIncident = {
  type: "Feature",
  properties: {
    id: "incident-jam",
    iconCategory: "jam",
    magnitudeOfDelay: "moderate",
    events: [{ description: "Slow traffic", iconCategory: "jam" }],
    from: "York Rd",
    to: "Bristol Rd",
    lengthInMeters: 1600,
    delayInSeconds: 480,
    roadNumbers: ["PA-611"]
  },
  geometry: {
    type: "LineString",
    coordinates: [[-75.13, 40.20], [-75.12, 40.21]]
  }
}

function trafficResponse(incidents: unknown[]): Response {
  return Response.json({ incidents })
}

describe("getTomTomTrafficForBounds", () => {
  it("queries one bounded viewport and normalizes live incidents", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      expect(url.pathname).toContain("/traffic/incidents/details")
      expect(url.searchParams.get("bbox")).toBe("-75.35,40.1,-75.05,40.3")
      expect(new Headers(init?.headers).get("TomTom-Api-Key")).toBe("secret-key")
      return trafficResponse([jamIncident])
    })

    const result = await getTomTomTrafficForBounds(bounds, {
      apiKey: "secret-key",
      fetcher: fetcher as typeof fetch
    })

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      status: "available",
      incidents: [expect.objectContaining({ id: "incident-jam", kind: "jam" })]
    })
  })

  it("returns unknown without a provider call when traffic is not configured", async () => {
    const fetcher = vi.fn()

    const result = await getTomTomTrafficForBounds(bounds, {
      apiKey: "",
      fetcher: fetcher as unknown as typeof fetch
    })

    expect(fetcher).not.toHaveBeenCalled()
    expect(result).toEqual({ status: "unknown", incidents: [] })
  })
})

describe("TomTom map feature federation", () => {
  it("converts TomTom incidents into the normal rider GeoJSON source", async () => {
    const collection = await getRiderMapFeatures({
      bounds,
      layers: ["live-traffic"]
    }, {
      overpassUrl: "https://overpass.test/api",
      nwsUserAgent: "Switchback test",
      tomtomApiKey: "secret-key",
      fetcher: vi.fn(async () => trafficResponse([jamIncident])) as unknown as typeof fetch
    })

    expect(collection.unavailable).toBeUndefined()
    expect(collection.features).toEqual([
      expect.objectContaining({
        type: "Feature",
        properties: expect.objectContaining({
          layerId: "live-traffic",
          sourceId: "incident-jam",
          kind: "jam"
        }),
        geometry: jamIncident.geometry
      })
    ])
  })

  it("marks unconfigured traffic unavailable instead of pretending the viewport is clear", async () => {
    const fetcher = vi.fn()
    const collection = await getRiderMapFeatures({
      bounds,
      layers: ["live-traffic"]
    }, {
      overpassUrl: "https://overpass.test/api",
      nwsUserAgent: "Switchback test",
      tomtomApiKey: "",
      fetcher: fetcher as unknown as typeof fetch
    })

    expect(fetcher).not.toHaveBeenCalled()
    expect(collection.features).toEqual([])
    expect(collection.unavailable).toEqual(["traffic"])
  })

  it("preserves successful OSM features when TomTom fails", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("tomtom.com")) return new Response("down", { status: 503 })
      return Response.json({
        elements: [{
          type: "node",
          id: 42,
          lat: 40.2,
          lon: -75.2,
          tags: { amenity: "fuel", name: "Fuel stop" }
        }]
      })
    })

    const collection = await getRiderMapFeatures({
      bounds,
      layers: ["fuel", "live-traffic"]
    }, {
      overpassUrl: "https://overpass.test/api",
      nwsUserAgent: "Switchback test",
      tomtomApiKey: "secret-key",
      fetcher: fetcher as typeof fetch
    })

    expect(collection.features).toEqual([
      expect.objectContaining({ properties: expect.objectContaining({ layerId: "fuel" }) })
    ])
    expect(collection.unavailable).toEqual(["traffic"])
  })

  it("treats a successful zero-incident response as an empty available layer", async () => {
    const collection = await getRiderMapFeatures({
      bounds,
      layers: ["live-traffic"]
    }, {
      overpassUrl: "https://overpass.test/api",
      nwsUserAgent: "Switchback test",
      tomtomApiKey: "secret-key",
      fetcher: vi.fn(async () => trafficResponse([])) as unknown as typeof fetch
    })

    expect(collection.features).toEqual([])
    expect(collection.unavailable).toBeUndefined()
  })
})
