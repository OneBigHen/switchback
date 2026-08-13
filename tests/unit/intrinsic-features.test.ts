import { describe, expect, it } from "vitest"
import { isIntrinsicFeatureProvenanceMap } from "@/lib/roads/intrinsic-features"
import { plannedRouteToScoreable } from "@/lib/recommendation/route-candidate"
import type { PlannedRoute } from "@/lib/routing/types"

const liveRoute: PlannedRoute = {
  id: "live-route",
  name: "Ridge",
  profile: "scenic",
  geometry: [[-76.9, 40.2], [-76.8, 40.2], [-76.7, 40.25]],
  waypoints: [],
  instructions: [],
  distanceMiles: 12,
  durationMinutes: 24,
  ascentMeters: 120,
  descentMeters: 80,
  twistiness: 70,
  turnCount: 18,
  roadMix: { secondary: 100 },
  surfaceMix: { asphalt: 100 },
  routingSource: "live",
  provider: "graphhopper",
  providerVersion: "11.0",
  previewOnly: false
}

describe("intrinsic feature provenance", () => {
  it("keeps missing access and MVUM facts unknown while measuring available coverage", () => {
    const segment = plannedRouteToScoreable(liveRoute).segments[0]!

    expect(segment.legalAccess).toBe("unknown")
    expect(segment.seasonalAccess).toBe("unknown")
    expect(segment.signalDensity).toBeUndefined()
    expect(segment.stopDensity).toBeUndefined()
    expect(segment.dataConfidence).toBe(0.5)
    expect(segment.featureProvenance).toMatchObject({
      surface: { source: "graphhopper", coverage: "complete" },
      access: { source: "graphhopper", coverage: "partial" },
      curvature: { source: "switchback-geometry", coverage: "complete" },
      elevation: { source: "graphhopper", coverage: "partial" },
      flow: { source: "unavailable", coverage: "unknown" },
      mvum: { source: "unavailable", coverage: "unknown" }
    })
  })

  it("validates provenance at the normalized feature boundary", () => {
    expect(isIntrinsicFeatureProvenanceMap({
      surface: {
        source: "pasda",
        dataset: "Unpaved Roads 2009_07",
        coverage: "partial",
        limitations: ["Regional only"]
      }
    })).toBe(true)
    expect(isIntrinsicFeatureProvenanceMap({
      surface: { source: "", coverage: "complete", limitations: [] }
    })).toBe(false)
    expect(isIntrinsicFeatureProvenanceMap({
      madeUp: { source: "provider", coverage: "complete", limitations: [] }
    })).toBe(false)
  })
})
