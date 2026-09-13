import type { MapPresentation } from "./map-experience"

export type MapboxBasemapConfig = Record<string, string | boolean>

/**
 * Translate a resolved OpenGravel presentation into only the configuration
 * properties the active Mapbox style family actually supports.
 *
 * Every key below is a real Mapbox Standard basemap config property. The
 * Standard import accepts `lightPreset`, `theme`, `font`, `show3dObjects`,
 * `showRoadsAndTransit`, `showPedestrianRoads`, `showPlaceLabels`,
 * `showRoadLabels`, `showPointOfInterestLabels` and `showTransitLabels` —
 * so `show3dBuildings` is the product's word for the choice and
 * `show3dObjects` is the property the renderer reads.
 *
 * Standard Satellite exposes neither `theme` nor `show3dObjects`; sending
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
    show3dObjects: presentation.show3dBuildings
  }
}
