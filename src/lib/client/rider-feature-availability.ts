import type { RiderFeatureUnavailableSource } from "@/lib/map-features/osm"
import type { RiderLayerId } from "./map-layers"

/**
 * The single authority for which rider layers a provider outage affects.
 * `/api/map-features` reports failed providers; only the layers those
 * providers feed are marked failed, so successful data stays usable.
 */
export type RiderFeatureProvider = RiderFeatureUnavailableSource

const PROVIDER_FOR_LAYER: Partial<Record<RiderLayerId, RiderFeatureProvider>> = {
  weather: "weather",
  "live-traffic": "traffic",
  "gravel-atlas": "gravel-atlas"
}

export function riderFeatureUnavailableLayerIds(
  unavailable: readonly RiderFeatureProvider[] | undefined,
  requestedLayers: readonly RiderLayerId[]
): RiderLayerId[] {
  if (!unavailable || unavailable.length === 0) return []

  const unavailableSet = new Set(unavailable)
  // Every other feature layer is served by OSM/Overpass.
  return requestedLayers.filter((id) => unavailableSet.has(PROVIDER_FOR_LAYER[id] ?? "osm"))
}
