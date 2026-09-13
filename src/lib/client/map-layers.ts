/**
 * The pre-premium map styles. Kept only so stored map packs, rider settings,
 * and offline packs written before the premium wave can still be read; new
 * state is a `MapPresetId` plus a `MapLightPreference` (ADR 0015).
 */
import {
  isLegacyMapExperienceId,
  isMapLightPreference,
  migrateLegacyMapExperience,
  migrateLegacyMapStyle,
  type LegacyMapExperienceId,
  type MapLightPreference
} from "./map-experience"
import { isMapPresetId, type MapPresetId } from "./map-preset-registry"
import {
  PA_UNPAVED_ROADS_MIN_ZOOM,
  PA_UNPAVED_ROADS_PROVENANCE
} from "@/lib/roads/types"

export { PA_UNPAVED_ROADS_PROVENANCE }

export type LegacyMapStyleId = "clean" | "explorer" | "night"

/** @deprecated Use `MapPresetId` and `MapLightPreference`. */
export type MapStyleId = LegacyMapStyleId

export type RiderLayerId =
  | "curvature"
  /** @deprecated Stored pre-Gravel-Atlas layer id. Normalize to `gravel-atlas`. */
  | "unpaved"
  | "gravel-atlas"
  | "public-land"
  | "private-land"
  | "mvum"
  | "closures"
  | "road-controls"
  | "live-traffic"
  | "weather"
  | "fuel"
  | "food"
  | "camping"
  | "lodging"
  | "repair"
  | "cell-coverage"

export type RiderLayerStatus = "live" | "regional" | "planned"

/**
 * Per-layer load state for feature-backed rider layers. Tracked in MapStage
 * after each Overpass/NWS fetch so the Layers panel can show per-layer
 * feedback (which specific layers are loading, found nothing in view,
 * errored, or are below zoom). `idle` means the layer is not enabled or
 * not in scope; everything else is a real, surfacable state.
 */
export type FeatureLayerState = "idle" | "loading" | "ready" | "empty" | "zoom" | "error"

export type DataCategory =
  | "road-geometry"
  | "road-surface"
  | "access-boundary"
  | "access-mvum"
  | "conditions-construction"
  | "conditions-traffic"
  | "conditions-weather"
  | "conditions-connectivity"
  | "services-fuel"
  | "services-food"
  | "services-camping"
  | "services-lodging"
  | "services-repair"

export interface RiderLayerDefinition {
  id: RiderLayerId
  name: string
  category: "roads" | "access" | "conditions" | "stops"
  status: RiderLayerStatus
  source: string
  provenance: string
  dataCategory: DataCategory
  freshness: string
  coverage: string
  legend: string
  minZoom: number
}

export interface RiderLayerSetting {
  id: RiderLayerId
  visible: boolean
  opacity: number
  order: number
}

export interface CatalogLayerSetting {
  definition: RiderLayerDefinition
  setting: RiderLayerSetting
}

export interface RiderLayerSettingInput {
  id: string
  visible: boolean
  opacity: number
  order: number
}

export interface RiderMapPack {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  /** Canonical map choice for packs written by Phase 1 and later. */
  preset?: MapPresetId
  /**
   * Rollback-only premium-wave field. It holds a `LegacyMapExperienceId`
   * ("standard" | "terrain" | "satellite"), not a canonical preset id, so it
   * must be validated with `isLegacyMapExperienceId` before migration.
   */
  experience?: LegacyMapExperienceId
  /**
   * Packs written before the premium wave carry only a legacy style. It is
   * still written so an older build can read a pack this one saved.
   */
  mapStyle: LegacyMapStyleId
  lightPreference?: MapLightPreference
  routeVisibility: "standard" | "high-contrast"
  layers: RiderLayerSetting[]
}

export interface ViewportBounds {
  west: number
  south: number
  east: number
  north: number
}

export type RiderLayerRuntime =
  | { kind: "local" }
  | { kind: "features" }

export const featureMapLayerIds = [
  "gravel-atlas",
  "public-land",
  "private-land",
  "mvum",
  "closures",
  "road-controls",
  "live-traffic",
  "weather",
  "fuel",
  "food",
  "camping",
  "lodging",
  "repair",
  "cell-coverage"
] as const satisfies readonly RiderLayerId[]

