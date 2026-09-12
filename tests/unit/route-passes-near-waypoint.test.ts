import { describe, expect, it } from "vitest"
import { routePassesNearWaypoint } from "@/lib/routing/scoring"
import type { Coordinate } from "@/lib/routing/types"

/**
 * Fixture geometry: one east–west segment along the 40th parallel, so a
 * waypoint due north of any point on it sits at a latitude-only offset.
 * Degrees→meters conversion uses the same spherical-earth convention as the
 * utility (6,371,000 m radius; one degree of latitude ≈ 111,194.9 m).
 */
const EARTH_RADIUS_METERS = 6_371_000
const DEGREES_PER_METER = 180 / (Math.PI * EARTH_RADIUS_METERS)

const eastWestSegment: Coordinate[] = [
  [-77.0, 40.0],
  [-76.9, 40.0]
]

function northOf(lon: number, lat: number, meters: number): { lat: number; lon: number } {
  return { lat: lat + meters * DEGREES_PER_METER, lon }
}

describe("routePassesNearWaypoint", () => {
  it("includes a waypoint that sits exactly on a route vertex", () => {
    expect(routePassesNearWaypoint(eastWestSegment, { lat: 40.0, lon: -77.0 })).toBe(true)
  })

  it("includes a waypoint that lies between two route vertices", () => {
    expect(routePassesNearWaypoint(eastWestSegment, { lat: 40.0, lon: -76.95 })).toBe(true)
  })

  it("includes a waypoint snapped just off the route", () => {
    // ~10 m north of the segment midpoint: a grounded stop the router would
    // legitimately snap onto the road.
    expect(routePassesNearWaypoint(eastWestSegment, northOf(-76.95, 40.0, 10))).toBe(true)
  })

  it("includes a waypoint at the 25 m tolerance boundary (inclusive)", () => {
    // The documented waypoint-on-route tolerance is 25 m and inclusion is
    // inclusive (distance <= tolerance). The point sits 25 m minus one
    // nanometer north of the segment: one nanometer is ~4e-11 of the
    // tolerance, which absorbs binary rounding in the degree conversion
    // without moving the geometric boundary case.
    expect(routePassesNearWaypoint(eastWestSegment, northOf(-76.95, 40.0, 25 - 1e-9))).toBe(true)
  })

  it("excludes a waypoint just beyond the 25 m tolerance boundary", () => {
    expect(routePassesNearWaypoint(eastWestSegment, northOf(-76.95, 40.0, 30))).toBe(false)
  })

  it("excludes a waypoint clearly off the route", () => {
    // ~1.1 km north of the segment: nowhere near a routed stop.
    expect(routePassesNearWaypoint(eastWestSegment, northOf(-76.95, 40.0, 1_100))).toBe(false)
  })

  it("excludes waypoints when the geometry is empty", () => {
    expect(routePassesNearWaypoint([], { lat: 40.0, lon: -77.0 })).toBe(false)
  })

  it("handles single-point geometry by direct distance", () => {
    const singlePoint: Coordinate[] = [[-77.0, 40.0]]
    expect(routePassesNearWaypoint(singlePoint, { lat: 40.0, lon: -77.0 })).toBe(true)
    expect(routePassesNearWaypoint(singlePoint, northOf(-77.0, 40.0, 30))).toBe(false)
  })
})
