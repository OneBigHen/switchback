import { describe, expect, it, vi } from "vitest"
import { normalizeRouteRequest } from "@/lib/domain/routing/normalized-request"
import { planDestinationTimebox, requestTimeboxedRoutes } from "@/lib/routing/planner-timebox"
import type { PlannedRoute, RouteRequest } from "@/lib/routing/types"
import type { RoutingResult } from "@/lib/routing/planner-contract"
import type { CorridorSourceCandidates } from "@/lib/routing/destination-corridors"

function route(request: RouteRequest): PlannedRoute {
  return {
    id: "direct-route",
    name: "Direct route",
    profile: request.profile,
    geometry: request.points.map((point) => [point.lon, point.lat]),
    waypoints: request.points.map((point) => ({ ...point })),
    instructions: [],
    distanceMiles: 20,
    durationMinutes: 115,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 40,
    turnCount: 8,
    roadMix: { secondary: 100 },
    surfaceMix: { asphalt: 100 },
    routingSource: "live",
    previewOnly: false
  }
}

describe("destination timebox planner strategy", () => {
  it("keeps the direct winner, metadata, and provider warning on the fast path", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<RoutingResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [route(request)],
      warnings: ["provider warning"]
    }))
    const request = normalizeRouteRequest({
      profile: "twisty",
      planningId: "plan-2",
      candidateSet: "primary",
      targetMinutes: 120,
      points: [
        { lat: 40.2, lon: -76.9 },
        { lat: 40.3, lon: -76.7 }
      ]
    })

    const plan = await planDestinationTimebox(request, provider)

    expect(provider).toHaveBeenCalledTimes(1)
    expect(plan.selectedRouteId).toBe("direct-route")
    expect(plan.routes).toEqual([expect.objectContaining({ id: "direct-route" })])
    expect(plan.planningId).toBe("plan-2")
    expect(plan.candidateSet).toBe("primary")
    expect(plan.targetMinutes).toBe(120)
    expect(plan.warnings).toEqual(["provider warning"])
  })

  it("does not turn caller cancellation during loop refinement into a stale success", async () => {
    const caller = new AbortController()
    const reason = new Error("rider cancelled")
    let calls = 0
    const provider = vi.fn(async (request: RouteRequest): Promise<RoutingResult> => {
      calls += 1
      if (request.roundTrip?.targetMinutes === 480) {
        caller.abort(reason)
        throw reason
      }
      return {
        engine: "graphhopper",
        engineVersion: "11.0",
        routes: [{
          ...route(request),
          id: `loop-${calls}`,
          geometry: [
            [-76.9, 40.2],
            [-76.8, 40.3],
            [-76.9, 40.2]
          ],
          durationMinutes: 60
        }]
      }
    })

    await expect(requestTimeboxedRoutes(
      normalizeRouteRequest({
        profile: "twisty",
        points: [{ lat: 40.2, lon: -76.9 }],
        roundTrip: { targetMinutes: 120, seed: 4 }
      }),
      provider,
      undefined,
      { signal: caller.signal }
    )).rejects.toBe(reason)
  })

  it("bounds optional corridor resolution and disposes its deadline", async () => {
    vi.useFakeTimers()
    try {
      const resolver = vi.fn(() => new Promise<CorridorSourceCandidates>(() => {}))
      const provider = vi.fn(async (request: RouteRequest): Promise<RoutingResult> => ({
        engine: "graphhopper",
        engineVersion: "11.0",
        routes: [{ ...route(request), durationMinutes: 60 }]
      }))
      const pending = planDestinationTimebox(
        normalizeRouteRequest({
          profile: "twisty",
          targetMinutes: 120,
          points: [
            { lat: 40.2, lon: -76.9 },
            { lat: 40.3, lon: -76.7 }
          ]
        }),
        provider,
        { resolveCorridors: resolver }
      )
      const assertion = expect(pending).resolves.toMatchObject({ selectedRouteId: "direct-route" })
      await vi.advanceTimersByTimeAsync(6_000)

      await assertion
      expect(resolver).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
