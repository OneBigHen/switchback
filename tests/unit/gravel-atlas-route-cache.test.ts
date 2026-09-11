import { describe, expect, it } from "vitest"
import { routeCacheKey } from "@/lib/server/route-cache"
import type { RouteRequest } from "@/lib/routing/types"

function request(gravelAtlas?: RouteRequest["gravelAtlas"]): RouteRequest {
  return {
    profile: "gravel",
    points: [
      { lat: 40.2, lon: -75.2 },
      { lat: 40.3, lon: -75.1 }
    ],
    ...(gravelAtlas ? { gravelAtlas } : {})
  }
}

describe("routeCacheKey gravel atlas semantics", () => {
  it("keeps Atlas OFF distinct from Atlas ON", () => {
    expect(routeCacheKey(request())).not.toBe(
      routeCacheKey(request({ enabled: true, intensity: "balanced" }))
    )
  })

  it("keeps each route-attraction intensity distinct", () => {
    const keys = new Set([
      routeCacheKey(request({ enabled: true, intensity: "balanced" })),
      routeCacheKey(request({ enabled: true, intensity: "more" })),
      routeCacheKey(request({ enabled: true, intensity: "maximum" }))
    ])

    expect(keys.size).toBe(3)
  })

  it("normalizes omitted and explicit disabled Atlas preferences to the same key", () => {
    expect(routeCacheKey(request())).toBe(
      routeCacheKey(request({ enabled: false, intensity: "maximum" }))
    )
  })
})