const featureLayerIdSet = new Set<RiderLayerId>(featureMapLayerIds)

export function mapLayerRuntime(id: RiderLayerId): RiderLayerRuntime | null {
  if (id === "curvature" || id === "unpaved") return { kind: "local" }
  return featureLayerIdSet.has(id) ? { kind: "features" } : null
}

/** Human-readable limits shown beside every planning layer. */
export function riderLayerConfidence(definition: RiderLayerDefinition): string {
  if (definition.status === "planned") return "Planned layer; no map data is available yet."
  if (definition.source.startsWith("OpenStreetMap")) return "Mapped context can be incomplete; verify legal access and current conditions."
  if (definition.status === "regional") return "Regional dataset; use only inside the stated coverage area."
  return "Capability-backed data; confirm conditions before relying on it in motion."
}

export const layerCatalog: readonly RiderLayerDefinition[] = [
  {
    id: "curvature", name: "Great roads", category: "roads", status: "live",
    source: "Switchback road-shape analysis",
    provenance: "Computed heuristically from OpenStreetMap road geometry using bend-density scoring. Approximate — not ground-truthed.",
    dataCategory: "road-geometry",
    freshness: "Computed from local road geometry", coverage: "Current routing region",
    legend: "Warmer, heavier line = denser bends", minZoom: 7
  },
  {
    id: "gravel-atlas", name: "Known gravel roads", category: "roads", status: "regional",
    source: "Switchback Gravel Atlas",
    provenance: "Graph-verified gravel and unimproved-road corridors reconciled from Government-published official source snapshots and the active motorcycle routing graph. Surface evidence is not a guarantee of legal access, current openness, or passability.",
    dataCategory: "road-surface",
    freshness: "Source snapshot + routing-graph fingerprint", coverage: "New Jersey only",
    legend: "Tan dashed line = graph-verified known gravel corridor", minZoom: 8
  },
  {
    id: "public-land", name: "Protected and public land", category: "access", status: "live",
    source: "OpenStreetMap protected-area tags",
    provenance: "OpenStreetMap boundary=protected_area and leisure=nature_reserve tags. Community-mapped; boundaries may be approximate. Not a legal determination.",
    dataCategory: "access-boundary",
    freshness: "Community-maintained", coverage: "Mapped areas",
    legend: "Green fill = mapped protected or public land", minZoom: 8
  },
  {
    id: "private-land", name: "Restricted-access context", category: "access", status: "live",
    source: "OpenStreetMap access tags",
    provenance: "OpenStreetMap access=private and access=no tags. Heuristic only — not parcel data, not legal boundaries. False positives and omissions occur.",
    dataCategory: "access-boundary",
    freshness: "Community-maintained", coverage: "Mapped restrictions",
    legend: "Red lines/areas = mapped private or no-access tags, not parcel ownership", minZoom: 11
  },
  {
    id: "mvum", name: "Forest-road access", category: "access", status: "live",
    source: "OpenStreetMap US Forest Service tags",
    provenance: "OpenStreetMap motor_vehicle=yes/designated tags within USFS boundaries. Community-mapped approximation — always check the current MVUM.",
    dataCategory: "access-mvum",
    freshness: "Community-maintained", coverage: "Mapped forest roads",
    legend: "Green lines = mapped Forest Service roads; confirm current MVUM rules", minZoom: 9
  },
  {
    id: "closures", name: "Construction projects", category: "conditions", status: "live",
    source: "OpenStreetMap construction tags",
    provenance: "OpenStreetMap highway=construction tags. Community-reported, not a live closure feed. A mapped construction zone may have already reopened.",
    dataCategory: "conditions-construction",
    freshness: "Community-maintained", coverage: "Mapped road work",
    legend: "Red markers = mapped road construction, not a live closure feed", minZoom: 9
  },
  {
    id: "road-controls", name: "Road controls", category: "conditions", status: "live",
    source: "OpenStreetMap traffic-control tags",
    provenance: "OpenStreetMap highway=traffic_signals and restriction relations. Community-mapped infrastructure, not real-time traffic data.",
    dataCategory: "conditions-traffic",
    freshness: "Community-maintained", coverage: "Mapped controls",
    legend: "Amber markers = mapped signals and stops; not live congestion", minZoom: 11
  },
  {
    id: "live-traffic", name: "Live traffic", category: "conditions", status: "live",
    source: "TomTom Orbis Traffic",
    provenance: "TomTom live incident feed, requested server-side for the current map view. Reports provider incidents and closures; absence of data is not treated as proof a road is clear.",
    dataCategory: "conditions-traffic",
    freshness: "Live incident feed", coverage: "TomTom traffic coverage",
    legend: "Red lines/markers = reported live traffic incidents", minZoom: 9
  },
  {
    id: "weather", name: "Active weather alerts", category: "conditions", status: "regional",
    source: "National Weather Service",
    provenance: "National Weather Service (NWS) API alert feed. NOAA public data. Live within refresh window; subject to NWS update cadence and polygon precision.",
    dataCategory: "conditions-weather",
    freshness: "Live alert feed", coverage: "United States",
    legend: "Blue polygons = active NWS alert areas", minZoom: 5
  },
  {
    id: "fuel", name: "Fuel", category: "stops", status: "live",
    source: "OpenStreetMap amenity data",
    provenance: "OpenStreetMap amenity=fuel nodes. Community-mapped point data. Hours, pricing, and availability are not tracked. Call ahead.",
    dataCategory: "services-fuel",
    freshness: "Community-maintained", coverage: "Mapped locations",
    legend: "Yellow marker = mapped fuel stop", minZoom: 10
  },
  {
    id: "food", name: "Food", category: "stops", status: "live",
    source: "OpenStreetMap amenity data",
    provenance: "OpenStreetMap amenity=restaurant/fast_food/cafe nodes. Community-mapped point data. Hours and availability are not tracked.",
    dataCategory: "services-food",
    freshness: "Community-maintained", coverage: "Mapped locations",
    legend: "Orange marker = mapped food stop", minZoom: 10
  },
  {
    id: "camping", name: "Camping", category: "stops", status: "live",
    source: "OpenStreetMap tourism data",
    provenance: "OpenStreetMap tourism=camp_site and tourism=caravan_site nodes. Community-mapped. Site type, fees, and seasonal availability are not tracked.",
    dataCategory: "services-camping",
    freshness: "Community-maintained", coverage: "Mapped locations",
    legend: "Green marker = mapped campground", minZoom: 9
  },
  {
    id: "lodging", name: "Lodging", category: "stops", status: "live",
    source: "OpenStreetMap tourism data",
    provenance: "OpenStreetMap tourism=hotel/motel/guest_house nodes. Community-mapped point data. Rates, availability, and seasonal closures are not tracked.",
    dataCategory: "services-lodging",
    freshness: "Community-maintained", coverage: "Mapped locations",
    legend: "Purple marker = mapped lodging", minZoom: 10
  },
  {
    id: "repair", name: "Motorcycle and vehicle repair", category: "stops", status: "live",
    source: "OpenStreetMap shop data",
    provenance: "OpenStreetMap shop=motorcycle and shop=car_repair nodes. Community-mapped. Hours, services offered, and motorcycle-specific capability are not tracked.",
    dataCategory: "services-repair",
    freshness: "Community-maintained", coverage: "Mapped locations",
    legend: "Blue marker = mapped repair stop", minZoom: 10
  },
  {
    id: "cell-coverage", name: "Cell towers", category: "conditions", status: "live",
    source: "OpenStreetMap communications tags",
    provenance: "OpenStreetMap man_made=mast and communication:mobile_phone=yes tags. Tower locations only — not signal strength, not carrier availability, not a coverage guarantee.",
    dataCategory: "conditions-connectivity",
    freshness: "Community-maintained", coverage: "Mapped towers",
    legend: "Purple marker = mapped tower, not a coverage guarantee", minZoom: 9
  }
]

