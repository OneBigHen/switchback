/**
 * The pre-premium map styles. Kept only so stored map packs, rider settings,
 * and offline packs written before the premium wave can still be read; new
 * state is a `MapExperienceId` plus a `MapLightPreference` (ADR 0015).
 */
import {
  isMapExperienceId,
  isMapLightPreference,
  migrateLegacyMapStyle,
  type MapExperienceId,
  type MapLightPreference
} from "./map-experience"

export type LegacyMapStyleId = "clean" | "explorer" | "night"

/** @deprecated Use `MapExperienceId` and `MapLightPreference`. */
export type MapStyleId = LegacyMapStyleId

export type RiderLayerId =
  | "curvature"
  | "unpaved"
  | "topo"
  | "satellite"
  | "terrain"
  | "public-land"
  | "private-land"
  | "mvum"
  | "closures"
  | "road-controls"
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
  | "basemap-imagery"
  | "basemap-topo"
  | "basemap-terrain"
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
  category: "base" | "roads" | "access" | "conditions" | "stops"
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
  /**
   * Packs written before the premium wave carry only a legacy style. It is
   * still written so an older build can read a pack this one saved.
   */
  mapStyle: LegacyMapStyleId
  experience?: MapExperienceId
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
  | { kind: "raster"; tiles: string[]; attribution: string; maxzoom: number }

const rasterLayerRuntimes: Partial<Record<RiderLayerId, RiderLayerRuntime>> = {
  topo: {
    kind: "raster",
    tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
    attribution: "© OpenTopoMap contributors",
    maxzoom: 17
  },
  satellite: {
    kind: "raster",
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    attribution: "Tiles © Esri",
    maxzoom: 19
  },
  terrain: {
    kind: "raster",
    tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}"],
    attribution: "USGS National Map",
    maxzoom: 16
  }
}

export const featureMapLayerIds = [
  "public-land",
  "private-land",
  "mvum",
  "closures",
  "road-controls",
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
  return rasterLayerRuntimes[id] ?? (featureLayerIdSet.has(id) ? { kind: "features" } : null)
}

/** Human-readable limits shown beside every planning layer. */
export function riderLayerConfidence(definition: RiderLayerDefinition): string {
  if (definition.status === "planned") return "Planned layer; no map data is available yet."
  if (rasterLayerRuntimes[definition.id]) return "Provider imagery coverage and update cadence vary by location."
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
    id: "unpaved", name: "PA unpaved roads", category: "roads", status: "regional",
    source: "Pennsylvania Spatial Data Access (PASDA)",
    provenance: "Pennsylvania Spatial Data Access (PASDA) official unpaved road dataset. Government-published, regional coverage. Verify currency against provider release notes.",
    dataCategory: "road-surface",
    freshness: "Dataset version shown by provider", coverage: "Pennsylvania",
    legend: "Brown dashed line = official unpaved road", minZoom: 7
  },
  {
    id: "topo", name: "Topographic base", category: "base", status: "live",
    source: "OpenTopoMap",
    provenance: "OpenTopoMap tile service rendering OpenStreetMap data. CC-BY-SA. Tile freshness varies by region.",
    dataCategory: "basemap-topo",
    freshness: "Provider tiles", coverage: "Global basemap",
    legend: "Topographic map overlay", minZoom: 0
  },
  {
    id: "satellite", name: "Satellite imagery", category: "base", status: "live",
    source: "Esri World Imagery",
    provenance: "Esri World Imagery tile service. Proprietary imagery with community-contributed updates. Resolution and age vary by location.",
    dataCategory: "basemap-imagery",
    freshness: "Provider imagery updates", coverage: "Provider coverage",
    legend: "Satellite image overlay", minZoom: 0
  },
  {
    id: "terrain", name: "Terrain and hillshade", category: "base", status: "live",
    source: "USGS National Map",
    provenance: "USGS National Map shaded relief tiles. Public domain. Terrain is static — does not reflect recent earthworks or trail changes.",
    dataCategory: "basemap-terrain",
    freshness: "Static terrain tiles", coverage: "United States",
    legend: "Shaded relief overlay", minZoom: 8
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
    provenance: "OpenStreetMap man_made=mast and communication:mobile_phone=yes nodes. Tower locations only — not signal strength, not carrier availability, not a coverage guarantee.",
    dataCategory: "conditions-connectivity",
    freshness: "Community-maintained", coverage: "Mapped towers",
    legend: "Purple marker = mapped tower, not a coverage guarantee", minZoom: 9
  }
]

const catalogIds = new Set<RiderLayerId>(layerCatalog.map((layer) => layer.id))

export function defaultRiderLayerSettings(): RiderLayerSetting[] {
  return layerCatalog.map((layer, order) => ({
    id: layer.id,
    visible: layer.id === "unpaved",
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
 * Layer ids that have been renamed. A rider's saved choice must survive the
 * rename: `traffic` was always OSM signals and stops, never live congestion,
 * and it is called `road-controls` now that real traffic is arriving as its
 * own thing. Dropping the old id would silently reset a saved map pack.
 */
const RENAMED_LAYER_IDS: Record<string, RiderLayerId> = {
  traffic: "road-controls"
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
    visible: layer.id === "unpaved",
    opacity: 1,
    order: layerCatalog.length + fallbackOrder
  }).sort((a, b) => a.order - b.order || layerCatalog.findIndex((layer) => layer.id === a.id) - layerCatalog.findIndex((layer) => layer.id === b.id))
    .map((setting, order) => ({ ...setting, order }))
}

export interface AppliedRiderMapPack {
  experience: MapExperienceId
  lightPreference: MapLightPreference
  routeVisibility: RiderMapPack["routeVisibility"]
  layers: RiderLayerSetting[]
}

/**
 * A pack saved before the premium wave only knows a legacy style, so it is
 * migrated on read: `clean` becomes Standard, `explorer` becomes Terrain, and
 * `night` becomes Standard under the night lighting the rider actually chose.
 */
export function applyRiderMapPack(
  currentLayers: readonly RiderLayerSetting[],
  pack: RiderMapPack
): AppliedRiderMapPack {
  const overrides = new Map(normalizeRiderLayerSettings(pack.layers).map((layer) => [layer.id, layer]))
  const source = normalizeRiderLayerSettings(currentLayers)
  const legacy = migrateLegacyMapStyle(pack.mapStyle)
  return {
    experience: isMapExperienceId(pack.experience) ? pack.experience : legacy.experience,
    lightPreference: isMapLightPreference(pack.lightPreference) ? pack.lightPreference : legacy.lightPreference,
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
  if (zoom < 7 || bounds.north - bounds.south > 4 || bounds.east - bounds.west > 6) return null
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
