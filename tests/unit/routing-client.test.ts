import { describe, expect, it, vi } from "vitest"
import { requestTripPlan } from "@/lib/client/routing-client"

const request = {
  profile: "twisty" as const,
  compare: true,
  points: [
    { lat: 40.2732, lon: -76.8867, label: "Harrisburg" },
    { lat: 39.8309, lon: -77.2311, label: "Gettysburg" }
  ]
}

describe("same-origin routing client", () => {
  it("posts the exact planner request and returns its normalized plan", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      selectedRouteId: "twisty-1",
      routes: [],
      warnings: []
    }), { status: 200 }))

    const plan = await requestTripPlan(request, fetcher)

    expect(fetcher).toHaveBeenCalledWith("/api/routes", expect.objectContaining({
      method: "POST",
      body: JSON.stringify(request)
    }))
    expect(plan.selectedRouteId).toBe("twisty-1")
  })

  it("preserves actionable API error codes", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: "OUT_OF_COVERAGE",
        message: "The destination is outside Pennsylvania.",
        action: "Choose different start or finish points.",
        requestId: "req-client-1"
      }
    }), { status: 400 }))

    await expect(requestTripPlan(request, fetcher)).rejects.toMatchObject({
      code: "OUT_OF_COVERAGE",
      message: "The destination is outside Pennsylvania.",
      action: "Choose different start or finish points.",
      requestId: "req-client-1"
    })
  })

  it("passes an abort signal through to the route request", async () => {
    const controller = new AbortController()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      selectedRouteId: "twisty-1",
      routes: [],
      warnings: []
    }), { status: 200 }))

    await requestTripPlan(request, fetcher, controller.signal)

    expect(fetcher).toHaveBeenCalledWith("/api/routes", expect.objectContaining({
      signal: controller.signal
    }))
  })
})
