import { describe, expect, it, vi } from "vitest"
import { searchPlaces } from "@/lib/geocoding/photon"

describe("Photon geocoder", () => {
  it("normalizes provider features and sends a bounded encoded query", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [-74.9513, 40.3643] },
              properties: {
                osm_id: 123,
                osm_type: "N",
                name: "New Hope",
                state: "Pennsylvania",
                country: "United States"
              }
            },
            {
              type: "Feature",
              geometry: null,
              properties: { name: "Invalid" }
            }
          ]
        }),
        { status: 200 }
      )
    )

    const places = await searchPlaces("New Hope, PA", {
      baseUrl: "https://photon.test/api",
      fetcher,
      limit: 5
    })

    expect(fetcher).toHaveBeenCalledOnce()
    expect(String(fetcher.mock.calls[0][0])).toContain("q=New+Hope%2C+PA")
    expect(String(fetcher.mock.calls[0][0])).toContain("limit=5")
    expect(places).toEqual([
      {
        id: "N-123",
        label: "New Hope, Pennsylvania, United States",
        name: "New Hope",
        region: "Pennsylvania",
        country: "United States",
        lat: 40.3643,
        lon: -74.9513
      }
    ])
  })

  it("does not send blank or one-character searches to the provider", async () => {
    const fetcher = vi.fn<typeof fetch>()
    expect(await searchPlaces(" ", { baseUrl: "https://photon.test/api", fetcher })).toEqual([])
    expect(await searchPlaces("a", { baseUrl: "https://photon.test/api", fetcher })).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("reports geocoder outages without leaking provider responses", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("upstream details", { status: 503 }))
    await expect(
      searchPlaces("Harrisburg", { baseUrl: "https://photon.test/api", fetcher })
    ).rejects.toMatchObject({
      code: "GEOCODER_UNAVAILABLE",
      status: 503
    })
  })
})
