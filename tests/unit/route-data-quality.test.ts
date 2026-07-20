import { describe, expect, it } from "vitest"
import { computeRouteDataQuality } from "@/lib/roads/route-data-quality"
import type { PlannedRoute } from "@/lib/routing/types"

function plannedRoute(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "r1",
    name: "Loop",
    profile: "twisty",
    geometry: [
      [-76.9, 40.2],
      [-76.8, 40.3]
    ],
    waypoints: [],
    instructions: [],
    distanceMiles: 50,
    durationMinutes: 60,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 70,
    turnCount: 10,
    roadMix: { secondary: 70, tertiary: 30 },
    surfaceMix: { asphalt: 80, gravel: 20 },
    routingSource: "live",
    previewOnly: false,
    ...overrides
  }
}

describe("route data quality", () => {
  it("reports 100% coverage when every segment has known tags", () => {
    const route = plannedRoute()
    const result = computeRouteDataQuality({
      route,
      segments: [
        { miles: 25, hasAccessTag: true, hasSurfaceTag: true, hasSmoothnessOrTracktype: true },
        { miles: 25, hasAccessTag: true, hasSurfaceTag: true, hasSmoothnessOrTracktype: true }
      ]
    })
    expect(result.surfaceCoveragePercent).toBe(100)
    expect(result.accessCoveragePercent).toBe(100)
    expect(result.conditionCoveragePercent).toBe(100)
    expect(result.headlinePercent).toBe(100)
    expect(result.caveats).toHaveLength(0)
  })

  it("names the unknown-surface mileage and adds a caveat", () => {
    const route = plannedRoute({ distanceMiles: 60 })
    const result = computeRouteDataQuality({
      route,
      segments: [
        { miles: 40, hasAccessTag: true, hasSurfaceTag: true, hasSmoothnessOrTracktype: true },
        { miles: 20, hasAccessTag: true, hasSurfaceTag: false, hasSmoothnessOrTracktype: false }
      ]
    })
    expect(result.surfaceCoveragePercent).toBe(67)
    expect(result.unknownSurfaceMiles).toBe(20)
    expect(result.caveats.some((c) => c.includes("20.0 miles"))).toBe(true)
  })

  it("falls back to surfaceMix when no per-segment data is supplied", () => {
    const route = plannedRoute({ surfaceMix: { asphalt: 80, unknown: 20 } })
    const result = computeRouteDataQuality({ route })
    expect(result.surfaceCoveragePercent).toBe(80)
    expect(result.unknownSurfaceMiles).toBeCloseTo(10, 1)
  })

  it("flags seasonal uncertainty when any segment is undated seasonal", () => {
    const route = plannedRoute()
    const result = computeRouteDataQuality({
      route,
      segments: [
        { miles: 50, hasAccessTag: true, hasSurfaceTag: true, hasSmoothnessOrTracktype: true, seasonalUndated: true }
      ]
    })
    expect(result.seasonalUncertainty).toBe(true)
    expect(result.caveats.some((c) => c.includes("seasonal"))).toBe(true)
  })

  it("surface coverage is 0 when nothing is known", () => {
    const route = plannedRoute({ surfaceMix: {} })
    const result = computeRouteDataQuality({ route, segments: [] })
    expect(result.surfaceCoveragePercent).toBe(0)
    expect(result.headlinePercent).toBe(0)
  })

  it("carries the source map updated timestamp through", () => {
    const route = plannedRoute()
    const result = computeRouteDataQuality({ route, sourceMapUpdated: "2026-07-16T00:00:00Z" })
    expect(result.sourceMapUpdated).toBe("2026-07-16T00:00:00Z")
  })
})
