import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl"
import type { PlannerMapRenderer } from "./planner-map-renderer"
import {
  buildRouteFeatures,
  buildRouteLabelFeatures,
  buildWaypointFeatures,
  emptyFeatureCollection
} from "@/lib/client/map-data"
import { buildNavigationMapFeatures } from "@/lib/client/navigation-map"
import {
  featureMapLayerIds,
  layerCatalog,
  mapLayerRuntime,
  type RiderLayerId,
  type RiderLayerSetting
} from "@/lib/client/map-layers"
import type { NavigationFrame } from "@/lib/client/navigation-engine"
import type { ReferenceMap } from "@/lib/client/reference-map"
import type { AvoidArea, PlannedRoute, Waypoint } from "@/lib/routing/types"

export interface PlannerMapSourceProps {
  routes: PlannedRoute[]
  selectedRouteId: string | null
  /** Ephemeral route-card/map preview. Never persisted or used for routing. */
  previewRouteId?: string | null
  start: Waypoint | null
  finish: Waypoint | null
  via: Waypoint[]
  avoidAreas: AvoidArea[]
  rideMode: boolean
  navigationFrame?: NavigationFrame | null
}

export const RIDER_FEATURE_SOURCE = "switchback-rider-features"

export function geoJsonSource(map: MapLibreMap, id: string): GeoJSONSource | null {
  return map.getSource(id) as GeoJSONSource | undefined ?? null
}

export function riderFeatureLayerIds(id: RiderLayerId): string[] {
  return [`switchback-${id}-fill`, `switchback-${id}-lines`, `switchback-${id}-points`]
}

// E2E-only diagnostic seam: read-only observation of the MapLibre sources this
// module maintains. Route regressions must be proven against the real
// rendering authority (for example the "switchback-routes" GeoJSON source),
// not just route-card text or selected IDs.
//
// Inert in normal production runs: Next.js inlines process.env.NODE_ENV at
// build time, so a production bundle constant-folds `mapDebugEnabled` to
// false, eliminates every guarded branch, and never exposes
// `window.__switchbackMapSourcesDebug`. The seam is purely observational: it
// reads existing source data, asks the map camera where a coordinate lands, and
// counts the setData calls this module already performs. It never mirrors route
// geometry into a second state authority and contains no route-specific logic.
export interface SwitchbackMapSourcesDebug {
  /** Current GeoJSON data of an existing source, or null when it is absent. */
  getSourceData(sourceId: string): Promise<unknown | null>
  /** Number of setData updates recorded for a source since its map registered. */
  getUpdateCount(sourceId: string): number
  /** Clear recorded update counters (never touches source data). */
  resetUpdateCounts(): void
  /** Ids of every source currently registered on the map style. */
  listSourceIds(): string[]
  /**
   * Canvas pixel position of a [lng, lat] coordinate, or null when the map
   * cannot project yet. Read-only camera query so e2e tests can click real
   * rendered geometry instead of guessing at pixels.
   */
  projectCoordinate(coordinate: [number, number]): { x: number; y: number } | null
  /**
   * Whether MapLibre has finished loading its style and sources. A style that
   * never loads (for example when the worker bundle is missing) makes every
   * hit-test query return nothing, so e2e reports this on a failed click.
   */
  loadState(): { loaded: boolean; styleLoaded: boolean; routeSourceLoaded: boolean }
}

declare global {
  interface Window {
    __switchbackMapSourcesDebug?: SwitchbackMapSourcesDebug
  }
}

const mapDebugEnabled = process.env.NODE_ENV !== "production"
const mapUpdateCounts = new WeakMap<MapLibreMap, Map<string, number>>()
const debugRegisteredMaps = new WeakSet<MapLibreMap>()

