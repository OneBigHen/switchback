import { describe, expect, it } from "vitest"
import type { Coordinate, RoadSegmentFeature } from "@/lib/domain/contracts"
import { isRoutePolicy, PA_NJ_ROUTE_POLICY_V1 } from "@/lib/recommendation/route-policy"
import { scoreRoute } from "@/lib/recommendation/route-score"
import { PA_NJ_GOLDEN_CORPUS, PA_NJ_GOLDEN_CORPUS_VERSION } from "../fixtures/routing/golden"

function segment(overrides: Partial<RoadSegmentFeature> = {}): RoadSegmentFeature {
  return {
    segmentId: "golden-segment",
    geometry: [[-75.2, 40.2], [-75.1, 40.25]],
    roadClass: "secondary",
    surface: "asphalt",
    curvature: 0.85,
    curveDensity: 0.85,
    curveSeverity: 0.8,
    headingChangePerKilometer: 0.8,
    scenicProxy: 0.75,
    elevationInterest: 0.6,
    trafficPenalty: 0.1,
    urbanDensityPenalty: 0.1,
    gravelSuitability: 0,
    legalAccess: "permitted",
    seasonalAccess: "open",
    dataConfidence: 0.95,
    safetyFlags: [],
    distanceMeters: 8_000,
    ...overrides
  }
}

function route(id: string, roadSegment: RoadSegmentFeature, durationSeconds = 7_200) {
  const geometry = roadSegment.geometry as Coordinate[]
  return {
    id,
    geometry,
    distanceMeters: roadSegment.distanceMeters,
    durationSeconds,
    confidence: 0.95,
    segments: [{ ...roadSegment, segmentId: id }]
  }
}

describe("PA/NJ v1 route policy", () => {
  it("is a valid, versioned frozen policy", () => {
    expect(isRoutePolicy(PA_NJ_ROUTE_POLICY_V1)).toBe(true)
    expect(PA_NJ_ROUTE_POLICY_V1.version).toBe("pa-nj-route-policy-v1")
    expect(Object.isFrozen(PA_NJ_ROUTE_POLICY_V1)).toBe(true)
  })

  it("keeps the owner-defined corpus complete and relational", () => {
    expect(PA_NJ_GOLDEN_CORPUS_VERSION).toBe("pa-nj-golden-corpus-v1")
    expect(PA_NJ_GOLDEN_CORPUS).toHaveLength(11)
    expect(new Set(PA_NJ_GOLDEN_CORPUS.map((item) => item.id)).size).toBe(PA_NJ_GOLDEN_CORPUS.length)
    expect(PA_NJ_GOLDEN_CORPUS.every((item) => item.assertion.length > 0)).toBe(true)
  })

  it("ranks a measured twisty road above a straight highway", () => {
    const twisty = route("excellent-paved-twisty", segment({ curvature: 0.98, curveDensity: 0.98, curveSeverity: 0.95 }))
    const highway = route("boring-connector", segment({
      roadClass: "motorway",
      curvature: 0.05,
      curveDensity: 0.02,
      curveSeverity: 0.02,
      scenicProxy: 0.1,
      trafficPenalty: 0.8,
      urbanDensityPenalty: 0.7,
      highwayPenalty: 1
    }))
    const twistyScore = scoreRoute(twisty, { profile: "twisty", policy: PA_NJ_ROUTE_POLICY_V1 })
    const highwayScore = scoreRoute(highway, { profile: "twisty", policy: PA_NJ_ROUTE_POLICY_V1 })
    expect(twistyScore.accepted).toBe(true)
    expect(highwayScore.accepted).toBe(true)
    expect(twistyScore.total).toBeGreaterThan(highwayScore.total)
    expect(twistyScore.policyVersion).toBe(PA_NJ_ROUTE_POLICY_V1.version)
  })

  it("rejects malformed policy input at the scoring boundary", () => {
    const invalid = { ...PA_NJ_ROUTE_POLICY_V1, maxAlternatives: 4 }
    expect(() => scoreRoute(route("candidate", segment()), {
      profile: "twisty",
      policy: invalid
    })).toThrow("Invalid route policy")
  })

  it("ranks mapped gravel above the same road for a gravel profile", () => {
    const gravel = route("excellent-gravel", segment({ surface: "gravel", gravelSuitability: 1 }))
    const paved = route("paved-connector", segment({ surface: "asphalt", gravelSuitability: 0 }))
    expect(scoreRoute(gravel, { profile: "gravel", policy: PA_NJ_ROUTE_POLICY_V1 }).total)
      .toBeGreaterThan(scoreRoute(paved, { profile: "gravel", policy: PA_NJ_ROUTE_POLICY_V1 }).total)
  })

  it("rejects explicit private access before utility can win", () => {
    const privateRoute = route("private-example", segment({ legalAccess: "private" }))
    const score = scoreRoute(privateRoute, { profile: "adventure", policy: PA_NJ_ROUTE_POLICY_V1 })
    expect(score.accepted).toBe(false)
    expect(score.total).toBe(0)
    expect(score.rejectionReasons.join(" ")).toMatch(/legal|access|private/i)
  })
})
