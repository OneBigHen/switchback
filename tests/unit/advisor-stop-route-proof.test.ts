import { describe, expect, it } from "vitest"
import {
  mergeAdvisorStopIntoViaWithIndex,
  verifyAdvisorStopRouteVisit
} from "@/lib/advice/planner-handoff"
import type { ProposedStop } from "@/lib/advice/contracts"
import type { Coordinate, Waypoint } from "@/lib/routing/types"

const geometry: Coordinate[] = [
  [-77.0, 40.2],
  [-76.9, 40.2],
  [-76.8, 40.2],
  [-76.7, 40.2]
]

const stop: ProposedStop = {
  id: "brewery",
  name: "Switchback Brewing",
  reason: "Good finish to the gravel section.",
  kind: "brewery",
  anchor: { lat: 40.2, lon: -76.8 },
  routeProgress: 0.5,
  citations: []
}

const start: Waypoint = { lat: 40.19, lon: -77.0, label: "Start" }
const finish: Waypoint = { lat: 40.21, lon: -76.7, label: "Finish" }

describe("advisor stop routing proof", () => {
  it("returns the logical via index of the inserted grounded stop", () => {
    const existing: Waypoint[] = [
      { lat: 40.2, lon: -76.9, label: "Coffee" },
      { lat: 40.2, lon: -76.7, label: "Lookout" }
    ]

    const merged = mergeAdvisorStopIntoViaWithIndex(existing, stop, geometry)

    expect(merged.via.map((point) => point.label)).toEqual([
      "Coffee",
      "Switchback Brewing",
      "Lookout"
    ])
    expect(merged.stopViaIndex).toBe(1)
  })

  it("proves a provider-snapped stop by the returned logical waypoint, not the off-road POI anchor", () => {
    const requested: Waypoint = { lat: 40.2, lon: -76.8, label: "Switchback Brewing" }
    // About 42 m east of the grounded POI anchor at this latitude: outside the
    // old shared 25 m predicate, but exactly where the provider says it snapped
    // the logical via onto drivable geometry.
    const providerResolved: Waypoint = { lat: 40.2, lon: -76.7995, label: "Switchback Brewing" }
    const routeGeometry: Coordinate[] = [
      [-76.7995, 40.19],
      [-76.7995, 40.2],
      [-76.7995, 40.21]
    ]

    expect(verifyAdvisorStopRouteVisit({
      geometry: routeGeometry,
      waypoints: [start, providerResolved, finish]
    }, requested, 0)).toMatchObject({
      verified: true,
      source: "provider-resolved",
      logicalWaypointIndex: 1,
      waypoint: providerResolved
    })
  })

  it("does not call a raw request-coordinate fallback provider evidence", () => {
    const requested: Waypoint = { lat: 40.2, lon: -76.8, label: "Switchback Brewing" }
    const routeGeometry: Coordinate[] = [
      [-76.799, 40.19],
      [-76.799, 40.21]
    ]

    expect(verifyAdvisorStopRouteVisit({
      geometry: routeGeometry,
      // Provider adapters use the request coordinate when native snap/location
      // data is absent. An identical returned coordinate therefore cannot, by
      // itself, be claimed as provider proof.
      waypoints: [start, requested, finish]
    }, requested, 0)).toMatchObject({
      verified: false,
      source: "unverified"
    })
  })

  it("can still verify a raw-coordinate fallback when route geometry itself substantiates the stop", () => {
    const requested: Waypoint = { lat: 40.2, lon: -76.8, label: "Switchback Brewing" }

    expect(verifyAdvisorStopRouteVisit({
      geometry,
      waypoints: [start, requested, finish]
    }, requested, 0)).toMatchObject({
      verified: true,
      source: "geometry-fallback",
      logicalWaypointIndex: 1
    })
  })
})