function registerMapSourcesDebug(map: MapLibreMap) {
  if (!mapDebugEnabled || typeof window === "undefined" || debugRegisteredMaps.has(map)) return
  debugRegisteredMaps.add(map)
  window.__switchbackMapSourcesDebug = {
    getSourceData(sourceId: string) {
      const source = map.getSource(sourceId)
      if (!source || source.type !== "geojson") return Promise.resolve(null)
      return (source as GeoJSONSource).getData()
    },
    getUpdateCount(sourceId: string) {
      return mapUpdateCounts.get(map)?.get(sourceId) ?? 0
    },
    resetUpdateCounts() {
      mapUpdateCounts.get(map)?.clear()
    },
    listSourceIds() {
      return Object.keys(map.getStyle().sources)
    },
    projectCoordinate(coordinate: [number, number]) {
      const point = map.project(coordinate)
      return { x: point.x, y: point.y }
    },
    loadState() {
      return {
        loaded: map.loaded(),
        styleLoaded: map.isStyleLoaded() === true,
        routeSourceLoaded: map.isSourceLoaded("switchback-routes") === true
      }
    }
  }
}

function setGeoJsonSourceData(
  map: MapLibreMap,
  sourceId: string,
  data: Parameters<GeoJSONSource["setData"]>[0]
) {
  const source = geoJsonSource(map, sourceId)
  if (!source) return
  source.setData(data)
  if (!mapDebugEnabled) return
  let counts = mapUpdateCounts.get(map)
  if (!counts) {
    counts = new Map()
    mapUpdateCounts.set(map, counts)
  }
  counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1)
}


function riderLayerColor(id: RiderLayerId): string {
  switch (id) {
    case "gravel-atlas": return "#B88955"
    case "public-land":
    case "mvum":
    case "camping": return "#3D8B55"
    case "private-land":
    case "closures": return "#C84432"
    case "road-controls":
    case "fuel":
    case "food": return "#E39D2D"
    case "weather":
    case "repair": return "#2B75BC"
    case "lodging":
    case "cell-coverage": return "#8657A9"
    default: return "#5E7885"
  }
}

/**
 * Keep road-surface evidence visually distinct from generic contextual layers.
 * The dash treatment matches the Gravel Atlas legend and prevents an official
 * surface-evidence line from looking like a route or a legal-access boundary.
 */
export function riderLayerLinePaint(id: RiderLayerId) {
  const paint: {
    "line-color": string
    "line-width": number
    "line-opacity": number
    "line-dasharray"?: number[]
  } = {
    "line-color": riderLayerColor(id),
    "line-width": 2.5,
    "line-opacity": 0.8
  }
  if (id === "gravel-atlas") {
    paint["line-width"] = 3
    paint["line-opacity"] = 0.9
    paint["line-dasharray"] = [2, 1.5]
  }
  return paint
}

export function addRiderMapLayers(map: MapLibreMap, renderer: PlannerMapRenderer) {
  map.addSource(RIDER_FEATURE_SOURCE, { type: "geojson", data: emptyFeatureCollection() })
  for (const id of featureMapLayerIds) {
    const filter: ["==", string, string] = ["==", "layerId", id]
    const color = riderLayerColor(id)
    renderer.addLayer(map, {
      id: riderFeatureLayerIds(id)[0], type: "fill", source: RIDER_FEATURE_SOURCE, filter,
      layout: { visibility: "none" },
      paint: { "fill-color": color, "fill-opacity": 0.16, "fill-outline-color": color }
    }, { slot: "bottom", beforeId: "switchback-route-shadow" })
    renderer.addLayer(map, {
      id: riderFeatureLayerIds(id)[1], type: "line", source: RIDER_FEATURE_SOURCE, filter,
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: riderLayerLinePaint(id)
    }, { slot: "middle", beforeId: "switchback-route-shadow" })
    renderer.addLayer(map, {
      id: riderFeatureLayerIds(id)[2], type: "circle", source: RIDER_FEATURE_SOURCE, filter,
      layout: { visibility: "none" },
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 7], "circle-color": color, "circle-stroke-color": "#101310", "circle-stroke-width": 1.5, "circle-opacity": 0.9 }
    }, { slot: "middle", beforeId: "switchback-route-shadow" })
  }
}

