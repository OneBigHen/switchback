import { describe, expect, it, vi } from "vitest"
import { requestRoadMatch } from "@/lib/client/road-match-client"

describe("road matching client", () => {
  it("unwraps the API success envelope", async () => {
    const matched = {
      displayName: "Ridge Road",
      edgeIds: ["edge-1"],
      geometry: [[-76.9, 40.2], [-76.88, 40.21]] as [number, number][],
      entry: [-76.9, 40.2] as [number, number],
      exit: [-76.88, 40.21] as [number, number],
      streetNames: ["Ridge Road"],
      access: { motorcycle: "permitted" as const, toll: false, surface: "asphalt" },
      graphVersion: "11.0",
      match: { status: "exact-edge" as const, confidence: 1, maximumDriftMeters: 0 }
    }
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ matched, matchedAt: "2026-08-11T00:00:00Z" }), { status: 200 }))

    await expect(requestRoadMatch({
      start: { lat: 40.2, lon: -76.9 },
      end: { lat: 40.21, lon: -76.88 }
    }, { fetcher })).resolves.toEqual(matched)
  })
})
