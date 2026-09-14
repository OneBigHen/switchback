import { describe, expect, it } from "vitest"
import type { GpxIntelligenceReport } from "@/lib/gpx/intelligence"
import {
  durationEvidence,
  surfaceEvidence,
  surfaceSummaryLabel,
  trackConfidence,
  twistinessEvidence
} from "@/lib/routes/route-evidence"

function report(overrides: Partial<GpxIntelligenceReport> = {}): GpxIntelligenceReport {
  return {
    version: 1,
    distanceMeters: 100_000,
    durationMinutes: null,
    durationSource: "unavailable",
    elevation: { ascentMeters: 600, descentMeters: 600 },
    curvature: {} as GpxIntelligenceReport["curvature"],
    ingest: { pointCount: 900, segmentCount: 1, invalidPointCount: 0, dedupedPointCount: 0, gapCount: 0 },
    match: {
      status: "matched",
      provider: null,
      profile: null,
      matchedDistanceMeters: 100_000,
      matchPercent: 99,
      unmatchedPercent: 1,
      basis: "provider-path"
    },
    unmatchedSpans: [],
    gapSpans: [],
    surface: { status: "unknown", distribution: {}, source: "not-available" },
    roadClasses: { status: "unknown", distribution: {}, source: "not-available" },
    mappedMvumOverlapPercent: null,
    communityCorridorOverlapPercent: null,
    likelyFuelGaps: { status: "unknown", reason: "n/a" },
    dataConfidence: { level: "high", basis: ["99% provider match coverage"] },
    groundedDescription: "",
    ...overrides
  }
}

describe("surfaceEvidence", () => {
  it("verifies a measured surface distribution", () => {
    const surface = surfaceEvidence({
      intelligence: report({
        surface: { status: "known", distribution: { asphalt: 60, gravel: 40 }, source: "graphhopper" }
      })
    })

    expect(surface.level).toBe("verified")
    expect(surface.label).toBe("Verified")
    expect(surface.unpavedShare).toBeCloseTo(0.4, 5)
  })

  it("treats an older coarse stored mix as estimated, not verified", () => {
    const surface = surfaceEvidence({ storedMix: { paved: 80, gravel: 20 } })

    expect(surface.level).toBe("estimated")
    expect(surface.label).toBe("Estimated")
    expect(surface.unpavedShare).toBeCloseTo(0.2, 5)
  })

  it("never turns an unevaluated surface into a percentage", () => {
    const surface = surfaceEvidence({ intelligence: report(), storedMix: {} })

    expect(surface.level).toBe("unknown")
    expect(surface.unpavedShare).toBeNull()
    expect(surface.distribution).toBeNull()
    expect(surfaceSummaryLabel(surface)).toBe("Surface unknown")
  })

  it("prefers measured evidence over the stored summary", () => {
    const surface = surfaceEvidence({
      intelligence: report({
        surface: { status: "known", distribution: { gravel: 100 }, source: "gpx" }
      }),
      storedMix: { paved: 100 }
    })

    expect(surface.level).toBe("verified")
    expect(surface.unpavedShare).toBeCloseTo(1, 5)
  })

  it("falls through an empty measured distribution rather than claiming known", () => {
    const surface = surfaceEvidence({
      intelligence: report({ surface: { status: "known", distribution: {}, source: "graphhopper" } })
    })

    expect(surface.level).toBe("unknown")
  })
})

describe("durationEvidence", () => {
  it("verifies a recorded moving time", () => {
    const duration = durationEvidence({ recordedMinutes: 95, distanceMiles: 48.2 })

    expect(duration.level).toBe("verified")
    expect(duration.minutes).toBe(95)
  })

  it("labels a distance-derived time as estimated", () => {
    const duration = durationEvidence({ recordedMinutes: null, distanceMiles: 102 })

    expect(duration.level).toBe("estimated")
    expect(duration.minutes).toBeGreaterThan(0)
  })

  it("treats an imported zero as unknown, never as a real time", () => {
    const duration = durationEvidence({ recordedMinutes: 0, distanceMiles: 0 })

    expect(duration.level).toBe("unknown")
    expect(duration.minutes).toBeNull()
  })
})

describe("metric-specific confidence", () => {
  it("does not let a strong curvature score imply surface evidence", () => {
    const corners = twistinessEvidence({ twistiness: 88, turnCount: 240 })
    const surface = surfaceEvidence({ intelligence: report() })

    expect(corners.level).toBe("verified")
    expect(surface.level).toBe("unknown")
  })

  it("reports unknown corners when there is no mapped line to measure", () => {
    expect(twistinessEvidence({ twistiness: 0, turnCount: 0 }).level).toBe("unknown")
  })
})

describe("trackConfidence", () => {
  it("explains lower confidence in rider language", () => {
    const confidence = trackConfidence(report({
      dataConfidence: { level: "low", basis: ["3 recorded gaps"] },
      gapSpans: [{ fromPoint: 1, toPoint: 2, distanceMeters: 400, reason: "teleport" }]
    }))

    expect(confidence.level).toBe("low")
    expect(confidence.headline).toBe("Lower confidence")
    expect(confidence.detail).toContain("GPS gaps")
  })

  it("does not claim confidence for a track that was never analysed", () => {
    expect(trackConfidence(null).level).toBe("unknown")
    expect(trackConfidence(undefined).headline).toBe("Track not analysed")
  })

  it("reports good confidence without alarming language", () => {
    expect(trackConfidence(report()).headline).toBe("Good confidence")
  })
})
