import { describe, expect, it } from "vitest"
import { scoreRoute } from "@/lib/recommendation/route-score"
import type { Coordinate, RoadSegmentFeature } from "@/lib/domain/contracts"

function segment(
  id: string,
  geometry: Coordinate[],
  overrides: Partial<RoadSegmentFeature> = {}
): RoadSegmentFeature {
  return {
    segmentId: id,
    geometry,
    curvature: 0.9,
    curveDensity: 0.85,
    curveSeverity: 0.8,
    headingChangePerKilometer: 0.8,
    scenicProxy: 0.8,
    elevationInterest: 0.7,
    trafficPenalty: 0.1,
    urbanDensityPenalty: 0.1,
    novelty: 0.7,
    legalAccess: "permitted",
    seasonalAccess: "open",
    dataConfidence: 0.9,
    safetyFlags: [],
    distanceMeters: 8_000,
    ...overrides
  }
}

function route(segments: RoadSegmentFeature[], durationSeconds = 3_600) {
  return {
    id: "utility-route",
    geometry: segments.flatMap((item, index) => index === 0 ? item.geometry : item.geometry.slice(1)),
    distanceMeters: segments.reduce((sum, item) => sum + item.distanceMeters, 0),
    durationSeconds,
    confidence: 0.9,
    segments
  }
}

const context = {
  profile: "twisty" as const,
  baselineDurationSeconds: 3_600,
  maxDetourPct: 0.3
}

describe("P15 route utility v2", () => {
  it("rewards a connected sustained run over equal-length fragments", () => {
    const first: Coordinate[] = [[-77.1, 40.1], [-77.05, 40.12]]
    const second: Coordinate[] = [[-77.05, 40.12], [-77, 40.14]]
    const coherent = scoreRoute(route([
      segment("a", first),
      segment("b", second)
    ]), context)
    const fragmented = scoreRoute(route([
      segment("a", first),
      segment("b", [[-76.2, 41.1], [-76.15, 41.12]])
    ]), context)

    expect(coherent.accepted).toBe(true)
    expect(fragmented.accepted).toBe(true)
    expect(coherent.utility?.contiguousQualityBonus).toBeGreaterThan(fragmented.utility?.contiguousQualityBonus ?? 0)
    expect(coherent.total).toBeGreaterThan(fragmented.total)
  })

  it("keeps small detours cheap and ramps the penalty after the preferred band", () => {
    const inside = scoreRoute(scoreRouteRoute(3_800), context)
    const outside = scoreRoute(scoreRouteRoute(4_200), context)

    expect(inside.accepted).toBe(true)
    expect(outside.accepted).toBe(true)
    expect(inside.utility?.detourPenalty).toBeLessThan(5)
    expect(outside.utility?.detourPenalty).toBeGreaterThan(inside.utility?.detourPenalty ?? 0)
  })

  it("keeps unknown feature data eligible but charges explicit uncertainty", () => {
    const known = scoreRoute(route([segment("known", [[-77.1, 40.1], [-77, 40.2]])]), context)
    const unknown = scoreRoute(route([segment("unknown", [[-77.1, 40.1], [-77, 40.2]], {
      surface: "unknown",
      legalAccess: "unknown",
      seasonalAccess: "unknown",
      dataConfidence: undefined
    })]), context)

    expect(unknown.accepted).toBe(true)
    expect(unknown.utility?.uncertaintyPenalty).toBeGreaterThan(known.utility?.uncertaintyPenalty ?? 0)
    expect(unknown.explanations.join(" ")).toMatch(/unknown|uncertainty/i)
  })

  it("penalizes self-overlap instead of turning repeated geometry into utility", () => {
    const geometry: Coordinate[] = [
      [-77.1, 40.1], [-77, 40.1], [-76.9, 40.2], [-77, 40.1], [-76.8, 40.2]
    ]
    const result = scoreRoute({
      ...route([segment("loop", geometry, { distanceMeters: 20_000 })]),
      geometry,
      distanceMeters: 20_000
    }, context)

    expect(result.accepted).toBe(true)
    expect(result.utility?.selfOverlapShare).toBeGreaterThan(0)
    expect(result.utility?.selfOverlapPenalty).toBeGreaterThan(0)
  })
})

function scoreRouteRoute(durationSeconds: number) {
  return route([segment("detour", [[-77.1, 40.1], [-77, 40.2]])], durationSeconds)
}
