import { describe, expect, it } from "vitest"
import type { RideFingerprint } from "@/lib/rides/ride-memory"
import {
  parseRideMemoryQuery,
  searchRideMemory,
  type RideMemorySearchDocument
} from "@/lib/rides/ride-memory-search"

function fingerprint(overrides: Partial<RideFingerprint> = {}): RideFingerprint {
  return {
    version: 1,
    rideId: "ride",
    source: "recorded-ride",
    distanceMiles: 52,
    durationMinutes: 105,
    twistiness: 0.7,
    ascentMetersPerMile: 15,
    gravelShare: 0.08,
    highwayShare: 0.02,
    confidence: 1,
    evidence: { twistiness: true, elevation: true, surface: true, roadClass: true },
    ...overrides
  }
}

function document(id: string, overrides: Partial<RideMemorySearchDocument> = {}): RideMemorySearchDocument {
  return {
    id,
    source: "recorded-ride",
    name: "Bucks Backroads",
    sourceLabel: "Recorded ride",
    distanceMiles: 52,
    durationMinutes: 105,
    tags: ["weekend"],
    roadNames: ["River Road"],
    region: "se",
    fingerprint: fingerprint({ rideId: id }),
    ...overrides
  }
}

describe("ride-memory query parsing", () => {
  it("turns common rider constraints into deterministic search intent", () => {
    expect(parseRideMemoryQuery(
      "Find my recorded SE rides between 30 and 60 miles under 2 hours with little gravel and no highways"
    )).toMatchObject({
      source: "recorded-ride",
      region: "se",
      minMiles: 30,
      maxMiles: 60,
      maxMinutes: 120,
      maxGravelShare: 0.15,
      maxHighwayShare: 0.05,
      impossible: false
    })
  })

  it("marks contradictory measurable constraints impossible rather than relaxing them", () => {
    expect(parseRideMemoryQuery("recorded rides over 80 miles under 40 miles").impossible).toBe(true)
  })
})

describe("character-aware ride retrieval", () => {
  it("ranks metadata-identical rides by measured character", () => {
    const tame = document("tame", {
      fingerprint: fingerprint({ rideId: "tame", twistiness: 0.25 })
    })
    const twisty = document("twisty", {
      fingerprint: fingerprint({ rideId: "twisty", twistiness: 0.88 })
    })

    const results = searchRideMemory([tame, twisty], "twistiest recorded rides")
    expect(results.map((result) => result.id)).toEqual(["twisty", "tame"])
  })

  it("combines real metadata and measured ride evidence without inventing a match", () => {
    const target = document("target")
    const gravelHeavy = document("gravel-heavy", {
      fingerprint: fingerprint({ rideId: "gravel-heavy", gravelShare: 0.42 })
    })
    const highwayHeavy = document("highway-heavy", {
      fingerprint: fingerprint({ rideId: "highway-heavy", highwayShare: 0.3 })
    })
    const tooLong = document("too-long", { distanceMiles: 84, fingerprint: fingerprint({ rideId: "too-long", distanceMiles: 84 }) })

    const results = searchRideMemory(
      [gravelHeavy, highwayHeavy, tooLong, target],
      "recorded SE rides under 60 miles little gravel no highways River Road"
    )
    expect(results.map((result) => result.id)).toEqual(["target"])
  })

  it("requires actual evidence for positive character filters", () => {
    const unknown = document("unknown", {
      fingerprint: fingerprint({
        rideId: "unknown",
        gravelShare: null,
        evidence: { twistiness: true, elevation: true, surface: false, roadClass: true }
      })
    })
    const known = document("known", {
      fingerprint: fingerprint({ rideId: "known", gravelShare: 0.35 })
    })

    expect(searchRideMemory([unknown, known], "recorded gravel rides").map((result) => result.id)).toEqual(["known"])
  })

  it("returns no ids when constraints are contradictory", () => {
    expect(searchRideMemory([document("one")], "recorded rides over 80 miles under 40 miles")).toEqual([])
  })
})
