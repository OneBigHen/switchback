import { describe, expect, it, vi } from "vitest"
import { normalizeRouteRequest } from "@/lib/domain/routing/normalized-request"
import { createGravelAtlasAwareProvider } from "@/lib/routing/gravel-atlas-provider"
import type { CorridorSourceCandidates } from "@/lib/routing/destination-corridors"
import type { GravelAtlasCorridor } from "@/lib/routing/gravel-atlas"
import type { PlannedRoute } from "@/lib/routing/types"

function route(id: string, distanceMiles: number, durationMinutes: number): PlannedRoute {
  return {
    id,
    name: id,
    profile: "adventure",
    geometry: [[-75.4, 40], [-75.1, 40]],
    waypoints: [],
    instructions: [],
    distanceMiles,
    durationMinutes,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 40,
    turnCount: 4,
    roadMix: {},
    surfaceMix: { gravel: 60 },
    routingSource: "live",
    previewOnly: false
  }
}

function corridor(id: string, latitude: number): GravelAtlasCorridor {
  return {
    id,
    label: `Gravel ${id}`,
    geometry: [[-75.32, latitude], [-75.25, latitude], [-75.18, latitude]],
    verifiedGravelMeters: 8_000,
    longestContinuousGravelMeters: 8_000,
    fragmentCount: 1,
    confidence: 0.95,
    verification: "routable",
    sourceIds: [`source-${id}`]
  }
}

function sources(corridors: GravelAtlasCorridor[]): CorridorSourceCandidates {
  return {
    curvatureSegments: [],
    gpxRoutes: [],
    hints: [],
    gravelAtlas: {
      preference: { enabled: true, intensity: "balanced" },
      corridors
    }
  }
}

const request = normalizeRouteRequest({
  profile: "adventure",
  points: [
    { lat: 40, lon: -75.4 },
    { lat: 40, lon: -75.1 }
  ],
  gravelAtlas: { enabled: true, intensity: "balanced" }
})

describe("ordinary Gravel Atlas route attraction", () => {
  it("keeps ordinary routing byte-for-byte on the disabled path", async () => {
    const base = vi.fn(async () => ({
      engine: "graphhopper" as const,
      engineVersion: "test",
      routes: [route("direct", 16, 28)]
    }))
    const resolve = vi.fn(async () => sources([corridor("a", 40)]))
    const provider = createGravelAtlasAwareProvider(base, resolve)

    const result = await provider({
      ...request,
      gravelAtlas: { enabled: false, intensity: "balanced" }
    })

    expect(result.routes[0]?.id).toBe("direct")
    expect(base).toHaveBeenCalledTimes(1)
    expect(resolve).not.toHaveBeenCalled()
  })

  it("routes a bounded graph-verified Atlas corridor for an ordinary A-to-B ride", async () => {
    const base = vi.fn(async (candidateRequest: typeof request) => ({
      engine: "graphhopper" as const,
      engineVersion: "test",
      routes: [candidateRequest.points.length > 2
        ? route("atlas", 19, 34)
        : route("direct", 16, 28)]
    }))
    const resolve = vi.fn(async () => sources([corridor("a", 40)]))
    const provider = createGravelAtlasAwareProvider(base, resolve)

    const result = await provider(request)

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(base).toHaveBeenCalledTimes(2)
    expect(result.routes).toHaveLength(1)
    expect(result.routes[0]).toMatchObject({ id: "atlas", candidateSource: "gravel-atlas" })
  })

  it("falls back to the direct route when an Atlas candidate requires an absurd detour", async () => {
    const base = vi.fn(async (candidateRequest: typeof request) => ({
      engine: "graphhopper" as const,
      engineVersion: "test",
      routes: [candidateRequest.points.length > 2
        ? route("atlas-detour", 60, 100)
        : route("direct", 16, 28)]
    }))
    const provider = createGravelAtlasAwareProvider(base, async () => sources([corridor("a", 40)]))

    const result = await provider(request)

    expect(result.routes[0]?.id).toBe("direct")
  })

  it("does not double-attract destination timeboxes or sketch-driven requests", async () => {
    const base = vi.fn(async () => ({
      engine: "graphhopper" as const,
      engineVersion: "test",
      routes: [route("direct", 16, 28)]
    }))
    const resolve = vi.fn(async () => sources([corridor("a", 40)]))
    const provider = createGravelAtlasAwareProvider(base, resolve)

    await provider({ ...request, targetMinutes: 90 })
    await provider({ ...request, sketchCorridor: [[-75.4, 40], [-75.1, 40]] })

    expect(base).toHaveBeenCalledTimes(2)
    expect(resolve).not.toHaveBeenCalled()
  })
})
