import { describe, expect, it } from "vitest"
import {
  RIDER_SETTINGS_VERSION,
  defaultRiderUiPreferences,
  migrateStoredRiderSettings,
  validateRiderUiPreferences
} from "@/lib/settings/rider-settings"

const v1 = {
  version: 1,
  riderName: "Zac",
  activeBikeId: "bike-crf300l",
  bikes: [{
    id: "bike-crf300l",
    name: "CRF300L",
    category: "dual-sport",
    fuelRangeMiles: 150,
    reserveMiles: 25,
    maintainedGravel: true,
    roughTracks: true,
    unknownSurfacePolicy: "allow"
  }],
  defaultProfile: "adventure",
  defaultAvoidHighways: true,
  units: "metric",
  voiceGuidance: true,
  theme: "dark",
  mapStyle: "terrain",
  learningEnabled: false
}

describe("Rider settings V2 migration", () => {
  it("preserves existing rider, bike, routing, unit, theme and learning settings", () => {
    const migrated = migrateStoredRiderSettings(v1)

    expect(migrated.version).toBe(RIDER_SETTINGS_VERSION)
    expect(migrated.riderName).toBe("Zac")
    expect(migrated.activeBikeId).toBe("bike-crf300l")
    expect(migrated.bikes).toEqual(v1.bikes)
    expect(migrated.defaultProfile).toBe("adventure")
    expect(migrated.defaultAvoidHighways).toBe(true)
    expect(migrated.units).toBe("metric")
    expect(migrated.voiceGuidance).toBe(true)
    expect(migrated.theme).toBe("dark")
    expect(migrated.mapStyle).toBe("terrain")
    expect(migrated.learningEnabled).toBe(false)
    expect(migrated.uiPreferences).toEqual(defaultRiderUiPreferences())
  })

  it("deduplicates and bounds curated UI preferences while removing unknown ids", () => {
    const validated = validateRiderUiPreferences({
      planQuickActions: ["record", "record", "free-ride", "home-loop", "saved-place", "unknown"],
      quickLayers: ["curvature", "curvature", "unpaved", "weather", "fuel", "bogus"],
      rideMetrics: ["speed", "speed", "eta", "remaining-distance", "elevation"],
      recordingMetrics: ["elapsed", "distance", "speed", "elevation", "unknown"],
      routeDetailOrder: ["weather", "overview", "weather", "bogus", "actions"],
      hiddenRouteDetailModules: ["overview", "actions", "weather", "bogus"]
    })

    expect(validated.planQuickActions).toEqual(["record", "free-ride", "home-loop", "saved-place"])
    expect(validated.quickLayers).toEqual(["curvature", "unpaved", "weather", "fuel"])
    expect(validated.rideMetrics).toEqual(["speed", "eta", "remaining-distance"])
    expect(validated.recordingMetrics).toEqual(["elapsed", "distance", "speed"])
    expect(validated.routeDetailOrder.slice(0, 3)).toEqual(["weather", "overview", "actions"])
    expect(new Set(validated.routeDetailOrder).size).toBe(validated.routeDetailOrder.length)
    expect(validated.hiddenRouteDetailModules).toEqual(["weather"])
  })
})
