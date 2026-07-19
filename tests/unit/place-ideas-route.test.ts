import { describe, expect, it, vi } from "vitest"

const { searchPlaces } = vi.hoisted(() => ({ searchPlaces: vi.fn() }))

vi.mock("@/lib/geocoding/photon", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/geocoding/photon")>(),
  searchPlaces
}))

import { GET } from "@/app/api/place-ideas/route"

describe("place ideas HTTP contract", () => {
  it("accepts fuel discovery and returns only mapped fuel candidates from the fallback provider", async () => {
    searchPlaces.mockResolvedValue([
      {
        id: "fuel", name: "Ridge Fuel", label: "Ridge Fuel, Pennsylvania",
        region: "Pennsylvania", country: "United States", lat: 40.31, lon: -76.71, kind: "fuel"
      },
      {
        id: "cafe", name: "Not fuel", label: "Not fuel, Pennsylvania",
        region: "Pennsylvania", country: "United States", lat: 40.32, lon: -76.72, kind: "cafe"
      }
    ])

    const response = await GET(new Request("http://switchback.test/api/place-ideas?kind=fuel&lat=40.3&lon=-76.7&radiusKm=25"))

    expect(response.status).toBe(200)
    expect(searchPlaces).toHaveBeenCalledWith("fuel", expect.objectContaining({
      bias: { lat: 40.3, lon: -76.7 },
      limit: 10
    }))
    await expect(response.json()).resolves.toMatchObject({
      provider: "photon",
      places: [{ id: "fuel", kind: "fuel" }]
    })
  })

  it("rejects a malformed fuel request at the HTTP boundary with the normalized 400 error", async () => {
    searchPlaces.mockClear()

    const response = await GET(new Request("http://switchback.test/api/place-ideas?kind=fuel&lat=not-a-number&lon=0"))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_PLACE_IDEA_REQUEST" }
    })
    expect(searchPlaces).not.toHaveBeenCalled()
  })
})
