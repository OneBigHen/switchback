import { describe, expect, it } from "vitest"
import { normalizeRouteRequest } from "@/lib/domain/routing/normalized-request"
import { normalizeGraphHopperPath, type GraphHopperPath } from "@/lib/routing/graphhopper-response"
import { routePassesNearWaypoint } from "@/lib/routing/scoring"
import type { Waypoint } from "@/lib/routing/types"

const groundedStop: Waypoint = {
  lat: 40.2,
  lon: -76.8,
  label: "Switchback Brewing"
}

const request = normalizeRouteRequest({
  profile: "twisty",
  points: [
    { lat: 40.19, lon: -76.9, label: "Start" },
    groundedStop,
    { lat: 40.21, lon: -76.7, label: "Finish" }
  ]
})

describe("advisor stop routing proof", () => {
  it("accepts a provider-resolved logical stop even when the raw POI anchor is more than 25 m off the road", () => {
    const providerResolvedLon = -76.7995
    const path: GraphHopperPath = {
      distance: 20_000,
      time: 1_200_000,
      points: { coordinates: [
        [-76.9, 40.19],
        [providerResolvedLon, 40.19],
        [providerResolvedLon, 40.2],
        [providerResolvedLon, 40.21],
        [-76.7, 40.21]
      ] },
      // The provider snapped the grounded POI roughly 42 m east onto the
      // drivable road. That is legitimate provider visit evidence and must not
      // be rejected by the unrelated same-stop de-duplication tolerance.
      snapped_waypoints: { coordinates: [
        [-76.9, 40.19],
        [providerResolvedLon, 40.2],
        [-76.7, 40.21]
      ] }
    }

    const route = normalizeGraphHopperPath(path, request, 0)
    expect(route.waypoints[1]).toEqual({
      lat: 40.2,
      lon: providerResolvedLon,
      label: "Switchback Brewing"
    })

    // RED on the pre-fix branch: routePassesNearWaypoint only checks the raw
    // grounded anchor against geometry, so this returns false despite the
    // provider proving that logical waypoint was snapped onto the route.
    expect(routePassesNearWaypoint(route.geometry, groundedStop)).toBe(true)
  })

  it("does not turn a raw request-coordinate fallback into provider evidence", () => {
    const path: GraphHopperPath = {
      distance: 20_000,
      time: 1_200_000,
      points: { coordinates: [
        [-76.9, 40.19],
        [-76.799, 40.19],
        [-76.799, 40.21],
        [-76.7, 40.21]
      ] }
      // No snapped_waypoints: the adapter falls back to request coordinates.
    }

    const route = normalizeGraphHopperPath(path, request, 0)
    expect(route.waypoints[1]).toEqual(groundedStop)
    expect(routePassesNearWaypoint(route.geometry, groundedStop)).toBe(false)
  })

  it("still accepts a raw-coordinate fallback when geometry itself substantiates the requested stop", () => {
    const path: GraphHopperPath = {
      distance: 20_000,
      time: 1_200_000,
      points: { coordinates: [
        [-76.9, 40.19],
        [-76.8, 40.19],
        [-76.8, 40.2],
        [-76.8, 40.21],
        [-76.7, 40.21]
      ] }
    }

    const route = normalizeGraphHopperPath(path, request, 0)
    expect(routePassesNearWaypoint(route.geometry, groundedStop)).toBe(true)
  })
})
