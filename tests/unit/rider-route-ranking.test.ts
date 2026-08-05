import { describe, expect, it } from "vitest"
import type { RiderPreference } from "@/lib/intelligence/rider-preferences"
import type { PlannedRoute } from "@/lib/routing/types"
import { rankRoutesForRider } from "@/lib/client/rider-route-ranking"

function route(id: string, twistiness: number, durationMinutes: number, total: number): PlannedRoute {
  return {
    id,
    name: id,
    profile: "twisty",
    geometry: [[-76, 40], [-75.9, 40.05]],
    waypoints: [],
    instructions: [],
    distanceMiles: 40,
    durationMinutes,
    ascentMeters: null,
    descentMeters: null,
    twistiness,
    turnCount: 20,
    roadMix: { secondary: 80 },
    surfaceMix: { asphalt: 100 },
    routingSource: "live",
    provider: "graphhopper",
    previewOnly: false,
    routeScore: {
      total,
      fun: total,
      twistiness: total,
      scenic: 50,
      elevation: 50,
      gravel: 0,
      traffic: 50,
      simplicity: 50,
      safety: 90,
      novelty: 50,
      confidence: 90,
      preferenceFit: 0,
      etaPenalty: 0,
      explanations: [],
      explanation: []
    }
  }
}

const preference: RiderPreference = {
  motorcycleId: "scrambler",
  profile: "twisty",
  sampleCount: 8,
  weightedSamples: 8,
  meanRating: 4.5,
  preferredTwistiness: 90,
  preferredUnpavedPercent: 0,
  preferredDurationMinutes: 90,
  updatedAt: "2026-08-04T12:00:00.000Z"
}

describe("rider route ranking", () => {
  it("lets explicit local history choose the better-fit legal alternative", () => {
    const ranked = rankRoutesForRider([
      route("fast-but-flat", 25, 60, 90),
      route("curvy-preferred", 90, 90, 80)
    ], preference)

    expect(ranked.map((candidate) => candidate.route.id)).toEqual(["curvy-preferred", "fast-but-flat"])
    expect(ranked[0]?.fit.reasons.join(" ")).toMatch(/Twistiness/)
  })
})
