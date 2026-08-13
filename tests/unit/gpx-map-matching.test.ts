import { describe, expect, it, vi } from "vitest"
import { mapMatchGpxStream } from "@/lib/gpx/map-matching"

async function* chunks(): AsyncIterable<string> {
  yield "<gpx><trk>"
  yield "<trkseg/></trk></gpx>"
}

describe("GPX map matching adapter", () => {
  it("does not consume input when GraphHopper is not configured", async () => {
    const source = {
      async *[Symbol.asyncIterator](): AsyncIterableIterator<string> {
        throw new Error("input should not be read")
      }
    }
    await expect(mapMatchGpxStream(source)).resolves.toMatchObject({
      status: "not-configured",
      provider: null
    })
  })

  it("reports matched only from a valid GraphHopper path response", async () => {
    let requestUrl = ""
    let requestBody = ""
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input)
      requestBody = await new Response(init?.body).text()
      return new Response(JSON.stringify({ paths: [{ distance: 1234, snapped_waypoints: [1, 2] }] }), { status: 200 })
    })

    const match = await mapMatchGpxStream(chunks(), {
      endpoint: "https://router.test/match?foo=bar",
      profile: "motorcycle_twisty",
      fetchImpl
    })

    expect(match).toMatchObject({
      status: "matched",
      provider: "graphhopper",
      profile: "motorcycle_twisty",
      matchedDistanceMeters: 1234,
      snappedWaypointCount: 2
    })
    expect(requestUrl).toContain("profile=motorcycle_twisty")
    expect(requestUrl).toContain("type=json")
    expect(requestUrl).toContain("foo=bar")
    expect(requestBody).toContain("<gpx>")
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it("keeps unmatched and provider failures distinct", async () => {
    const unmatched = await mapMatchGpxStream(chunks(), {
      endpoint: "https://router.test/match",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ paths: [] }), { status: 200 }))
    })
    const failed = await mapMatchGpxStream(chunks(), {
      endpoint: "https://router.test/match",
      fetchImpl: vi.fn(async () => new Response("method not allowed", { status: 405 }))
    })

    expect(unmatched.status).toBe("unmatched")
    expect(failed).toMatchObject({ status: "failed", message: "GraphHopper map matching returned HTTP 405." })
  })
})
