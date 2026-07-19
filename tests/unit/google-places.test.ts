import { describe, expect, it, vi } from "vitest"
import { searchGooglePopularPlaces, searchGoogleTextPlaces } from "@/lib/places/google-places"

describe("Google Places stop discovery", () => {
  it("builds a varied rider-stop shortlist instead of simply sorting by review count", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      places: [
        {
          id: "chain-bar",
          displayName: { text: "Crowded Chain Bar" },
          formattedAddress: "0 Main Street, New Hope, PA",
          location: { latitude: 40.37, longitude: -74.93 },
          primaryType: "bar",
          types: ["bar", "point_of_interest"],
          rating: 4.9,
          userRatingCount: 14_000
        },
        {
          id: "trail-park",
          displayName: { text: "River Overlook State Park" },
          formattedAddress: "1 Main Street, New Hope, PA",
          location: { latitude: 40.35, longitude: -74.95 },
          primaryType: "state_park",
          types: ["state_park", "park", "tourist_attraction", "point_of_interest"],
          rating: 4.8,
          userRatingCount: 320
        },
        {
          id: "local-brewery",
          displayName: { text: "Local Trail Brewery" },
          formattedAddress: "2 River Road, New Hope, PA",
          location: { latitude: 40.36, longitude: -74.94 },
          primaryType: "brewery",
          types: ["brewery", "bar", "food", "point_of_interest"],
          rating: 4.6,
          userRatingCount: 1840
        }
      ]
    }))

    const places = await searchGooglePopularPlaces({
      apiKey: "test-key",
      kind: "brewery",
      center: { lat: 40.36, lon: -74.95 },
      route: [{ lat: 40.3, lon: -75 }, { lat: 40.4, lon: -74.9 }],
      radiusKm: 35,
      fetcher
    })

    expect(places.map((place) => place.name)).toEqual(["Local Trail Brewery", "River Overlook State Park", "Crowded Chain Bar"])
    expect(places[0]).toMatchObject({
      rating: 4.6,
      reviewCount: 1840,
      kind: "brewery",
      riderReason: "Destination brewery"
    })
    expect(places[1]).toMatchObject({ riderReason: "Park and overlook break" })
    expect(fetcher).toHaveBeenCalledWith(
      "https://places.googleapis.com/v1/places:searchNearby",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-goog-api-key": "test-key",
          "x-goog-fieldmask": expect.stringContaining("places.userRatingCount")
        })
      })
    )
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      includedTypes: expect.arrayContaining(["brewery", "park", "tourist_attraction"]),
      maxResultCount: 20,
      rankPreference: "POPULARITY",
      locationRestriction: { circle: { radius: 35_000 } }
    })
  })

  it("does not call Google without a configured key", async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(searchGooglePopularPlaces({
      kind: "coffee",
      center: { lat: 40.36, lon: -74.95 },
      fetcher
    })).resolves.toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("resolves a free-form address through text search with a local route bias", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      places: [{
        id: "market-street",
        displayName: { text: "123 Market Street" },
        formattedAddress: "123 Market St, Philadelphia, PA 19106, USA",
        location: { latitude: 39.9501, longitude: -75.1437 },
        primaryType: "street_address",
        types: ["street_address"]
      }]
    }))

    await expect(searchGoogleTextPlaces({
      apiKey: "test-key",
      query: "123 Market St, Philadelphia, PA",
      bias: { lat: 40.2732, lon: -76.8867 },
      fetcher
    })).resolves.toEqual([
      expect.objectContaining({
        id: "google-market-street",
        name: "123 Market Street",
        lat: 39.9501,
        lon: -75.1437,
        kind: "street_address"
      })
    ])

    expect(fetcher).toHaveBeenCalledWith(
      "https://places.googleapis.com/v1/places:searchText",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-goog-api-key": "test-key" })
      })
    )
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      textQuery: "123 Market St, Philadelphia, PA",
      pageSize: 8,
      locationBias: {
        circle: {
          center: { latitude: 40.2732, longitude: -76.8867 }
        }
      }
    })
  })
})
