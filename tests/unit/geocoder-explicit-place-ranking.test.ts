import { describe, expect, it, vi } from "vitest"
import { searchPlaces, selectPreferredPlace } from "@/lib/geocoding/photon"

const texasAustin = {
  id: "austin-tx",
  label: "Austin, Texas, United States",
  name: "Austin",
  region: "Texas",
  country: "United States",
  lat: 30.2672,
  lon: -97.7431
}

const pennsylvaniaAustin = {
  id: "austin-pa",
  label: "Austin, Pennsylvania, United States",
  name: "Austin",
  region: "Pennsylvania",
  country: "United States",
  lat: 41.64,
  lon: -78.09
}

describe("explicit place ranking", () => {
  it("keeps the provider's top out-of-region textual match ahead of a local namesake", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      features: [
        {
          geometry: { type: "Point", coordinates: [texasAustin.lon, texasAustin.lat] },
          properties: {
            osm_id: 1,
            osm_type: "N",
            name: "Austin",
            state: "Texas",
            country: "United States"
          }
        },
        {
          geometry: { type: "Point", coordinates: [pennsylvaniaAustin.lon, pennsylvaniaAustin.lat] },
          properties: {
            osm_id: 2,
            osm_type: "N",
            name: "Austin",
            state: "Pennsylvania",
            country: "United States"
          }
        }
      ]
    }))

    const results = await searchPlaces("Austin", {
      baseUrl: "https://photon.test/api",
      fetcher,
      bias: { lat: 40.2732, lon: -76.8867 }
    })

    expect(results.map((place) => place.region)).toEqual(["Texas", "Pennsylvania"])
  })

  it("does not let client-side nearest-match selection undo the provider's explicit global match", () => {
    expect(selectPreferredPlace(
      [texasAustin, pennsylvaniaAustin],
      { lat: 40.2732, lon: -76.8867 }
    )?.id).toBe("austin-tx")
  })
})
