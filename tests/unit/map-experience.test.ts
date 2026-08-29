import { describe, expect, it } from "vitest"
import {
  lightPresetForMapStyle,
  resolveMapExperience,
  visualModeForMapStyle
} from "@/lib/client/map-experience"

describe("map experience configuration", () => {
  it("keeps every planning mode on a Mapbox Standard style", () => {
    for (const mode of ["standard", "terrain"] as const) {
      expect(resolveMapExperience({ mode, surface: "planning", lightPreset: "day" }).style)
        .toBe("mapbox://styles/mapbox/standard")
    }
    expect(resolveMapExperience({ mode: "satellite", surface: "planning", lightPreset: "day" }).style)
      .toBe("mapbox://styles/mapbox/standard-satellite")
  })

  it("derives the light preset from the day phase instead of a separate night style", () => {
    expect(lightPresetForMapStyle("clean", "night")).toBe("night")
    expect(lightPresetForMapStyle("clean", "dawn")).toBe("dawn")
    expect(lightPresetForMapStyle("clean", "day")).toBe("day")
    // The persisted night style is a lighting choice, not a second style.
    expect(visualModeForMapStyle("night")).toBe("standard")
    expect(lightPresetForMapStyle("night", "day")).toBe("night")
  })

  it("lets a manual override win over the derived day phase", () => {
    expect(lightPresetForMapStyle("night", "day", "dusk")).toBe("dusk")
  })

  it("applies Ride Focus by removing detail that costs battery and attention", () => {
    const planning = resolveMapExperience({ mode: "terrain", surface: "planning", lightPreset: "day" })
    const ride = resolveMapExperience({ mode: "terrain", surface: "ride", lightPreset: "day" })
    expect(planning.show3dTrees).toBe(true)
    expect(planning.showPointOfInterestLabels).toBe(true)
    expect(ride.show3dTrees).toBe(false)
    expect(ride.show3dFacades).toBe(false)
    expect(ride.showPointOfInterestLabels).toBe(false)
    // Orientation and road identity survive Ride Focus.
    expect(ride.show3dBuildings).toBe(true)
    expect(ride.showRoadLabels).toBe(true)
  })
})
