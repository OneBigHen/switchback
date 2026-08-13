import { describe, expect, it } from "vitest"
import {
  createRouteEntityCache,
  MAX_ACTIVE_ROUTE_ENTITIES,
  MAX_ROUTE_GEOMETRY_POINTS
} from "@/lib/client/route-entity-cache"
import type { PlannedRoute } from "@/lib/routing/types"

function route(id: string): PlannedRoute {
  return {
    id,
    name: id,
    profile: "twisty",
    geometry: [[-76.8, 40.2], [-76.7, 40.3]],
    waypoints: [],
    instructions: [],
    distanceMiles: 21,
    durationMinutes: 39,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 74,
    turnCount: 27,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

describe("route entity cache", () => {
  it("keeps geometry out of summaries while resolving the canonical entity", () => {
    const cache = createRouteEntityCache()
    const current = route("r1")

    const [summary] = cache.replace([current])

    expect(summary).not.toHaveProperty("geometry")
    expect(cache.get("r1")).toBe(current)
    expect(cache.getMany(["r1", "missing"])).toEqual([current])
  })

  it("retains recovery entities across a plan replacement and bounds capacity", () => {
    const cache = createRouteEntityCache()
    const previous = route("previous")
    cache.replace([previous])
    cache.retain(previous.id)
    cache.replace([route("current")])

    expect(cache.get(previous.id)).toBe(previous)
    expect(cache.get("current")?.id).toBe("current")

    expect(() => cache.replace(Array.from({ length: MAX_ACTIVE_ROUTE_ENTITIES }, (_, index) => route(`r-${index}`)))).toThrow(/capacity/i)
  })

  it("rejects malformed geometry at the cache boundary", () => {
    const cache = createRouteEntityCache()
    const malformed = { ...route("bad"), geometry: [[Number.NaN, 40]] as [number, number][] }

    expect(() => cache.replace([malformed])).toThrow(/invalid geometry/i)
  })

  it("clears retained entities explicitly", () => {
    const cache = createRouteEntityCache()
    const current = route("current")
    cache.replace([current])
    cache.retain(current.id)

    cache.clear()

    expect(cache.size()).toBe(0)
    expect(cache.get(current.id)).toBeUndefined()
  })

  it("counts unique entities when a retained route is replaced", () => {
    const cache = createRouteEntityCache()
    const current = route("current")
    cache.replace([current])
    cache.retain(current.id)

    expect(() => cache.replace([
      current,
      ...Array.from({ length: MAX_ACTIVE_ROUTE_ENTITIES - 1 }, (_, index) => route(`r-${index}`))
    ])).not.toThrow()
    expect(cache.size()).toBe(MAX_ACTIVE_ROUTE_ENTITIES)
  })

  it("rejects an overlarge geometry payload at the cache boundary", () => {
    const cache = createRouteEntityCache()
    const overlarge = {
      ...route("overlarge"),
      geometry: Array.from({ length: MAX_ROUTE_GEOMETRY_POINTS + 1 }, () => [-76.8, 40.2] as [number, number])
    }

    expect(() => cache.replace([overlarge])).toThrow(/invalid geometry/i)
  })
})
