import { describe, expect, it } from "vitest"
import { routeCacheKey } from "@/lib/server/route-cache"
import type { RouteRequest } from "@/lib/routing/types"

interface AtlasCacheNamespace {
  gravelAtlasGraphFingerprint?: string | null
  gravelAtlasSourceFingerprint?: string | null
}

const namespacedRouteCacheKey = routeCacheKey as unknown as (
  request: RouteRequest,
  namespace?: AtlasCacheNamespace
) => string

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

  it("changes an Atlas-enabled key when the active graph build changes", () => {
    const enabled = request({ enabled: true, intensity: "balanced" })
    const source = "source-a"

    expect(namespacedRouteCacheKey(enabled, {
      gravelAtlasGraphFingerprint: "graph-a",
      gravelAtlasSourceFingerprint: source
    })).not.toBe(namespacedRouteCacheKey(enabled, {
      gravelAtlasGraphFingerprint: "graph-b",
      gravelAtlasSourceFingerprint: source
    }))
  })

  it("changes an Atlas-enabled key when the official-source snapshot changes", () => {
    const enabled = request({ enabled: true, intensity: "balanced" })
    const graph = "graph-a"

    expect(namespacedRouteCacheKey(enabled, {
      gravelAtlasGraphFingerprint: graph,
      gravelAtlasSourceFingerprint: "source-a"
    })).not.toBe(namespacedRouteCacheKey(enabled, {
      gravelAtlasGraphFingerprint: graph,
      gravelAtlasSourceFingerprint: "source-b"
    }))
  })

  it("does not churn Atlas-disabled cache entries when Atlas builds change", () => {
    const disabled = request()

    expect(namespacedRouteCacheKey(disabled, {
      gravelAtlasGraphFingerprint: "graph-a",
      gravelAtlasSourceFingerprint: "source-a"
    })).toBe(namespacedRouteCacheKey(disabled, {
      gravelAtlasGraphFingerprint: "graph-b",
      gravelAtlasSourceFingerprint: "source-b"
    }))
  })
})
