import { describe, expect, it } from "vitest"
import {
  createDefaultSettings,
  getActiveBike,
  migrateLegacySettings,
  type RiderSettings
} from "@/lib/settings/rider-settings"

describe("rider settings and stable bike identity (SB-011/SB-023)", () => {
  it("creates a default settings object with one stable street bike", () => {
    const settings = createDefaultSettings()
    expect(settings.version).toBe(1)
    expect(settings.bikes).toHaveLength(1)
    expect(settings.bikes[0]?.id).toBe("bike-default-street")
    expect(getActiveBike(settings).id).toBe("bike-default-street")
  })

  it("migrates legacy per-bike fields into stable records", () => {
    const settings = migrateLegacySettings({
      riderName: "Alex",
      motorcycleName: "KTM 890",
      fuelRangeMiles: 220,
      gravelTolerance: 0.6,
      learningEnabled: false,
      units: "metric",
      voice: true
    })
    expect(settings.riderName).toBe("Alex")
    expect(settings.bikes).toHaveLength(1)
    expect(settings.bikes[0]?.name).toBe("KTM 890")
    // The id is a stable slug, not the mutable name.
    expect(settings.bikes[0]?.id).toMatch(/^bike-ktm-890-0$/)
    expect(settings.activeBikeId).toBe(settings.bikes[0]?.id)
    expect(settings.bikes[0]?.fuelRangeMiles).toBe(220)
    expect(settings.bikes[0]?.category).toBe("adventure")
    expect(settings.learningEnabled).toBe(false)
    expect(settings.units).toBe("metric")
    expect(settings.voiceGuidance).toBe(true)
  })

  it("falls back to defaults for empty or malformed legacy data", () => {
    expect(migrateLegacySettings(null).bikes[0]?.id).toBe("bike-default-street")
    expect(migrateLegacySettings({ motorcycleName: 42 }).bikes[0]?.name).toBe("Street")
  })

  it("keeps a stable id across display-name changes", () => {
    const migrated = migrateLegacySettings({ motorcycleName: "Old Bike Name" })
    const renamed: RiderSettings = {
      ...migrated,
      bikes: [{ ...migrated.bikes[0]!, name: "New Bike Name" }]
    }
    expect(renamed.bikes[0]!.id).toBe(migrated.bikes[0]!.id)
  })
})
