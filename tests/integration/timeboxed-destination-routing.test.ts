import { describe, expect, it, vi } from "vitest"
import { planMotorcycleTrip } from "@/lib/routing/planner"
import type { TripPlanRequest } from "@/lib/routing/planner"
import type { GraphHopperResult } from "@/lib/routing/graphhopper"
import type { PlannedRoute, RouteRequest } from "@/lib/routing/types"

/**
 * Phase 4 orchestration with a mock provider: the mock returns a duration
 * that grows with the number of shaping points, so a timeboxed destination
 * request must deliberately route corridors rather than accept the direct
 * route. The golden live test at the bottom skips when no router is reachable.
 */

const HATBORO = { lat: 40.1745, lon: -75.1059, label: "Hatboro" }
const STOCKTON = { lat: 40.4082, lon: -74.9792, label: "Stockton NJ" }

function makeRoute(request: RouteRequest, durationMinutes: number): PlannedRoute {
  const geometry: [number, number][] = request.points.map((point) => [point.lon, point.lat])
  return {
    id: `${request.profile}-${request.points.length}-${Math.round(durationMinutes)}`,
    name: `${request.profile} route`,
    profile: request.profile,
    geometry,
    waypoints: request.points.map((point) => ({ ...point })),
    instructions: [],
    distanceMiles: 20 + request.points.length * 12,
    durationMinutes,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 60,
    turnCount: 15,
    roadMix: { secondary: 60, tertiary: 30, residential: 10 },
    surfaceMix: { asphalt: 100 },
    routingSource: "live",
    previewOnly: false
  }
}

describe("timeboxed destination routing (mock provider)", () => {
  it("returns the direct route when it already lands inside the ±10% band", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [makeRoute(request, 115)]
    }))
    const plan = await planMotorcycleTrip({
      profile: "twisty",
      targetMinutes: 120,
      points: [HATBORO, STOCKTON]
    } as TripPlanRequest, provider)

    expect(plan.routes).toHaveLength(1)
    expect(provider).toHaveBeenCalledTimes(1)
    expect(plan.warnings).toEqual([])
  })

  it("warns and returns the closest safe route when the direct route exceeds 110% of target", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [makeRoute(request, 150)]
    }))
    const plan = await planMotorcycleTrip({
      profile: "quick",
      targetMinutes: 120,
      points: [HATBORO, STOCKTON]
    } as TripPlanRequest, provider)

    expect(plan.routes).toHaveLength(1)
    expect(provider).toHaveBeenCalledTimes(1)
    expect(plan.warnings.join(" ")).toMatch(/exceeds the 120-minute target/)
  })

  it("routes up to four shaped corridors and selects the best passing candidate", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
      // Baseline (2 points): 45 min. Shaped corridors: longer.
      const duration = request.points.length === 2 ? 45 : 112 + request.points.length * 3
      return {
        engine: "graphhopper",
        engineVersion: "11.0",
        routes: [makeRoute(request, duration)]
      }
    })
    const plan = await planMotorcycleTrip({
      profile: "twisty",
      targetMinutes: 120,
      points: [HATBORO, STOCKTON]
    } as TripPlanRequest, provider, undefined, {
      resolveCorridors: async () => ({
        curvatureSegments: [{
          id: "curv-a",
          name: "Corridor A",
          score: 90,
          surface: "asphalt",
          geometry: [
            [-75.3, 40.3],
            [-75.2, 40.32],
            [-75.1, 40.35]
          ]
        }, {
          id: "curv-b",
          name: "Corridor B",
          score: 85,
          surface: "asphalt",
          geometry: [
            [-75.4, 40.25],
            [-75.25, 40.28],
            [-75.1, 40.33]
          ]
        }],
        gpxRoutes: [],
        hints: []
      })
    })

    // Baseline call plus one call per accepted corridor candidate.
    const corridorCalls = provider.mock.calls.filter(([call]) => call.points.length > 2)
    expect(corridorCalls.length).toBeGreaterThanOrEqual(1)
    expect(corridorCalls.length).toBeLessThanOrEqual(4)
    expect(plan.routes).toHaveLength(1)
    expect(plan.routes[0].durationMinutes).toBeGreaterThanOrEqual(108)
    expect(plan.routes[0].durationMinutes).toBeLessThanOrEqual(132)
  })

  it("falls back to the closest safe route with a warning when no corridor passes the gates", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [makeRoute(request, request.points.length === 2 ? 45 : 200)]
    }))
    const plan = await planMotorcycleTrip({
      profile: "twisty",
      targetMinutes: 120,
      points: [HATBORO, STOCKTON]
    } as TripPlanRequest, provider, undefined, {
      resolveCorridors: async () => ({
        curvatureSegments: [{
          id: "curv-a",
          name: "Corridor A",
          score: 90,
          surface: "asphalt",
          geometry: [[-75.3, 40.3], [-75.2, 40.32], [-75.1, 40.35]]
        }],
        gpxRoutes: [],
        hints: []
      })
    })

    expect(plan.warnings.join(" ")).toMatch(/closest safe route/)
    expect(plan.routes).toHaveLength(1)
  })
})

describe("live golden route (Hatboro → Stockton)", () => {
  it("produces a 108–132 minute non-Philadelphia Upper Bucks route on a live router", async (ctx) => {
    // Live gate: the router must be up AND expose the Phase 3 toll detail
    // (i.e. serve the re-imported candidate graph), and the app must be
    // reachable. Until the Phase 7 host deploys those, this test skips.
    const routerBase = (process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8989").replace(/\/$/, "")
    const appBase = (process.env.SWITCHBACK_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "")
    let live = false
    try {
      const health = await fetch(`${routerBase}/health`, { signal: AbortSignal.timeout(5_000) })
      const probe = await fetch(`${routerBase}/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: "motorcycle_twisty",
          points: [[-76.8867, 40.2732], [-76.3055, 40.0379]],
          points_encoded: false,
          details: ["toll"]
        }),
        signal: AbortSignal.timeout(10_000)
      })
      const appHealth = await fetch(`${appBase}/api/health`, { signal: AbortSignal.timeout(5_000) })
      live = health.ok && probe.ok && appHealth.ok
    } catch {
      live = false
    }
    if (!live) {
      ctx.skip()
      return
    }
    const response = await fetch(`${appBase}/api/routes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        profile: "twisty",
        compare: false,
        targetMinutes: 120,
        points: [HATBORO, STOCKTON]
      }),
      signal: AbortSignal.timeout(20_000)
    })
    expect(response.status).toBe(200)
    const plan = await response.json() as { routes: PlannedRoute[]; warnings: string[] }
    const route = plan.routes[0]
    expect(route).toBeDefined()
    expect(route.durationMinutes).toBeGreaterThanOrEqual(108)
    expect(route.durationMinutes).toBeLessThanOrEqual(132)
    expect(plan.warnings.join(" ")).not.toMatch(/closest safe route/)
  })
})
