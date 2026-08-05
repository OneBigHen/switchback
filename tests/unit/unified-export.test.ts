import { describe, expect, it } from "vitest"
import { createDefaultSettings } from "@/lib/settings/rider-settings"
import { createUnifiedExport, validateUnifiedExport } from "@/lib/settings/unified-export"
import type { RiderPreference } from "@/lib/intelligence/rider-preferences"

const preference: RiderPreference = {
  bikeId: "bike-default-street",
  profile: "twisty",
  sampleCount: 2,
  weightedSamples: 3,
  meanRating: 4.5,
  positive: { twistiness: 85, unpavedPercent: 0, durationMinutes: 60, weight: 3 },
  negative: { twistiness: 0, unpavedPercent: 0, durationMinutes: 0, weight: 0 },
  preferredTwistiness: 85,
  preferredUnpavedPercent: 0,
  preferredDurationMinutes: 60,
  updatedAt: "2026-08-05T00:00:00.000Z"
}

describe("unified export (SB-024)", () => {
  it("round-trips settings, preferences, routes, and trips", () => {
    const payload = createUnifiedExport({
      settings: createDefaultSettings(),
      preferences: [preference],
      routes: [],
      trips: [],
      rideSummary: { count: 0, latestAt: null, totalDistanceMiles: 0, totalDurationMinutes: 0 }
    })
    const restored = validateUnifiedExport(JSON.parse(JSON.stringify(payload)))
    expect(restored).not.toBeNull()
    expect(restored!.format).toBe("switchback-backup")
    expect(restored!.settings.bikes[0]?.id).toBe("bike-default-street")
    expect(restored!.preferences[0]?.positive.twistiness).toBe(85)
  })

  it("rejects foreign or corrupt payloads", () => {
    expect(validateUnifiedExport(null)).toBeNull()
    expect(validateUnifiedExport({ format: "other" })).toBeNull()
    expect(validateUnifiedExport({ ...createUnifiedExport({
      settings: createDefaultSettings(), preferences: [], routes: [], trips: [],
      rideSummary: { count: 0, latestAt: null, totalDistanceMiles: 0, totalDurationMinutes: 0 }
    }), version: 99 })).toBeNull()
  })

  it("never includes raw ride trails — only a summary", () => {
    const payload = createUnifiedExport({
      settings: createDefaultSettings(),
      preferences: [],
      routes: [],
      trips: [],
      rideSummary: { count: 7, latestAt: "2026-08-05T00:00:00.000Z", totalDistanceMiles: 210, totalDurationMinutes: 640 }
    })
    expect(payload.rides).toEqual({ count: 7, latestAt: "2026-08-05T00:00:00.000Z", totalDistanceMiles: 210, totalDurationMinutes: 640 })
    expect("trail" in payload.rides).toBe(false)
  })
})
