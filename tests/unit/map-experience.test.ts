import { describe, expect, it } from "vitest"
import {
  legacyMapExperienceFor,
  legacyMapStyleFor,
  migrateLegacyMapExperience,
  migrateLegacyMapStyle,
  resolveLightPreset,
  resolveMapPresentation
} from "@/lib/client/map-experience"

describe("map presentation configuration", () => {
  it("derives style family and style URL from the canonical preset", () => {
    for (const preset of ["road", "terrain"] as const) {
      const presentation = resolveMapPresentation({ preset, surface: "plan", lightPreset: "day" })
      expect(presentation.preset).toBe(preset)
      expect(presentation.styleFamily).toBe("standard")
      expect(presentation.style).toBe("mapbox://styles/mapbox/standard")
    }

    const satellite = resolveMapPresentation({ preset: "satellite", surface: "plan", lightPreset: "day" })
    expect(satellite.preset).toBe("satellite")
    expect(satellite.styleFamily).toBe("standard-satellite")
    expect(satellite.style).toBe("mapbox://styles/mapbox/standard-satellite")
  })

  it("derives auto lighting from the day phase and lets a choice win", () => {
    expect(resolveLightPreset("auto", "night")).toBe("night")
    expect(resolveLightPreset("auto", "dawn")).toBe("dawn")
    expect(resolveLightPreset("auto", "day")).toBe("day")
    expect(resolveLightPreset("dusk", "day")).toBe("dusk")
  })

  it("makes exploring rich and riding restrained", () => {
    const explore = resolveMapPresentation({ preset: "terrain", surface: "explore", lightPreset: "day" })
    const plan = resolveMapPresentation({ preset: "terrain", surface: "plan", lightPreset: "day" })
    const ride = resolveMapPresentation({ preset: "terrain", surface: "ride", lightPreset: "day" })

    expect(explore.show3dTrees).toBe(true)
    expect(explore.showPointOfInterestLabels).toBe(true)
    expect(explore.atmosphere).toBe(true)

    expect(plan.showPointOfInterestLabels).toBe(false)
    expect(plan.camera.pitch).toBeLessThan(explore.camera.pitch)
    expect(plan.terrain?.exaggeration).toBeLessThan(explore.terrain!.exaggeration)

    expect(ride.show3dTrees).toBe(false)
    expect(ride.show3dFacades).toBe(false)
    expect(ride.showPointOfInterestLabels).toBe(false)
    expect(ride.atmosphere).toBe(false)
    expect(ride.show3dBuildings).toBe(true)
    expect(ride.showRoadLabels).toBe(true)
  })

  it("never animates the camera or tilts the map while riding", () => {
    const ride = resolveMapPresentation({ preset: "satellite", surface: "ride", lightPreset: "night" })
    expect(ride.transitionMillis).toBe(0)
    expect(ride.camera.pitch).toBe(0)
  })

  it("keeps the Road canvas flat", () => {
    const road = resolveMapPresentation({ preset: "road", surface: "explore", lightPreset: "day" })
    expect(road.terrain).toBeNull()
    expect(road.atmosphere).toBe(false)
  })

  it("keeps route-emphasis compatibility until semantic visual tokens replace it", () => {
    const imagery = resolveMapPresentation({ preset: "satellite", surface: "plan", lightPreset: "day" })
    const night = resolveMapPresentation({ preset: "road", surface: "plan", lightPreset: "night" })
    const paper = resolveMapPresentation({ preset: "road", surface: "plan", lightPreset: "day" })
    expect(imagery.routeEmphasis).toBe("bright")
    expect(night.routeEmphasis).toBe("bright")
    expect(paper.routeEmphasis).toBe("standard")
  })
})

describe("legacy map presentation migration", () => {
  it("maps premium-wave experience ids to canonical presets", () => {
    expect(migrateLegacyMapExperience("standard")).toBe("road")
    expect(migrateLegacyMapExperience("terrain")).toBe("terrain")
    expect(migrateLegacyMapExperience("satellite")).toBe("satellite")
    expect(migrateLegacyMapExperience("hologram")).toBe("road")
    expect(migrateLegacyMapExperience(undefined)).toBe("road")
  })

  it("maps pre-premium styles deterministically", () => {
    expect(migrateLegacyMapStyle("clean")).toMatchObject({ preset: "road", lightPreference: "auto" })
    expect(migrateLegacyMapStyle("explorer")).toMatchObject({ preset: "terrain", lightPreference: "auto" })
    expect(migrateLegacyMapStyle("night")).toMatchObject({ preset: "road", lightPreference: "night" })
  })

  it("falls back to Road for an unknown or missing pre-premium style", () => {
    expect(migrateLegacyMapStyle(undefined)).toMatchObject({ preset: "road", lightPreference: "auto" })
    expect(migrateLegacyMapStyle("something-else")).toMatchObject({ preset: "road", lightPreference: "auto" })
  })

  it("writes an exact premium-wave rollback id for every canonical preset", () => {
    expect(legacyMapExperienceFor("road")).toBe("standard")
    expect(legacyMapExperienceFor("terrain")).toBe("terrain")
    expect(legacyMapExperienceFor("satellite")).toBe("satellite")
  })

  it("writes the nearest pre-premium rollback style without treating it as canonical", () => {
    expect(legacyMapStyleFor("road", "auto")).toBe("clean")
    expect(legacyMapStyleFor("terrain", "auto")).toBe("explorer")
    expect(legacyMapStyleFor("satellite", "auto")).toBe("explorer")
    expect(legacyMapStyleFor("road", "night")).toBe("night")
  })
})
