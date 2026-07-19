import { describe, expect, it, vi } from "vitest"
import { handleMapFeaturesRequest } from "@/app/api/map-features/handler"
import { createOverpassQuery, getRiderMapFeatures, normalizeOverpassFeatures } from "@/lib/map-features/osm"

const collection = {
  type: "FeatureCollection" as const,
  features: [{
    type: "Feature" as const,
    properties: { layerId: "fuel", name: "Fuel stop" },
    geometry: { type: "Point" as const, coordinates: [-74.9, 40.3] as [number, number] }
  }]
}

describe("rider map feature HTTP contract", () => {
  it("uses bounded, feature-specific OSM selectors instead of a costly all-type query", () => {
    const query = createOverpassQuery({
      bounds: { west: -75.1, south: 40.1, east: -74.7, north: 40.5 },
      layers: ["food", "closures"]
    })

    expect(query).toContain('node["amenity"="restaurant"]')
    expect(query).toContain('way["highway"="construction"]')
    expect(query).not.toContain('way["access"="no"]')
    expect(query).not.toContain("nwr")
    expect(query).toContain("out center 600")
  })

  it("uses representative centres for OSM ways so large boundaries do not time out the map", () => {
    const result = normalizeOverpassFeatures({
      elements: [{
        type: "way",
        id: 42,
        center: { lat: 40.3, lon: -74.9 },
        tags: { boundary: "protected_area", name: "Rider preserve" }
      }]
    }, ["public-land"])

    expect(result.features).toEqual([expect.objectContaining({
      geometry: { type: "Point", coordinates: [-74.9, 40.3] },
      properties: expect.objectContaining({ layerId: "public-land", name: "Rider preserve" })
    })])
  })

  it("posts bounded Overpass queries so a long query is not rejected by an edge proxy", async () => {
    let receivedUrl: RequestInfo | URL | undefined
    let receivedInit: RequestInit | undefined
    const fetcher: typeof fetch = async (url, init) => {
      receivedUrl = url
      receivedInit = init
      return new Response(JSON.stringify({ elements: [] }), { status: 200 })
    }
    await getRiderMapFeatures({
      bounds: { west: -75.1, south: 40.1, east: -74.7, north: 40.5 },
      layers: ["closures"]
    }, {
      overpassUrl: "https://overpass.test/api/interpreter",
      nwsUserAgent: "Switchback test",
      fetcher
    })

    expect(String(receivedUrl)).toBe("https://overpass.test/api/interpreter")
    expect(receivedInit).toMatchObject({ method: "POST" })
    expect(String(receivedInit?.body)).toContain("data=")
  })

  it("serves a bounded set of selected live layers through the same-origin API", async () => {
    const provider = vi.fn(async () => collection)
    const response = await handleMapFeaturesRequest(
      new Request("http://switchback.test/api/map-features?bbox=-75.1,40.1,-74.7,40.5&layers=fuel,food"),
      provider
    )

    expect(response.status).toBe(200)
    expect(provider).toHaveBeenCalledWith({
      bounds: { west: -75.1, south: 40.1, east: -74.7, north: 40.5 },
      layers: ["fuel", "food"]
    })
    expect(response.headers.get("cache-control")).toMatch(/max-age=120/)
    expect(await response.json()).toEqual(collection)
  })

  it("rejects unbounded or unsupported layers before calling an upstream provider", async () => {
    const provider = vi.fn()
    const response = await handleMapFeaturesRequest(
      new Request("http://switchback.test/api/map-features?bbox=-90,30,-70,50&layers=traffic"),
      provider
    )

    expect(response.status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
  })
})
