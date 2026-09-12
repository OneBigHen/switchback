import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { mergeAdvisorStopIntoVia } from "@/lib/advice/planner-handoff"
import { createRouteEntityCache } from "@/lib/client/route-entity-cache"
import { normalizeRouteRequest } from "@/lib/domain/routing/normalized-request"
import { normalizeGraphHopperPath, type GraphHopperPath } from "@/lib/routing/graphhopper-response"
import { routePassesNearWaypoint } from "@/lib/routing/scoring"
import type { Waypoint } from "@/lib/routing/types"

const plannerHandoffSource = readFileSync(
  resolve(process.cwd(), "src/lib/advice/planner-handoff.ts"),
  "utf8"
)

const groundedStop: Waypoint = { lat: 40.2, lon: -76.8, label: "Stop" }
const request = normalizeRouteRequest({
  profile: "twisty",
  points: [
    { lat: 40.19, lon: -76.9, label: "Start" },
    groundedStop,
    { lat: 40.21, lon: -76.7, label: "Finish" }
  ]
})

function cacheRoute(path: GraphHopperPath) {
  const route = normalizeGraphHopperPath(path, request, 0)
  const cache = createRouteEntityCache()
  cache.replace([route])
  return cache.get(route.id)!
}

describe("route waypoint tolerance authority", () => {
  it("keeps stop de-duplication independent from routed stop proof", () => {
    expect(plannerHandoffSource).toContain("ADVISOR_STOP_DEDUP_METERS")
    expect(plannerHandoffSource).toContain("haversine")
    expect(plannerHandoffSource).not.toContain("routePassesNearWaypoint")
  })

  it("deduplicates an advisor stop without changing route-proof semantics", () => {
    const existing = [{ lat: 40.2, lon: -75.2, label: "Existing" }]
    const stop = {
      id: "same-stop",
      name: "Same stop",
      kind: "food" as const,
      anchor: { lat: 40.2, lon: -75.2 },
      routeProgress: 0.5,
      reason: "grounded",
      citations: []
    }

    expect(mergeAdvisorStopIntoVia(existing, stop, [[-75.2, 40.2], [-75.3, 40.3]]))
      .toEqual(existing)
  })

  it("accepts provider-resolved waypoint evidence when the raw anchor is off-road", () => {
    const resolvedLon = -76.7995
    const route = cacheRoute({
      distance: 20_000,
      time: 1_200_000,
      points: { coordinates: [
        [-76.9, 40.19],
        [resolvedLon, 40.19],
        [resolvedLon, 40.2],
        [resolvedLon, 40.21],
        [-76.7, 40.21]
      ] },
      snapped_waypoints: { coordinates: [
        [-76.9, 40.19],
        [resolvedLon, 40.2],
        [-76.7, 40.21]
      ] }
    })

    expect(route.waypoints[1]).toEqual({ lat: 40.2, lon: resolvedLon, label: "Stop" })
    expect(routePassesNearWaypoint(route.geometry, groundedStop)).toBe(true)
  })

  it("keeps request-coordinate fallback conservative", () => {
    const route = cacheRoute({
      distance: 20_000,
      time: 1_200_000,
      points: { coordinates: [
        [-76.9, 40.19],
        [-76.799, 40.19],
        [-76.799, 40.21],
        [-76.7, 40.21]
      ] }
    })

    expect(route.waypoints[1]).toEqual(groundedStop)
    expect(routePassesNearWaypoint(route.geometry, groundedStop)).toBe(false)
  })
})
