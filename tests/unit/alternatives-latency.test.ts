import { afterEach, describe, expect, it, vi } from "vitest"
import { createLatestRequestGate } from "@/lib/client/latest-request"
import { runLatestTripPlan } from "@/lib/client/trip-planning-coordinator"
import { createHybridRouteProvider } from "@/lib/routing/hybrid"
import { normalizeRouteRequest } from "@/lib/domain/routing/normalized-request"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"
import type { RoutingResult } from "@/lib/routing/planner"
import type { PlannedRoute } from "@/lib/routing/types"
import type { RouteRequest } from "@/lib/routing/types"
import type { PlanningPhase } from "@/stores/planner-store"

interface TimingEvent {
  atMs: number
  boundary: "request" | "provider" | "presentation"
  detail: string
}

const request: TripPlanRequest = {
  profile: "scenic",
  points: [
    { lat: 40.2, lon: -76.9 },
    { lat: 40.3, lon: -76.8 }
  ]
}

function route(id: string): PlannedRoute {
  return {
    id,
    name: id,
    profile: "scenic",
    geometry: [[-76.9, 40.2], [-76.8, 40.3]],
    waypoints: [],
    instructions: [],
    distanceMiles: 20,
    durationMinutes: 35,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 50,
    turnCount: 12,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

function routingResult(engine: "graphhopper" | "valhalla", id: string): RoutingResult {
  return {
    engine,
    engineVersion: engine === "graphhopper" ? "11.0" : "3.8.2",
    routes: [route(id)]
  }
}

const primary: TripPlan = {
  selectedRouteId: "primary",
  routes: [route("primary")],
  warnings: [],
  planningId: "planning-latency-0001"
}

const alternatives: TripPlan = {
  selectedRouteId: "primary",
  routes: [{ ...route("alternative"), profile: "quick" }],
  warnings: [],
  planningId: "planning-latency-0001",
  candidateSet: "alternatives"
}

function planner(trace: TimingEvent[], startMs: number) {
  return {
    beginRouting: vi.fn(),
    applyPlan: vi.fn(),
    mergeAlternatives: vi.fn(),
    failRouting: vi.fn(),
    beginPlanning: vi.fn(),
    setPlanningPhase: vi.fn((phase: PlanningPhase) => {
      trace.push({
        atMs: Date.now() - startMs,
        boundary: "presentation",
        detail: `phase:${phase}`
      })
    }),
    cancelPlanning: vi.fn()
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
})

describe("alternatives latency evidence", () => {
  it("separates an 80-second provider response from client presentation settlement", async () => {
    vi.useFakeTimers()
    const startMs = Date.now()
    const trace: TimingEvent[] = []
    const state = planner(trace, startMs)
    const requestPlan = vi.fn((candidateRequest: TripPlanRequest) => {
      const candidateSet = candidateRequest.candidateSet ?? "primary"
      trace.push({
        atMs: Date.now() - startMs,
        boundary: "request",
        detail: `start:${candidateSet}`
      })
      if (candidateSet === "primary") {
        return Promise.resolve(primary).then((result) => {
          trace.push({
            atMs: Date.now() - startMs,
            boundary: "provider",
            detail: "response:primary"
          })
          return result
        })
      }
      return new Promise<TripPlan>((resolve) => {
        setTimeout(() => {
          trace.push({
            atMs: Date.now() - startMs,
            boundary: "provider",
            detail: "response:alternatives"
          })
          resolve(alternatives)
        }, 80_000)
      })
    })

    const result = await runLatestTripPlan({
      request,
      gate: createLatestRequestGate(),
      getPlanner: () => state,
      requestPlan,
      onWarning: vi.fn()
    })
    await flushMicrotasks()

    expect(result).toBe(primary)
    expect(state.setPlanningPhase).toHaveBeenCalledWith("alternatives")
    expect(trace).toEqual(expect.arrayContaining([
      { atMs: 0, boundary: "request", detail: "start:primary" },
      { atMs: 0, boundary: "provider", detail: "response:primary" },
      { atMs: 0, boundary: "presentation", detail: "phase:alternatives" },
      { atMs: 0, boundary: "request", detail: "start:alternatives" }
    ]))

    await vi.advanceTimersByTimeAsync(45_000)
    expect(trace.find((event) => event.detail === "response:alternatives")).toBeUndefined()
    expect(state.setPlanningPhase).toHaveBeenLastCalledWith("alternatives")

    await vi.advanceTimersByTimeAsync(35_000)
    await flushMicrotasks()

    expect(state.mergeAlternatives).toHaveBeenCalledWith(alternatives)
    expect(state.setPlanningPhase).toHaveBeenLastCalledWith("ready")
    expect(trace).toContainEqual({
      atMs: 80_000,
      boundary: "provider",
      detail: "response:alternatives"
    })
    expect(trace).toContainEqual({
      atMs: 80_000,
      boundary: "presentation",
      detail: "phase:ready"
    })
  })

  it("records GraphHopper failure and Valhalla fallback as separate provider phases", async () => {
    vi.useFakeTimers()
    const startMs = Date.now()
    const trace: TimingEvent[] = []
    const graphHopper = vi.fn((candidateRequest: RouteRequest) => {
      trace.push({
        atMs: Date.now() - startMs,
        boundary: "request",
        detail: `start:graphhopper:${candidateRequest.candidateSet ?? "primary"}`
      })
      return new Promise<RoutingResult>((_, reject) => {
        setTimeout(() => {
          trace.push({
            atMs: Date.now() - startMs,
            boundary: "provider",
            detail: "error:graphhopper"
          })
          reject(new Error("GraphHopper unavailable"))
        }, 100)
      })
    })
    const valhalla = vi.fn((candidateRequest: RouteRequest) => {
      trace.push({
        atMs: Date.now() - startMs,
        boundary: "request",
        detail: `start:valhalla:${candidateRequest.candidateSet ?? "primary"}`
      })
      return new Promise<RoutingResult>((resolve) => {
        setTimeout(() => {
          trace.push({
            atMs: Date.now() - startMs,
            boundary: "provider",
            detail: "response:valhalla-fallback"
          })
          resolve(routingResult("valhalla", "fallback"))
        }, 25)
      })
    })
    const provider = createHybridRouteProvider({ graphHopper, valhalla })
    const pending = provider(normalizeRouteRequest(request), {})

    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(25)
    const response = await pending

    expect(response.routes[0]?.provenance).toMatchObject({
      provider: "valhalla",
      fallback: true,
      fallbackFrom: "graphhopper"
    })
    expect(trace).toEqual([
      { atMs: 0, boundary: "request", detail: "start:graphhopper:primary" },
      { atMs: 100, boundary: "provider", detail: "error:graphhopper" },
      { atMs: 100, boundary: "request", detail: "start:valhalla:primary" },
      { atMs: 125, boundary: "provider", detail: "response:valhalla-fallback" }
    ])
  })

  it("records cancellation and rejects a late alternative from settling presentation", async () => {
    vi.useFakeTimers()
    const startMs = Date.now()
    const trace: TimingEvent[] = []
    const state = planner(trace, startMs)
    const controller = new AbortController()
    let resolveAlternatives!: (result: TripPlan) => void
    const requestPlan = vi.fn((candidateRequest: TripPlanRequest, signal?: AbortSignal) => {
      const candidateSet = candidateRequest.candidateSet ?? "primary"
      trace.push({
        atMs: Date.now() - startMs,
        boundary: "request",
        detail: `start:${candidateSet}`
      })
      if (candidateSet === "primary") return Promise.resolve(primary)
      signal?.addEventListener("abort", () => {
        trace.push({
          atMs: Date.now() - startMs,
          boundary: "provider",
          detail: "cancel:alternatives"
        })
      }, { once: true })
      return new Promise<TripPlan>((resolve) => {
        resolveAlternatives = resolve
      })
    })

    const gate = createLatestRequestGate()
    const pending = runLatestTripPlan({
      request,
      gate,
      getPlanner: () => state,
      requestPlan,
      onWarning: vi.fn(),
      controller
    })
    await expect(pending).resolves.toBe(primary)
    await flushMicrotasks()

    controller.abort()
    gate.invalidate()
    state.cancelPlanning()
    trace.push({ atMs: Date.now() - startMs, boundary: "presentation", detail: "phase:cancelled" })
    resolveAlternatives(alternatives)
    await flushMicrotasks()

    expect(trace).toContainEqual({
      atMs: 0,
      boundary: "provider",
      detail: "cancel:alternatives"
    })
    expect(trace).toContainEqual({
      atMs: 0,
      boundary: "presentation",
      detail: "phase:cancelled"
    })
    expect(state.mergeAlternatives).not.toHaveBeenCalled()
  })
})
