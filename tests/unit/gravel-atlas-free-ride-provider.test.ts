import { describe, expect, it, vi } from "vitest"
import { normalizeRouteRequest } from "@/lib/domain/routing/normalized-request"
import { createGravelAtlasAwareProvider } from "@/lib/routing/gravel-atlas-provider"
import type { CorridorSourceCandidates } from "@/lib/routing/destination-corridors"
import type { GravelAtlasCorridor } from "@/lib/routing/gravel-atlas"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"

function route(id: string, minutes: number, geometry: Coordinate[]): PlannedRoute {
  return {
    id,
    name: id,
    profile: "adventure",
    geometry,
    waypoints: [],
    instructions: [],
    distanceMiles: 22,
    durationMinutes: minutes,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 35,
    turnCount: 5,
    roadMix: {},
    surfaceMix: { gravel: 50 },
    routingSource: "live",
    previewOnly: false
  }
}

const atlas: GravelAtlasCorridor = {
  id: "loop-gravel",
  label: "Loop gravel",
  geometry: [[-75.36, 40], [-75.31, 40], [-75.27, 40]],
  verifiedGravelMeters: 8_000,
  longestContinuousGravelMeters: 8_000,
  fragmentCount: 1,
  confidence: 0.96,
  verification: "routable",
  sourceIds: ["official-loop"]
}

function sources(): CorridorSourceCandidates {
  return {
    curvatureSegments: [],
    gpxRoutes: [],
    hints: [],
    gravelAtlas: {
      preference: { enabled: true, intensity: "balanced" },
      corridors: [atlas]
    }
  }
}

const request = normalizeRouteRequest({
  profile: "adventure",
  source: "free-ride",
  points: [{ lat: 40, lon: -75.4 }],
  roundTrip: { targetMinutes: 60, seed: 7 },
  gravelAtlas: { enabled: true, intensity: "balanced" }
})

const directLoop: Coordinate[] = [
  [-75.4, 40], [-75.4, 40.08], [-75.32, 40.08], [-75.4, 40]
]

describe("Free Ride Gravel Atlas attraction", () => {
  it("tries a graph-verified gravel loop once and keeps the target duration bounded", async () => {
    const base = vi.fn(async (candidateRequest: typeof request) => ({
      engine: "graphhopper" as const,
      engineVersion: "test",
      routes: [candidateRequest.roundTrip
        ? route("seed-loop", 60, directLoop)
        : route("atlas-loop", 62, candidateRequest.points.map((point) => [point.lon, point.lat]))]
    }))
    const resolve = vi.fn(async () => sources())
    const provider = createGravelAtlasAwareProvider(base, resolve)

    const first = await provider(request)
    const second = await provider({
      ...request,
      roundTrip: { ...request.roundTrip!, seed: 108 }
    })

    expect(first.routes[0]).toMatchObject({ id: "atlas-loop", candidateSource: "gravel-atlas" })
    expect(first.routes[0]?.gravelAtlasEvidence?.matchedMeters).toBeGreaterThan(800)
    expect(second.routes[0]?.id).toBe("seed-loop")
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(base).toHaveBeenCalledTimes(3)
  })

  it("keeps the seeded loop when gravel shaping misses the ride-time budget", async () => {
    const base = vi.fn(async (candidateRequest: typeof request) => ({
      engine: "graphhopper" as const,
      engineVersion: "test",
      routes: [candidateRequest.roundTrip
        ? route("seed-loop", 60, directLoop)
        : route("too-long", 92, candidateRequest.points.map((point) => [point.lon, point.lat]))]
    }))
    const provider = createGravelAtlasAwareProvider(base, async () => sources())

    const result = await provider(request)

    expect(result.routes[0]?.id).toBe("seed-loop")
    expect(result.routes[0]?.gravelAtlasEvidence?.matchedMeters).toBe(0)
  })

  it("propagates cancellation raised while routing a shaped Free Ride candidate", async () => {
    const controller = new AbortController()
    const cancellation = new Error("cancelled in base provider")
    let calls = 0
    const base = vi.fn(async () => {
      calls += 1
      if (calls === 1) {
        return {
          engine: "graphhopper" as const,
          engineVersion: "test",
          routes: [route("seed-loop", 60, directLoop)]
        }
      }
      controller.abort()
      throw cancellation
    })
    const provider = createGravelAtlasAwareProvider(base, async () => sources())

    await expect(provider(request, { signal: controller.signal })).rejects.toBe(cancellation)
    expect(base).toHaveBeenCalledTimes(2)
  })
})