const catalogIds = new Set<RiderLayerId>(layerCatalog.map((layer) => layer.id))

export function defaultRiderLayerSettings(): RiderLayerSetting[] {
  return layerCatalog.map((layer, order) => ({
    id: layer.id,
    visible: false,
    opacity: 1,
    order
  }))
}

/**
 * Produces the complete layer catalog for the map studio. Saved settings may
 * omit newer catalog entries, so the UI always receives a safe default for
 * every supported layer and a deterministic draw/order sequence.
 */
export function catalogLayerSettings(settings: readonly RiderLayerSetting[]): CatalogLayerSetting[] {
  return layerCatalog.map((definition, fallbackOrder) => ({
    definition,
    setting: settings.find((setting) => setting.id === definition.id) ?? {
      id: definition.id,
      visible: false,
      opacity: 1,
      order: settings.length + fallbackOrder
    }
  })).sort((first, second) => first.setting.order - second.setting.order)
}

/**
 * Layer ids that have been renamed. A rider's saved choice must survive each
 * rename. `traffic` was always OSM signals and stops, never live congestion;
 * `unpaved` was the PA-only PASDA overlay and now migrates into the unified,
 * graph-verified Pennsylvania/New Jersey Gravel Atlas surface layer.
 */
const RENAMED_LAYER_IDS: Record<string, RiderLayerId> = {
  traffic: "road-controls",
  unpaved: "gravel-atlas"
}

