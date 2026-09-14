import { afterEach, describe, expect, it, vi } from "vitest"
import { serverTimingHeader } from "@/app/api/routes/handler"
import { normalizeRouteRequest } from "@/lib/domain/routing/normalized-request"
import { LOOP_FALLBACK_BUDGET_MS, requestTimeboxedRoutes } from "@/lib/routing/planner-timebox"

afterEach(() => vi.restoreAllMocks())

describe("routing latency bounds", () => {
  it("stops walking a failing loop down once the fallback budget is spent", async () => {
    let now = 0
    vi.spyOn(performance, "now").mockImplementation(() => now)
    const provider = vi.fn(async () => {
      // Each failed engine call costs three seconds of wall clock.
      now += 3_000
      throw new Error("Could not find a valid point after 3 tries")
    })

    await expect(requestTimeboxedRoutes(
      normalizeRouteRequest({ profile: "twisty", points: [{ lat: 40.2, lon: -76.9 }], roundTrip: { targetMinutes: 90, seed: 3 } }),
      provider
    )).rejects.toThrow(/valid point/)

    // Without the budget this walks every distance step and seed (up to 35 calls).
    expect(provider.mock.calls.length).toBe(Math.ceil(LOOP_FALLBACK_BUDGET_MS / 3_000))
  })

  it("reports planning stages as a Server-Timing header", () => {
    expect(serverTimingHeader({ primary: 812.4, alternatives: 2310 })).toEqual({
      "server-timing": "primary;dur=812, alternatives;dur=2310"
    })
    expect(serverTimingHeader(undefined)).toEqual({})
    expect(serverTimingHeader({ "bad name": 1 })).toEqual({})
  })
})
