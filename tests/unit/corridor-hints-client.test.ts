import { describe, expect, it, vi } from "vitest"
import { characterForProfile, refreshCorridorHints } from "@/lib/client/corridor-hints-client"
import type { TripPlanRequest } from "@/lib/routing/planner"

const request: TripPlanRequest = {
  profile: "twisty",
  targetMinutes: 120,
  points: [
    { lat: 40.1745, lon: -75.1059, label: "Hatboro" },
    { lat: 40.4082, lon: -74.9792, label: "Stockton NJ" }
  ]
}

describe("corridor hint refresh (Phase 5 merge)", () => {
  it("posts the ride intent to the adviser endpoint with the derived character", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }))
    await refreshCorridorHints(request, fetcher)

    expect(fetcher).toHaveBeenCalledWith(
      "/api/ride-corridors",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          start: { lat: 40.1745, lon: -75.1059, label: "Hatboro" },
          finish: { lat: 40.4082, lon: -74.9792, label: "Stockton NJ" },
          targetMinutes: 120,
          character: "twisty"
        })
      })
    )
  })

  it("skips the refresh when the request has no duration target", async () => {
    const fetcher = vi.fn<typeof fetch>()
    await refreshCorridorHints({ ...request, targetMinutes: undefined }, fetcher)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("skips the refresh for single-point (loop) requests", async () => {
    const fetcher = vi.fn<typeof fetch>()
    await refreshCorridorHints({ ...request, points: [request.points[0]!] }, fetcher)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("never throws when the adviser is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error("down") })
    await expect(refreshCorridorHints(request, fetcher)).resolves.toBeUndefined()
  })

  it("maps profiles to ride characters", () => {
    expect(characterForProfile("quick")).toBe("quick")
    expect(characterForProfile("scenic")).toBe("scenic")
    expect(characterForProfile("adventure")).toBe("adventure")
    expect(characterForProfile("unknown")).toBe("balanced")
  })
})
