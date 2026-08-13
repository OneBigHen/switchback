import { describe, expect, it } from "vitest"
import {
  evaluateFeatureEligibility,
  isRoadSegmentFeature
} from "@/lib/domain/routing/eligibility"
import type { RoadSegmentFeature } from "@/lib/domain/contracts"
import { getBikeProfile } from "@/lib/routing/bike-profiles"

function segment(overrides: Partial<RoadSegmentFeature> = {}): RoadSegmentFeature {
  return {
    segmentId: "segment-1",
    geometry: [[-77.1, 40.1], [-77, 40.2]],
    curvature: 0.5,
    curveDensity: 0.5,
    curveSeverity: 0.5,
    headingChangePerKilometer: 0.5,
    scenicProxy: 0.5,
    legalAccess: "permitted",
    seasonalAccess: "open",
    dataConfidence: 0.9,
    safetyFlags: [],
    distanceMeters: 1_000,
    ...overrides
  }
}

function route(segments: RoadSegmentFeature[]) {
  return {
    geometry: [[-77.1, 40.1], [-77, 40.2]] as [number, number][],
    confidence: 0.9,
    segments
  }
}

describe("P14 eligibility engine", () => {
  it("runs legal access, closure, bike, and coverage gates before utility", () => {
    const report = evaluateFeatureEligibility(route([segment({
      legalAccess: "private",
      seasonalAccess: "closed",
      profileCompatibility: { twisty: "incompatible" },
      dataConfidence: 0.1
    })]), { profile: "twisty" })

    expect(report.eligible).toBe(false)
    expect(report.failures.map((failure) => failure.code)).toEqual([
      "illegal-access",
      "active-closure",
      "bike-incompatible",
      "low-coverage"
    ])
  })

  it("keeps unknown access and surface as warnings instead of inventing rejection facts", () => {
    const report = evaluateFeatureEligibility(route([segment({
      legalAccess: "unknown",
      seasonalAccess: "unknown",
      surface: "unknown",
      dataConfidence: undefined
    })]), { profile: "adventure" })

    expect(report.eligible).toBe(true)
    expect(report.failures).toEqual([])
    expect(report.warnings.map((warning) => warning.code)).toEqual([
      "unknown-access",
      "unknown-closure",
      "unknown-surface",
      "unknown-coverage"
    ])
  })

  it("applies explicit bike surface rules without treating missing surface as gravel", () => {
    const street = getBikeProfile("Street")!
    const report = evaluateFeatureEligibility(route([segment({ surface: "gravel" })]), {
      profile: "twisty",
      bikeProfile: street
    })

    expect(report.eligible).toBe(false)
    expect(report.failures[0]?.code).toBe("surface-incompatible")
  })

  it("rejects malformed segment data at the feature trust boundary", () => {
    expect(isRoadSegmentFeature({ segmentId: "bad", geometry: [] })).toBe(false)
    const report = evaluateFeatureEligibility(route([{
      ...segment(),
      geometry: []
    } as RoadSegmentFeature]) as never, { profile: "twisty" })
    expect(report.eligible).toBe(false)
    expect(report.failures[0]?.code).toBe("invalid-feature-data")
  })
})
