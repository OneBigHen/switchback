import { describe, expect, it, vi } from "vitest"
import { filterFunStopCandidates, searchPlaces, selectPreferredPlace } from "@/lib/geocoding/photon"
import { searchDestinationPlaces } from "@/lib/geocoding/search"

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

  it("biases fun-stop searches toward the route corridor", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ features: [] }))
    await searchPlaces("brewery", {
      baseUrl: "https://photon.test/api",
      fetcher,
      bias: { lat: 40.3, lon: -76.7 }
    })

    expect(String(fetcher.mock.calls[0][0])).toContain("lat=40.3")
    expect(String(fetcher.mock.calls[0][0])).toContain("lon=-76.7")
  })

  it("preserves the OSM feature kind needed to distinguish a POI from a place", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      features: [{
        geometry: { type: "Point", coordinates: [-76.75, 40.35] },
        properties: {
          osm_id: 44,
          osm_type: "N",
          osm_key: "craft",
          osm_value: "brewery",
          name: "Switchback Brewing",
          state: "Pennsylvania",
          country: "United States"
        }
      }]
    }))

    const [place] = await searchPlaces("brewery", {
      baseUrl: "https://photon.test/api",
      fetcher,
      bias: { lat: 40.3, lon: -76.7 }
    })

    expect(place).toMatchObject({ kind: "brewery" })
  })

  it("keeps street, city, and postcode in labels so same-name places remain distinguishable", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ features: [{
      geometry: { type: "Point", coordinates: [-76.823, 40.31] },
      properties: {
        osm_id: 88,
        osm_type: "W",
        name: "Costco",
        house_number: "5125",
        street: "Jonestown Road",
        city: "Harrisburg",
        postcode: "17112",
        state: "Pennsylvania",
        country: "United States"
      }
    }] }))

    const [place] = await searchPlaces("Costco", {
      baseUrl: "https://photon.test/api",
      fetcher
    })

    expect(place.label).toContain("5125 Jonestown Road")
    expect(place.label).toContain("Harrisburg")
    expect(place.label).toContain("17112")
  })

  it("chooses the nearest in-coverage match instead of the provider's arbitrary first match", () => {
    const farther = {
      id: "farther", label: "Costco, Allentown", name: "Costco", region: "Pennsylvania",
      country: "United States", lat: 40.61, lon: -75.49
    }
    const nearer = {
      id: "nearer", label: "Costco, Harrisburg", name: "Costco", region: "Pennsylvania",
      country: "United States", lat: 40.31, lon: -76.82
    }

    expect(selectPreferredPlace([farther, nearer], { lat: 40.2732, lon: -76.8867 })?.id).toBe("nearer")
  })

  it("ranks stop ideas with Google review volume ahead of mere proximity", () => {
    const stops = filterFunStopCandidates([
      {
        id: "nearest",
        label: "Nearest Cafe, Pennsylvania",
        name: "Nearest Cafe",
        region: "Pennsylvania",
        country: "United States",
        lat: 40.301,
        lon: -76.701,
        kind: "cafe",
        rating: 4.8,
        reviewCount: 14
      },
      {
        id: "local-favorite",
        label: "Local Favorite, Pennsylvania",
        name: "Local Favorite",
        region: "Pennsylvania",
        country: "United States",
        lat: 40.33,
        lon: -76.73,
        kind: "restaurant",
        rating: 4.6,
        reviewCount: 1_840
      }
    ], "food", { lat: 40.3, lon: -76.7 })

    expect(stops.map((stop) => stop.id)).toEqual(["local-favorite", "nearest"])
  })

  it("prefers an in-coverage Pennsylvania match when the search is biased in Pennsylvania", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      features: [
        {
          geometry: { type: "Point", coordinates: [-74.4, 40.1] },
          properties: {
            osm_id: 1,
            osm_type: "N",
            name: "Newville",
            state: "New Jersey",
            country: "United States"
          }
        },
        {
          geometry: { type: "Point", coordinates: [-77.4, 40.17] },
          properties: {
            osm_id: 2,
            osm_type: "N",
            name: "Newville",
            state: "Pennsylvania",
            country: "United States"
          }
        }
      ]
    }))

    const places = await searchPlaces("Newville", {
      baseUrl: "https://photon.test/api",
      fetcher,
      bias: { lat: 40.27, lon: -76.89 }
    })

    expect(places.map((place) => place.region)).toEqual(["Pennsylvania", "New Jersey"])
  })

  it("treats New Jersey as first-class default routing coverage", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      features: [
        {
          geometry: { type: "Point", coordinates: [-80.0, 40.45] },
          properties: {
            osm_id: 1,
            osm_type: "N",
            name: "Target",
            state: "Pennsylvania",
            country: "United States"
          }
        },
        {
          geometry: { type: "Point", coordinates: [-74.6672, 40.3573] },
          properties: {
            osm_id: 2,
            osm_type: "N",
            name: "Target",
            state: "New Jersey",
            country: "United States"
          }
        }
      ]
    }))

    const places = await searchPlaces("Target", {
      baseUrl: "https://photon.test/api",
      fetcher,
      bias: { lat: 40.3573, lon: -74.6672 }
    })

    expect(places.map((place) => place.region)).toEqual(["New Jersey", "Pennsylvania"])
  })
})

describe("destination geocoder", () => {
  it("uses precise Google text results when configured", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ places: [{
      id: "precise-address",
      displayName: { text: "123 Market Street" },
      formattedAddress: "123 Market St, Philadelphia, PA 19106, USA",
      location: { latitude: 39.9501, longitude: -75.1437 },
      primaryType: "street_address",
      types: ["street_address"]
    }] }))

    const places = await searchDestinationPlaces("123 Market St, Philadelphia, PA", {
      photonBaseUrl: "https://photon.test/api",
      googleApiKey: "test-key",
      bias: { lat: 40.2732, lon: -76.8867 },
      fetcher
    })

    expect(places[0]).toMatchObject({ id: "google-precise-address", lat: 39.9501, lon: -75.1437 })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it("falls back to Photon when Google has no useful matches", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ places: [] }))
      .mockResolvedValueOnce(Response.json({ features: [{
        geometry: { type: "Point", coordinates: [-77.3005, 41.7487] },
        properties: {
          osm_id: 55,
          osm_type: "N",
          name: "Wellsboro",
          state: "Pennsylvania",
          country: "United States"
        }
      }] }))

    await expect(searchDestinationPlaces("Wellsboro, PA", {
      photonBaseUrl: "https://photon.test/api",
      googleApiKey: "test-key",
      bias: { lat: 40.2732, lon: -76.8867 },
      fetcher
    })).resolves.toEqual([
      expect.objectContaining({ id: "N-55", name: "Wellsboro" })
    ])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
