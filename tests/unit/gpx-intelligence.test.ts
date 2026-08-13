import { describe, expect, it } from "vitest"
import { analyzeGpxIntelligence, isGpxIntelligenceReport, type GpxIntelligenceInput } from "@/lib/gpx/intelligence"

const input: GpxIntelligenceInput = {
  geometry: [[-76, 40], [-75.999, 40], [-75.9, 40], [-75.899, 40]],
  segments: [
    [[-76, 40], [-75.999, 40]],
    [[-75.9, 40], [-75.899, 40]]
  ],
  segmentStarts: [0, 2],
  distanceMeters: 8_700,
  durationMinutes: 42,
  ascentMeters: 120,
  descentMeters: 80,
  gapCount: 1,
  invalidPointCount: 2,
  dedupedPointCount: 1,
  creatorNotes: "Recorded on a cool morning; verify conditions before riding."
}

describe("GPX intelligence", () => {
  it("keeps measured facts and unknown provider facts separate", () => {
    const report = analyzeGpxIntelligence(input, {
      status: "matched",
      provider: "graphhopper",
      profile: "motorcycle_adventure",
      matchedDistanceMeters: 8_500,
      snappedWaypointCount: 4
    })

    expect(report).toMatchObject({
      version: 1,
      distanceMeters: 8_700,
      durationMinutes: 42,
      elevation: { ascentMeters: 120, descentMeters: 80 },
      ingest: { pointCount: 4, segmentCount: 2, gapCount: 1 },
      match: {
        status: "matched",
        matchedDistanceMeters: 8_500,
        matchPercent: 100,
        unmatchedPercent: 0,
        basis: "snapped-waypoints"
      },
      surface: { status: "unknown", distribution: {}, source: "not-available" },
      roadClasses: { status: "unknown", distribution: {}, source: "not-available" },
      mappedMvumOverlapPercent: null,
      communityCorridorOverlapPercent: null
    })
    expect(report.gapSpans).toHaveLength(1)
    expect(report.unmatchedSpans).toHaveLength(0)
    expect(report.groundedDescription).toContain("Measured GPX track")
    expect(report.groundedDescription).toContain("Creator note:")
    expect(isGpxIntelligenceReport(report)).toBe(true)
  })

  it("creates an explicit track-only span when the provider returns no path", () => {
    const report = analyzeGpxIntelligence(input, {
      status: "unmatched",
      provider: "graphhopper",
      profile: "motorcycle_adventure"
    })

    expect(report.match).toMatchObject({ matchPercent: 0, unmatchedPercent: 100, basis: "no-path" })
    expect(report.unmatchedSpans).toEqual([{
      fromPoint: 0,
      toPoint: 3,
      distanceMeters: 8_700,
      reason: "map-match-no-path",
      navigation: "track-only"
    }])
    expect(report.groundedDescription).toContain("Track guidance — road data unavailable.")
    expect(report.dataConfidence.level).toBe("medium")
  })

  it("does not turn an absent matcher into a false clean result", () => {
    const report = analyzeGpxIntelligence({ ...input, creatorNotes: "   " }, {
      status: "not-configured",
      provider: null,
      profile: null
    })

    expect(report.match).toMatchObject({ matchPercent: null, unmatchedPercent: null, basis: "not-evaluated" })
    expect(report.unmatchedSpans).toHaveLength(0)
    expect(report.dataConfidence.level).toBe("low")
    expect(report.creatorNotes).toBeUndefined()
    expect(report.groundedDescription).toContain("original GPX remains track-only")
  })

  it("rejects an artifact with an invalid report shape at the catalog boundary", () => {
    const report = analyzeGpxIntelligence(input, { status: "unmatched", provider: "graphhopper", profile: "x" })
    expect(isGpxIntelligenceReport({ ...report, surface: { ...report.surface, distribution: { gravel: 101 } } })).toBe(false)
    expect(isGpxIntelligenceReport({ ...report, unmatchedSpans: [{ ...report.unmatchedSpans[0]!, navigation: "reroute" }] })).toBe(false)
  })
})
