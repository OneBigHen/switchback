import { describe, expect, it } from "vitest"
import {
  acceptFreeRideSuggestion,
  rankFreeRideCandidates,
  freeRideRecommendationReducer,
  type FreeRideCandidate,
  type FreeRideRecommendationState
} from "@/lib/recommendation/free-ride"
import type { RoadSegmentFeature } from "@/lib/domain/contracts"

const origin: [number, number] = [-77.1, 40.1]

function segment(id: string, score: number, overrides: Partial<RoadSegmentFeature> = {}): RoadSegmentFeature {
  return {
    segmentId: id,
    geometry: [origin, [-77.05, 40.15]],
    roadClass: "secondary",
    surface: "asphalt",
    curvature: score,
    curveDensity: score,
    curveSeverity: score,
    headingChangePerKilometer: score,
    elevationInterest: 0.6,
    scenicProxy: 0.7,
    trafficPenalty: 0.1,
    signalDensity: 0.05,
    stopDensity: 0.05,
    urbanDensityPenalty: 0.05,
    highwayPenalty: 0,
    gravelSuitability: 0,
    legalAccess: "permitted",
    seasonalAccess: "open",
    familiarity: 0.1,
    novelty: 0.9,
    dataConfidence: 0.95,
    safetyFlags: [],
    distanceMeters: 5_000,
    ...overrides
  }
}

function candidate(id: string, score = 0.85, overrides: Partial<FreeRideCandidate> = {}): FreeRideCandidate {
  return {
    id,
    kind: "fun-road",
    title: "Fun road ahead",
    actionLabel: "Turn right",
    origin,
    destination: [-77.05, 40.15],
    routeFragment: [origin, [-77.08, 40.12], [-77.05, 40.15]],
    triggerDistanceMeters: 1_200,
    addedDurationSeconds: 360,
    baselineDurationSeconds: 1_440,
    route: {
      id,
      geometry: [origin, [-77.08, 40.12], [-77.05, 40.15]],
      distanceMeters: 10_000,
      durationSeconds: 1_800,
      confidence: 0.9,
      segments: [segment(`${id}-segment`, score)]
    },
    ...overrides
  }
}

const baseContext = {
  now: "2026-08-04T14:00:00.000Z",
  profile: "neural" as const,
  gpsConfidence: 0.95,
  workload: "low" as const,
  currentCoordinate: origin,
  currentHeadingDegrees: 90,
  rejectedCandidateIds: new Set<string>(),
  recentCandidateIds: new Set<string>()
}

describe("Free Ride recommendation core (experimental)", () => {
  it("returns at most one safe primary suggestion and ranks the better road first", () => {
    const result = rankFreeRideCandidates([
      candidate("straight", 0.2),
      candidate("ridge", 0.95)
    ], baseContext)

    expect(result.suggestion?.id).toBe("ridge")
    expect(result.suppressed).toBe(false)
    expect(result.suggestion?.reasons.length).toBeGreaterThan(0)
  })

  it.each([
    ["uncertain GPS", { gpsConfidence: 0.2 }],
    ["high workload", { workload: "high" as const }],
    ["rejected road", { rejectedCandidateIds: new Set(["ridge"]) }]
  ])("does not show a suggestion during %s", (_label, overrides) => {
    const result = rankFreeRideCandidates([candidate("ridge", 0.95)], { ...baseContext, ...overrides })

    expect(result.suggestion).toBeNull()
    expect(result.suppressed).toBe(true)
  })

  it("accepts a suggestion as a normal neural route request", () => {
    const ranked = rankFreeRideCandidates([candidate("ridge", 0.95)], baseContext)
    const suggestion = ranked.suggestion
    expect(suggestion).not.toBeNull()
    if (!suggestion) return

    expect(acceptFreeRideSuggestion(suggestion)).toMatchObject({
      origin,
      destination: [-77.05, 40.15],
      profile: "neural"
    })
  })

  it("clears and suppresses an ignored suggestion until the cooldown expires", () => {
    const ranked = rankFreeRideCandidates([candidate("ridge", 0.95)], baseContext)
    const suggestion = ranked.suggestion
    expect(suggestion).not.toBeNull()
    if (!suggestion) return

    const initial: FreeRideRecommendationState = {
      suggestion,
      ignoredCandidateIds: [],
      acceptedSuggestionId: null,
      cooldownUntil: 0,
      lastEvent: null
    }
    const ignored = freeRideRecommendationReducer(initial, {
      type: "ignore",
      at: "2026-08-04T14:00:01.000Z"
    })
    expect(ignored.suggestion).toBeNull()
    expect(ignored.ignoredCandidateIds).toContain("ridge")
    expect(ignored.lastEvent?.type).toBe("suggestion-ignored")
    expect(ignored.cooldownUntil).toBeGreaterThan(Date.parse("2026-08-04T14:00:01.000Z"))
  })
})
