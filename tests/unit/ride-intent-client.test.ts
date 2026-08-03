import { describe, expect, it, vi } from "vitest"
import { requestRideIntent } from "@/lib/client/ride-intent-client"

describe("ride intent client", () => {
  it("posts a free-form request to the same-origin intent boundary", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      mode: "loop",
      profile: "adventure",
      rideCharacter: "adventure",
      targetMinutes: 120,
      tollPolicy: "allow-with-warning",
      ambiguous: false,
      startQuery: null,
      destinationQuery: null,
      stopQuery: "brewery",
      preferGravel: true,
      avoidHighways: false,
      summary: "120-minute adventure loop",
      source: "local"
    }), { status: 200 }))

    const result = await requestRideIntent("Two hours, gravel and beer", fetcher)

    expect(result.mode).toBe("loop")
    expect(fetcher).toHaveBeenCalledWith("/api/ride-intent", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ prompt: "Two hours, gravel and beer" })
    }))
  })

  it("surfaces a safe API error", async () => {
    const request = requestRideIntent("route", vi.fn(async () => new Response(JSON.stringify({
      error: { code: "RIDE_INTENT_UNAVAILABLE", message: "Try again shortly." }
    }), { status: 503 })))

    await expect(request).rejects.toMatchObject({
      code: "RIDE_INTENT_UNAVAILABLE",
      status: 503,
      message: "Try again shortly."
    })
  })
})
