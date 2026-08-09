import { describe, expect, it, vi } from "vitest"
import { requestRoadMatch } from "@/lib/client/road-match-client"

describe("road matching client", () => {
  it("unwraps the API match envelope", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      matched: {
        displayName: "Ridge Road",
        edgeIds: ["edge-1"],
        geometry: [[-76.9, 40.2], [-76.88, 40.21]],
        entry: [-76.9, 40.2],
        exit: [-76.88, 40.21],
        streetNames: ["Ridge Road"],
        access: { motorcycle: "permitted", toll: false, surface: "asphalt" },
        graphVersion: "fixture",
        match: { status: "exact-edge", confidence: 1, maximumDriftMeters: 0 }
      },
      matchedAt: "2026-08-09T00:00:00Z"
    }), { status: 200 }))

    const result = await requestRoadMatch({
      start: { lat: 40.2, lon: -76.9 },
      end: { lat: 40.21, lon: -76.88 }
    }, { fetcher })

    expect(result.edgeIds).toEqual(["edge-1"])
    expect(result.displayName).toBe("Ridge Road")
  })
})
