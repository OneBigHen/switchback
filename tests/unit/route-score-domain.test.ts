import { describe, expect, it } from "vitest"
import {
  scoreRoute,
  type ScoreableRoute,
  type RouteScoringContext
} from "@/lib/recommendation/route-score"
import type { RoadSegmentFeature, RiderPreferenceModel } from "@/lib/domain/contracts"

const preference: RiderPreferenceModel = {
  version: 1,
  profileWeights: {
    twistiness: 0.9,
    scenic: 0.45,
    gravel: 0.2,
    elevation: 0.45,
    novelty: 0.6,
    lowTraffic: 0.8,
    etaSensitivity: 0.25,
    simplicity: 0.35
  },
  contextWeights: {
    daylightOnlyBias: 0.5,
    rainAvoidanceBias: 0.7,
    weekendLongRideBias: 0.4,
    weekdayDirectBias: 0.3
  },
  learnedFromRideCount: 8,
  confidence: 0.65
}

const context: RouteScoringContext = {
  profile: "twisty",
  baselineDurationSeconds: 3_600,
  maxDetourPct: 0.25,
  temporal: {
    departureTime: "2026-08-04T14:00:00-04:00",
    timezone: "America/New_York",
    daylight: "day",
    traffic: { status: "unavailable" }
  },
  rider: preference
}

function segment(
  segmentId: string,
  overrides: Partial<RoadSegmentFeature> = {}
): RoadSegmentFeature {
  return {
    segmentId,
    geometry: [[-77.1, 40.1], [-77.0, 40.2]],
    roadClass: "secondary",
    surface: "asphalt",
    curvature: 0.8,
    curveDensity: 0.8,
    curveSeverity: 0.7,
    headingChangePerKilometer: 0.7,
    elevationInterest: 0.45,
    scenicProxy: 0.55,
    trafficPenalty: 0.15,
    signalDensity: 0.05,
    stopDensity: 0.05,
    urbanDensityPenalty: 0.05,
    highwayPenalty: 0,
    gravelSuitability: 0,
    legalAccess: "permitted",
    seasonalAccess: "open",
    familiarity: 0.2,
    novelty: 0.8,
    dataConfidence: 0.95,
    safetyFlags: [],
    distanceMeters: 8_000,
    ...overrides
  }
}

function route(
  id: string,
  segments: RoadSegmentFeature[],
  overrides: Partial<ScoreableRoute> = {}
): ScoreableRoute {
  return {
    id,
    geometry: [[-77.1, 40.1], [-77.0, 40.2]],
    distanceMeters: segments.reduce((sum, item) => sum + item.distanceMeters, 0),
    durationSeconds: 3_900,
    confidence: 0.9,
    segments,
    ...overrides
  }
}

describe("deterministic route scoring", () => {
  it("ranks a rural twisty route above a straight signal-heavy highway", () => {
    const twisty = route("twisty", [
      segment("twisty-1", { curvature: 0.92, curveDensity: 0.95, curveSeverity: 0.85, scenicProxy: 0.7 }),
      segment("twisty-2", { curvature: 0.88, curveDensity: 0.9, curveSeverity: 0.8, scenicProxy: 0.75 })
    ])
    const highway = route("highway", [
      segment("highway-1", {
        roadClass: "motorway",
        curvature: 0.05,
        curveDensity: 0.02,
        curveSeverity: 0.02,
        trafficPenalty: 0.75,
        signalDensity: 0.4,
        stopDensity: 0.35,
        urbanDensityPenalty: 0.8,
        highwayPenalty: 1,
        scenicProxy: 0.1
      }),
      segment("highway-2", {
        roadClass: "trunk",
        curvature: 0.05,
        curveDensity: 0.02,
        curveSeverity: 0.02,
        trafficPenalty: 0.7,
        signalDensity: 0.35,
        stopDensity: 0.3,
        urbanDensityPenalty: 0.7,
        highwayPenalty: 0.9,
        scenicProxy: 0.1
      })
    ])

    const twistyScore = scoreRoute(twisty, context)
    const highwayScore = scoreRoute(highway, context)

    expect(twistyScore.accepted).toBe(true)
    expect(highwayScore.accepted).toBe(true)
    expect(twistyScore.total).toBeGreaterThan(highwayScore.total)
    expect(twistyScore.explanation.join(" ")).toMatch(/twistier|curv/i)
    expect(highwayScore.explanation.join(" ")).toMatch(/traffic|highway|signal/i)
  })

  it("rejects illegal, closed, low-confidence, and excessive-detour candidates before scoring", () => {
    const candidate = route("unsafe", [
      segment("private-closed", {
        legalAccess: "private",
        seasonalAccess: "closed",
        dataConfidence: 0.1,
        safetyFlags: ["closure", "unsafe-geometry"]
      })
    ], { durationSeconds: 5_100 })

    const scored = scoreRoute(candidate, context)

    expect(scored.accepted).toBe(false)
    expect(scored.rejectionReasons).toEqual(expect.arrayContaining([
      expect.stringMatching(/access|private/i),
      expect.stringMatching(/closed/i),
      expect.stringMatching(/confidence/i),
      expect.stringMatching(/detour/i)
    ]))
    expect(scored.total).toBe(0)
  })

  it("lets the rider model influence ranking while preserving measured explanations", () => {
    const routeWithCurves = route("curves", [segment("curves-1", {
      curveDensity: 0.95,
      curveSeverity: 0.9,
      novelty: 0.9
    })])
    const direct = route("direct", [segment("direct-1", {
      curveDensity: 0.15,
      curveSeverity: 0.1,
      novelty: 0.25
    })])

    const result = scoreRoute(routeWithCurves, context)
    const baseline = scoreRoute(direct, context)

    expect(result.preferenceFit).toBeGreaterThan(0)
    expect(result.total).toBeGreaterThan(baseline.total)
    expect(result.explanation.every((line) => line.trim().length > 0)).toBe(true)
    expect(result.explanation.join(" ")).toMatch(/rider|curv|novel|preference/i)
  })
})
