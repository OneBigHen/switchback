import { describe, expect, it } from "vitest"
import { resolveMapPresentation } from "@/lib/client/map-experience"
import { mapboxBasemapConfig } from "@/lib/client/mapbox-style-capabilities"

describe("Mapbox style-family capabilities", () => {
  it("emits Standard label, theme, and granular 3D controls", () => {
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
      show3dBuildings: true,
      show3dTrees: true,
      show3dLandmarks: true,
      show3dFacades: true
    })
    expect(mapboxBasemapConfig(presentation)).not.toHaveProperty("show3dObjects")
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
