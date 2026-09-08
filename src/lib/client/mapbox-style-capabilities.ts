import type { MapPresentation } from "./map-experience"

export type MapboxBasemapConfig = Record<string, string | boolean>

/**
 * Translate a resolved Switchback presentation into only the configuration
 * properties supported by the active Mapbox style family.
 *
 * Mapbox Standard exposes theme and granular 3D controls. Standard Satellite
 * intentionally does not receive those properties; sending unsupported
 * Standard-only configuration there makes style changes fragile and couples
 * the product model to renderer implementation details.
 */
export function mapboxBasemapConfig(
  presentation: MapPresentation
): MapboxBasemapConfig {
  const shared: MapboxBasemapConfig = {
    lightPreset: presentation.lightPreset,
    showTransitLabels: false,
    showPlaceLabels: true,
    showRoadLabels: presentation.showRoadLabels,
    showPointOfInterestLabels: presentation.showPointOfInterestLabels
  }

  if (presentation.styleFamily === "standard-satellite") return shared

  return {
    ...shared,
    theme: presentation.theme,
    show3dBuildings: presentation.show3dBuildings,
    show3dTrees: presentation.show3dTrees,
    show3dLandmarks: presentation.show3dLandmarks,
    show3dFacades: presentation.show3dFacades
  }
}
