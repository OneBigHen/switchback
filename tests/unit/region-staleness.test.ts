import { describe, expect, it } from "vitest"
import {
  evaluateRegionStaleness,
  shouldPromptCorridorRebuild,
  STALENESS_THRESHOLDS
} from "@/lib/offline/region-staleness"

describe("region staleness", () => {
  it("reports Current for a bundle built today", () => {
    const result = evaluateRegionStaleness(new Date().toISOString())
    expect(result.tier).toBe("current")
    expect(result.routable).toBe(true)
    expect(result.recommendUpdate).toBe(false)
  })

  it("reports Aging for a bundle 35 days old", () => {
    const built = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString()
    const result = evaluateRegionStaleness(built)
    expect(result.tier).toBe("aging")
    expect(result.routable).toBe(true)
    expect(result.recommendUpdate).toBe(false)
  })

  it("reports Stale for a bundle 75 days old", () => {
    const built = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000).toISOString()
    const result = evaluateRegionStaleness(built)
    expect(result.tier).toBe("stale")
    expect(result.routable).toBe(true)
    expect(result.recommendUpdate).toBe(true)
  })

  it("reports Very stale past 90 days but routing remains routable", () => {
    const built = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString()
    const result = evaluateRegionStaleness(built)
    expect(result.tier).toBe("very-stale")
    expect(result.routable).toBe(true)
    expect(result.recommendUpdate).toBe(true)
  })

  it("refuses to route when the bundle's schema is incompatible", () => {
    const result = evaluateRegionStaleness(new Date().toISOString(), { schemaCompatible: false })
    expect(result.tier).toBe("unsupported")
    expect(result.routable).toBe(false)
  })

  it("reports very-stale when no build timestamp is present", () => {
    const result = evaluateRegionStaleness(null)
    expect(result.tier).toBe("very-stale")
    expect(result.routable).toBe(false)
  })

  it("uses the 30/60/90 thresholds", () => {
    expect(STALENESS_THRESHOLDS).toEqual({ currentMaxDays: 30, agingMaxDays: 60, staleMaxDays: 90 })
  })

  it("does not block routing based on age alone", () => {
    for (const days of [29, 31, 59, 61, 89, 91, 365]) {
      const built = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      const result = evaluateRegionStaleness(built)
      expect(result.routable).toBe(true)
    }
  })

  it("prompts corridor rebuild only within a week of an upcoming ride and when bundle versions differ", () => {
    expect(
      shouldPromptCorridorRebuild({
        corridorBundleVersion: "1.0.0",
        regionBundleVersion: "1.1.0",
        withinDaysOfRide: 5
      })
    ).toBe(true)
    expect(
      shouldPromptCorridorRebuild({
        corridorBundleVersion: "1.0.0",
        regionBundleVersion: "1.0.0",
        withinDaysOfRide: 5
      })
    ).toBe(false)
    expect(
      shouldPromptCorridorRebuild({
        corridorBundleVersion: "1.0.0",
        regionBundleVersion: "1.1.0",
        withinDaysOfRide: 30
      })
    ).toBe(false)
  })
})
