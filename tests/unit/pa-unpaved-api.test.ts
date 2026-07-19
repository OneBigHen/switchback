import { describe, expect, it, vi } from "vitest"
import type { PaUnpavedRoadFeatureCollection } from "@/lib/roads/types"

const emptyCollection: PaUnpavedRoadFeatureCollection = {
  type: "FeatureCollection",
  features: [],
  metadata: {
    count: 0,
    limit: 200,
    truncated: false,
    source: "Pennsylvania Department of Environmental Protection",
    dataset: "Unpaved Roads 2009_07"
  }
}

describe("Pennsylvania unpaved-road HTTP contract", () => {
  it("forwards a validated map envelope and publishes shared-cache headers", async () => {
    const { handlePaUnpavedRoadsRequest } = await import(
      "@/app/api/pa-unpaved-roads/handler"
    )
    const provider = vi.fn(async (): Promise<PaUnpavedRoadFeatureCollection> => emptyCollection)

    const response = await handlePaUnpavedRoadsRequest(
      new Request(
        "http://switchback.test/api/pa-unpaved-roads?bbox=-77.2,40,-76.6,40.5&zoom=10&limit=200"
      ),
      provider
    )

    expect(response.status).toBe(200)
    expect(provider).toHaveBeenCalledWith({
      bounds: { south: 40, west: -77.2, north: 40.5, east: -76.6 },
      limit: 200
    })
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
    )
    expect(await response.json()).toEqual(emptyCollection)
  })

  it("rejects malformed, inverted, oversized, and zoomed-out requests", async () => {
    const { handlePaUnpavedRoadsRequest } = await import(
      "@/app/api/pa-unpaved-roads/handler"
    )
    const provider = vi.fn()
    const queries = [
      "zoom=10",
      "bbox=not-a-box&zoom=10",
      "bbox=-77.2,41,-76.6,40&zoom=10",
      "bbox=-80.6,39.7,-74.7,42.3&zoom=10",
      "bbox=-77.2,40,-76.6,40.5&zoom=8"
    ]

    for (const query of queries) {
      const response = await handlePaUnpavedRoadsRequest(
        new Request(`http://switchback.test/api/pa-unpaved-roads?${query}`),
        provider
      )
      expect(response.status).toBe(400)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(await response.json()).toEqual({
        error: {
          code: "INVALID_PA_UNPAVED_ROAD_QUERY",
          message: "Use a valid, zoomed-in Pennsylvania map view."
        }
      })
    }

    expect(provider).not.toHaveBeenCalled()
  })

  it("caps the public limit before invoking the provider", async () => {
    const { handlePaUnpavedRoadsRequest } = await import(
      "@/app/api/pa-unpaved-roads/handler"
    )
    const provider = vi.fn(async (): Promise<PaUnpavedRoadFeatureCollection> => emptyCollection)

    await handlePaUnpavedRoadsRequest(
      new Request(
        "http://switchback.test/api/pa-unpaved-roads?bbox=-77.2,40,-76.6,40.5&zoom=10&limit=99999"
      ),
      provider
    )

    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 }))
  })

  it("returns a no-store generic outage without leaking internal failures", async () => {
    const { handlePaUnpavedRoadsRequest } = await import(
      "@/app/api/pa-unpaved-roads/handler"
    )
    const provider = vi.fn(async () => {
      throw new Error("postgres://user:password@private-provider")
    })

    const response = await handlePaUnpavedRoadsRequest(
      new Request(
        "http://switchback.test/api/pa-unpaved-roads?bbox=-77.2,40,-76.6,40.5&zoom=10"
      ),
      provider
    )

    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      error: {
        code: "PA_UNPAVED_ROADS_UNAVAILABLE",
        message: "Official Pennsylvania unpaved-road data is temporarily unavailable."
      }
    })
  })

  it("wires GET to the server-only PASDA provider", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ type: "FeatureCollection", features: [] })
    )
    vi.stubGlobal("fetch", fetcher)
    try {
      const route = await import("@/app/api/pa-unpaved-roads/route")
      const response = await route.GET(
        new Request(
          "http://switchback.test/api/pa-unpaved-roads?bbox=-77.2,40,-76.6,40.5&zoom=10"
        )
      )

      expect(route.runtime).toBe("nodejs")
      expect(route.dynamic).toBe("force-dynamic")
      expect(response.status).toBe(200)
      expect(fetcher).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
