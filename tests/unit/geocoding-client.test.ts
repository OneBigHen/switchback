import { describe, expect, it, vi } from "vitest"
import { searchPlacesClient } from "@/lib/client/geocoding-client"

describe("same-origin geocoding client", () => {
  it("encodes the rider query and returns place suggestions", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ places: [{
      id: "N-1",
      label: "Wellsboro, Pennsylvania",
      name: "Wellsboro",
      region: "Pennsylvania",
      country: "United States",
      lat: 41.7487,
      lon: -77.3005
    }] }), { status: 200 }))

    const places = await searchPlacesClient("Wellsboro, PA", fetcher)

    expect(fetcher).toHaveBeenCalledWith("/api/geocode?q=Wellsboro%2C+PA", expect.anything())
    expect(places[0].label).toMatch(/Wellsboro/)
  })
})
