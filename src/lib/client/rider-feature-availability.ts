import type { RiderLayerId } from "./map-layers"

export type RiderFeatureProvider = "osm" | "weather" | "traffic"

const NON_OSM_FEATURE_LAYERS = new Set<RiderLayerId>(["weather", "live-traffic"])

export function riderFeatureUnavailableLayerIds(
  unavailable: readonly RiderFeatureProvider[] | undefined,
  requestedLayers: readonly RiderLayerId[]
): RiderLayerId[] {
  if (!unavailable || unavailable.length === 0) return []

  const unavailableSet = new Set(unavailable)
  return requestedLayers.filter((id) => {
    if (id === "live-traffic") return unavailableSet.has("traffic")
    if (id === "weather") return unavailableSet.has("weather")
    return !NON_OSM_FEATURE_LAYERS.has(id) && unavailableSet.has("osm")
  })
}