export function updateRiderMapLayerPresentation(
  map: MapLibreMap,
  settings: readonly RiderLayerSetting[],
  renderer: PlannerMapRenderer
) {
  const byId = new Map(settings.map((setting) => [setting.id, setting]))
  const sorted = [...settings].sort((first, second) => first.order - second.order)
  for (const definition of layerCatalog) {
    const setting = byId.get(definition.id)
    const runtime = mapLayerRuntime(definition.id)
    if (!setting || !runtime) continue
    const visibility = setting.visible ? "visible" : "none"
    if (runtime.kind === "features") {
      for (const id of riderFeatureLayerIds(definition.id)) map.setLayoutProperty(id, "visibility", visibility)
      map.setPaintProperty(riderFeatureLayerIds(definition.id)[0], "fill-opacity", setting.opacity * 0.2)
      map.setPaintProperty(riderFeatureLayerIds(definition.id)[1], "line-opacity", setting.opacity)
      map.setPaintProperty(riderFeatureLayerIds(definition.id)[2], "circle-opacity", setting.opacity)
    }
  }
  for (const setting of sorted) {
    const runtime = mapLayerRuntime(setting.id)
    const ids = runtime?.kind === "features" ? riderFeatureLayerIds(setting.id) : []
    // Slot placement already keeps rider layers under the route; the move
    // only reorders them among themselves. A cross-slot `beforeId` would be
    // rejected, so the slotted renderer moves to the top of its own slot.
    for (const id of ids) renderer.moveLayer(map, id, "switchback-route-shadow")
  }
}

export function updatePlannerSources(map: MapLibreMap, props: PlannerMapSourceProps) {
  if (mapDebugEnabled) registerMapSourcesDebug(map)
  const visibleRoutes = props.rideMode ? props.routes.filter((route) => route.id === props.selectedRouteId) : props.routes
  const progressPercent = props.rideMode && props.navigationFrame ? props.navigationFrame.routePercent : undefined
  const previewRouteId = props.rideMode ? null : props.previewRouteId ?? null
  setGeoJsonSourceData(map, "switchback-routes", buildRouteFeatures(visibleRoutes, props.selectedRouteId, progressPercent, previewRouteId))
  setGeoJsonSourceData(map, "switchback-route-labels", buildRouteLabelFeatures(props.rideMode ? visibleRoutes : props.routes, props.selectedRouteId))
  setGeoJsonSourceData(map, "switchback-waypoints", buildWaypointFeatures(props.start, props.finish, props.via))
  setGeoJsonSourceData(map, "switchback-avoid-areas", {
    type: "FeatureCollection",
    features: props.avoidAreas.map((area) => ({
      type: "Feature" as const,
      properties: { id: area.id, name: area.name ?? "Avoid area" },
      geometry: { type: "Polygon" as const, coordinates: [[...area.polygon, area.polygon[0]!]] }
    }))
  })
  setGeoJsonSourceData(map, "switchback-navigation", props.navigationFrame ? buildNavigationMapFeatures(props.navigationFrame) : emptyFeatureCollection())
}

export function updateReferenceMapSource(
  map: MapLibreMap,
  reference: ReferenceMap | null,
  renderer: PlannerMapRenderer
) {
  const sourceId = "switchback-reference-map"
  const layerId = "switchback-reference-map-layer"
  if (!reference) {
    if (map.getLayer(layerId)) map.removeLayer(layerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
    return
  }
  const corners = reference.coordinates as [[number, number], [number, number], [number, number], [number, number]]
  const source = map.getSource(sourceId) as { updateImage?(options: { url: string; coordinates: [number, number][] }): void } | undefined
  if (source?.updateImage) source.updateImage({ url: reference.url, coordinates: corners })
  else {
    map.addSource(sourceId, { type: "image", url: reference.url, coordinates: corners })
    renderer.addLayer(
      map,
      { id: layerId, type: "raster", source: sourceId, paint: { "raster-opacity": reference.opacity, "raster-fade-duration": 0 } },
      { slot: "bottom", beforeId: "switchback-route-shadow" }
    )
  }
  map.setPaintProperty(layerId, "raster-opacity", reference.opacity)
}
