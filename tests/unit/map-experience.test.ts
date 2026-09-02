import { describe, expect, it } from "vitest"
import {
  legacyMapStyleFor,
  migrateLegacyMapStyle,
  resolveLightPreset,
  resolveMapExperience
} from "@/lib/client/map-experience"

describe("map experience configuration", () => {
  it("keeps every mode on a Mapbox Standard style", () => {
    for (const experience of ["standard", "terrain"] as const) {
      expect(resolveMapExperience({ experience, surface: "plan", lightPreset: "day" }).style)
        .toBe("mapbox://styles/mapbox/standard")
    }
    expect(resolveMapExperience({ experience: "satellite", surface: "plan", lightPreset: "day" }).style)
      .toBe("mapbox://styles/mapbox/standard-satellite")
  })

  it("derives auto lighting from the day phase and lets a choice win", () => {
    expect(resolveLightPreset("auto", "night")).toBe("night")
    expect(resolveLightPreset("auto", "dawn")).toBe("dawn")
    expect(resolveLightPreset("auto", "day")).toBe("day")
    expect(resolveLightPreset("dusk", "day")).toBe("dusk")
  })

  it("makes exploring rich and riding restrained", () => {
    const explore = resolveMapExperience({ experience: "terrain", surface: "explore", lightPreset: "day" })
    const plan = resolveMapExperience({ experience: "terrain", surface: "plan", lightPreset: "day" })
    const ride = resolveMapExperience({ experience: "terrain", surface: "ride", lightPreset: "day" })

    expect(explore.show3dTrees).toBe(true)
    expect(explore.showPointOfInterestLabels).toBe(true)
    expect(explore.atmosphere).toBe(true)

    // Planning keeps the relief but stops competing with the route.
    expect(plan.showPointOfInterestLabels).toBe(false)
    expect(plan.camera.pitch).toBeLessThan(explore.camera.pitch)
    expect(plan.terrain?.exaggeration).toBeLessThan(explore.terrain!.exaggeration)

    expect(ride.show3dTrees).toBe(false)
    expect(ride.show3dFacades).toBe(false)
    expect(ride.showPointOfInterestLabels).toBe(false)
    expect(ride.atmosphere).toBe(false)
    // Orientation and road identity survive Ride Focus.
    expect(ride.show3dBuildings).toBe(true)
    expect(ride.showRoadLabels).toBe(true)
  })

  it("never animates the camera or tilts the map while riding", () => {
    const ride = resolveMapExperience({ experience: "satellite", surface: "ride", lightPreset: "night" })
    expect(ride.transitionMillis).toBe(0)
    expect(ride.camera.pitch).toBe(0)
  })

  it("keeps the flat Standard canvas flat", () => {
    const standard = resolveMapExperience({ experience: "standard", surface: "explore", lightPreset: "day" })
    expect(standard.terrain).toBeNull()
    expect(standard.atmosphere).toBe(false)
  })

  it("brightens the route where the basemap would swallow it", () => {
    const imagery = resolveMapExperience({ experience: "satellite", surface: "plan", lightPreset: "day" })
    const night = resolveMapExperience({ experience: "standard", surface: "plan", lightPreset: "night" })
    const paper = resolveMapExperience({ experience: "standard", surface: "plan", lightPreset: "day" })
    expect(imagery.routeEmphasis).toBe("bright")
    expect(night.routeEmphasis).toBe("bright")
    expect(paper.routeEmphasis).toBe("standard")
  })
})

describe("legacy map style migration", () => {
  it("maps every stored style deterministically", () => {
    expect(migrateLegacyMapStyle("clean")).toEqual({ experience: "standard", lightPreference: "auto" })
    expect(migrateLegacyMapStyle("explorer")).toEqual({ experience: "terrain", lightPreference: "auto" })
    // Night was a lighting choice expressed as a style; it stays a lighting
    // choice rather than becoming a mode the rider never picked.
    expect(migrateLegacyMapStyle("night")).toEqual({ experience: "standard", lightPreference: "night" })
  })

  it("falls back to Standard for an unknown or missing style", () => {
    expect(migrateLegacyMapStyle(undefined)).toEqual({ experience: "standard", lightPreference: "auto" })
    expect(migrateLegacyMapStyle("something-else")).toEqual({ experience: "standard", lightPreference: "auto" })
  })

  it("round-trips through the legacy field it still writes", () => {
    for (const experience of ["standard", "terrain", "satellite"] as const) {
      for (const lightPreference of ["auto", "night"] as const) {
        const legacy = legacyMapStyleFor(experience, lightPreference)
        const back = migrateLegacyMapStyle(legacy)
        expect(back.lightPreference).toBe(lightPreference === "night" ? "night" : "auto")
      }
    }
  })
})
