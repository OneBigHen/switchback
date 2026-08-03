import { describe, expect, it } from "vitest"
import { createRouteCache, routeCacheKey } from "@/lib/server/route-cache"
import type { TripPlan } from "@/lib/routing/planner"
import type { RouteRequest } from "@/lib/routing/types"

const plan: TripPlan = {
  selectedRouteId: "route-1",
  routes: [],
  warnings: []
}

function request(overrides: Partial<RouteRequest> = {}): RouteRequest {
  return {
    profile: "twisty",
    points: [
      { lat: 40.1745, lon: -75.1059 },
      { lat: 40.4082, lon: -75.0 }
    ],
    ...overrides
  }
}

describe("route cache", () => {
  it("returns a stored plan within its TTL", () => {
    const cache = createRouteCache({ ttlMs: 60_000 })
    const key = routeCacheKey(request())
    cache.set(key, plan)
    expect(cache.get(key)).toBe(plan)
  })

  it("expires entries after the TTL", async () => {
    const cache = createRouteCache({ ttlMs: 5 })
    const key = routeCacheKey(request())
    cache.set(key, plan)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(cache.get(key)).toBeUndefined()
  })

  it("bounds the number of entries, evicting the oldest first", () => {
    const cache = createRouteCache({ ttlMs: 60_000, maxEntries: 2 })
    const first = request({ targetMinutes: 90 })
    const second = request({ targetMinutes: 120 })
    const third = request({ targetMinutes: 150 })
    cache.set(routeCacheKey(first), plan)
    cache.set(routeCacheKey(second), plan)
    cache.set(routeCacheKey(third), plan)
    expect(cache.get(routeCacheKey(first))).toBeUndefined()
    expect(cache.get(routeCacheKey(second))).toBe(plan)
    expect(cache.get(routeCacheKey(third))).toBe(plan)
  })
})

describe("route cache key", () => {
  it("isolates routing-affecting preferences", () => {
    expect(routeCacheKey(request({ profile: "quick" }))).not.toBe(routeCacheKey(request()))
    expect(routeCacheKey(request({ avoidHighways: true }))).not.toBe(routeCacheKey(request()))
    expect(routeCacheKey(request({ tollPolicy: "avoid" }))).not.toBe(routeCacheKey(request()))
  })

  it("treats equivalent rounded points as the same request", () => {
    const first = request({ targetMinutes: 120 })
    const second = request({
      targetMinutes: 120,
      points: [
        { lat: 40.17451, lon: -75.10589 },
        { lat: 40.40819, lon: -75.0 }
      ]
    })
    expect(routeCacheKey(first)).toBe(routeCacheKey(second))
  })

  it("excludes planning ids and prompt text from the key", () => {
    const withId = routeCacheKey({ ...request(), planningId: "plan-lifecycle-0001" })
    expect(withId).toBe(routeCacheKey(request()))
    expect(withId).not.toContain("plan-lifecycle-0001")
  })
})