/**
 * Basemap choices that used to sit in this overlay catalog. They are the map
 * itself, not something drawn on top of it, and every one of them duplicated a
 * canonical map preset — a rider could pick Satellite twice, from two controls,
 * and mean two different renderers. `migrateRetiredBasemapLayer` turns a stored
 * choice back into the preset it always meant; the layer id itself is dropped.
 */
const RETIRED_BASEMAP_LAYER_PRESETS: Record<string, MapPresetId> = {
  satellite: "satellite",
  terrain: "terrain",
  // OpenTopoMap replaced the whole basemap, which the Standard/Standard
  // Satellite renderer model (ADR 0015) has no place for. Terrain is the
  // nearest canonical preset that still reads relief.
  topo: "terrain"
}

export function migrateRetiredBasemapLayer(id: string): MapPresetId | null {
  return RETIRED_BASEMAP_LAYER_PRESETS[id] ?? null
}

export function migrateRiderLayerId(id: string): RiderLayerId | null {
  const renamed = RENAMED_LAYER_IDS[id]
  if (renamed) return renamed
  return catalogIds.has(id as RiderLayerId) ? id as RiderLayerId : null
}

export function normalizeRiderLayerSettings(settings: readonly RiderLayerSettingInput[] | null | undefined): RiderLayerSetting[] {
  const selected = new Map<RiderLayerId, RiderLayerSetting>()
  for (const setting of settings ?? []) {
    const id = migrateRiderLayerId(setting.id)
    if (!id || selected.has(id)) continue
    selected.set(id, {
      id,
      visible: Boolean(setting.visible),
      opacity: Math.max(0, Math.min(1, Number.isFinite(setting.opacity) ? setting.opacity : 1)),
      order: Number.isFinite(setting.order) ? Math.max(0, Math.floor(setting.order)) : layerCatalog.length
    })
  }
  return layerCatalog.map((layer, fallbackOrder) => selected.get(layer.id) ?? {
    id: layer.id,
    visible: false,
    opacity: 1,
    order: layerCatalog.length + fallbackOrder
  }).sort((a, b) => a.order - b.order || layerCatalog.findIndex((layer) => layer.id === a.id) - layerCatalog.findIndex((layer) => layer.id === b.id))
    .map((setting, order) => ({ ...setting, order }))
}

export interface AppliedRiderMapPack {
  preset: MapPresetId
  lightPreference: MapLightPreference
  routeVisibility: RiderMapPack["routeVisibility"]
  layers: RiderLayerSetting[]
}

/**
 * A pack saved before the basemap layers were retired may carry the rider's
 * real basemap intent in its layer list rather than its preset. Satellite wins
 * over relief when both were switched on, because imagery is the more specific
 * request.
 */
function retiredBasemapPreset(pack: RiderMapPack): MapPresetId | null {
  let relief: MapPresetId | null = null
  for (const layer of pack.layers ?? []) {
    if (!layer?.visible) continue
    const preset = migrateRetiredBasemapLayer(String(layer.id))
    if (preset === "satellite") return "satellite"
    if (preset) relief = preset
  }
  return relief
}

