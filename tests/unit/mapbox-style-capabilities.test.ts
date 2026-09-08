import { describe, expect, it } from "vitest"
import { resolveMapPresentation } from "@/lib/client/map-experience"
import { mapboxBasemapConfig } from "@/lib/client/mapbox-style-capabilities"

describe("Mapbox style-family capabilities", () => {
  it("emits Standard label, theme, and 3D-object controls", () => {
    const presentation = resolveMapPresentation({
      preset: "terrain",
      surface: "explore",
      lightPreset: "day"
    })

    expect(mapboxBasemapConfig(presentation)).toEqual({
      lightPreset: "day",
      showTransitLabels: false,
      showPlaceLabels: true,
      showRoadLabels: true,
      showPointOfInterestLabels: true,
      theme: "default",
      show3dObjects: true
    })
  })

  it("omits Standard-only theme and 3D controls from Standard Satellite", () => {
    const presentation = resolveMapPresentation({
      preset: "satellite",
      surface: "plan",
      lightPreset: "dusk"
    })
    const config = mapboxBasemapConfig(presentation)

    expect(config).toEqual({
      lightPreset: "dusk",
      showTransitLabels: false,
      showPlaceLabels: true,
      showRoadLabels: true,
      showPointOfInterestLabels: false
    })
    for (const unsupported of [
      "theme",
      "show3dObjects",
      "show3dBuildings",
      "show3dTrees",
      "show3dLandmarks",
      "show3dFacades"
    ]) {
      expect(config).not.toHaveProperty(unsupported)
    }
  })
})

describe("mapbox basemap config property names", () => {
  // Mapbox Standard's config schema is fixed: lightPreset, theme, font,
  // show3dObjects, showRoadsAndTransit, showPedestrianRoads, showPlaceLabels,
  // showRoadLabels, showPointOfInterestLabels, showTransitLabels. A property
  // outside that set is silently ignored by the renderer, so a presentation
  // field that never reaches the map is a field the rider cannot actually see.
  const MAPBOX_STANDARD_CONFIG_PROPERTIES = new Set([
    "lightPreset",
    "theme",
    "font",
    "show3dObjects",
    "showRoadsAndTransit",
    "showPedestrianRoads",
    "showPlaceLabels",
    "showRoadLabels",
    "showPointOfInterestLabels",
    "showTransitLabels"
  ])

  it("emits only real Mapbox Standard config properties", () => {
    for (const preset of ["road", "terrain", "satellite"] as const) {
      const config = mapboxBasemapConfig(
        resolveMapPresentation({ preset, surface: "plan", lightPreset: "day" })
      )
      for (const name of Object.keys(config)) {
        expect(MAPBOX_STANDARD_CONFIG_PROPERTIES.has(name), `${preset}: ${name}`).toBe(true)
      }
    }
  })

  it("carries the 3D choice as show3dObjects rather than a product-side name", () => {
    const config = mapboxBasemapConfig(
      resolveMapPresentation({ preset: "road", surface: "plan", lightPreset: "day" })
    )
    expect(config.show3dObjects).toBe(true)
    expect(config.show3dBuildings).toBeUndefined()
  })
})