function storedMapPackPresentation(pack: RiderMapPack): {
  preset: MapPresetId
  lightPreference: MapLightPreference
} {
  const lightPreference = isMapLightPreference(pack.lightPreference)
    ? pack.lightPreference
    : undefined

  const retiredBasemap = retiredBasemapPreset(pack)

  if (isMapPresetId(pack.preset)) {
    // The rider's explicit preset wins, except where they had also switched on
    // a retired basemap layer that the flat Road canvas cannot express.
    const preset = pack.preset === "road" && retiredBasemap ? retiredBasemap : pack.preset
    return { preset, lightPreference: lightPreference ?? "auto" }
  }

  if (isLegacyMapExperienceId(pack.experience)) {
    const preset = migrateLegacyMapExperience(pack.experience)
    return {
      preset: preset === "road" && retiredBasemap ? retiredBasemap : preset,
      lightPreference: lightPreference ?? "auto"
    }
  }

  const legacy = migrateLegacyMapStyle(pack.mapStyle)
  return {
    preset: legacy.preset === "road" && retiredBasemap ? retiredBasemap : legacy.preset,
    lightPreference: lightPreference ?? legacy.lightPreference
  }
}

/**
 * Restore any saved generation deterministically. Canonical preset wins;
 * otherwise premium-wave experience is migrated, then the pre-premium style.
 */
export function applyRiderMapPack(
  currentLayers: readonly RiderLayerSetting[],
  pack: RiderMapPack
): AppliedRiderMapPack {
  const overrides = new Map(normalizeRiderLayerSettings(pack.layers).map((layer) => [layer.id, layer]))
  const source = normalizeRiderLayerSettings(currentLayers)
  const presentation = storedMapPackPresentation(pack)
  return {
    preset: presentation.preset,
    lightPreference: presentation.lightPreference,
    routeVisibility: pack.routeVisibility,
    layers: source.map((layer) => overrides.get(layer.id) ?? layer)
  }
}

const OPEN_FREE_MAP_STYLES: Record<MapStyleId, string> = {
  clean: "https://tiles.openfreemap.org/styles/positron",
  explorer: "https://tiles.openfreemap.org/styles/liberty",
  night: "https://tiles.openfreemap.org/styles/fiord"
}

export function mapStyleUrl(style: MapStyleId): string {
  return OPEN_FREE_MAP_STYLES[style]
}

export function shouldShowBaseMapFailure(
  initialStyleLoaded: boolean,
  styleLoadedNow: boolean
): boolean {
  return !initialStyleLoaded && !styleLoadedNow
}

export function paUnpavedRoadsQuery(bounds: ViewportBounds, zoom: number): string | null {
  // Matches the server's floor: below it the request is rejected, and a
  // rejection paints the overlay as unavailable rather than as zoomed out.
  if (
    zoom < PA_UNPAVED_ROADS_MIN_ZOOM ||
    bounds.north - bounds.south > 4 ||
    bounds.east - bounds.west > 6
  ) return null
  return new URLSearchParams({
    bbox: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    zoom: String(Math.floor(zoom)),
    limit: "500"
  }).toString()
}

export function riderFeatureLayersAtZoom(settings: readonly RiderLayerSetting[], zoom: number): RiderLayerId[] {
  return settings
    .filter((setting) => setting.visible && mapLayerRuntime(setting.id)?.kind === "features")
    .filter((setting) => (layerCatalog.find((layer) => layer.id === setting.id)?.minZoom ?? Infinity) <= zoom)
    .sort((first, second) => first.order - second.order)
    .map((setting) => setting.id)
}

export function riderFeatureQuery(
  settings: readonly RiderLayerSetting[],
  bounds: ViewportBounds,
  zoom: number
): string | null {
  const layers = riderFeatureLayersAtZoom(settings, zoom)
  if (layers.length === 0 || bounds.north - bounds.south > 2 || bounds.east - bounds.west > 3) return null
  return new URLSearchParams({
    bbox: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    layers: layers.join(",")
  }).toString()
}
