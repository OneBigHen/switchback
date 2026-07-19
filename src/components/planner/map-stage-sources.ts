import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl"
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

export function riderRasterLayerId(id: RiderLayerId): string {
  return `switchback-${id}-raster`
}

function riderLayerColor(id: RiderLayerId): string {
  switch (id) {
    case "public-land":
    case "mvum":
    case "camping": return "#3D8B55"
    case "private-land":
    case "closures": return "#C84432"
    case "traffic":
    case "fuel":
    case "food": return "#E39D2D"
    case "weather":
    case "repair": return "#2B75BC"
    case "lodging":
    case "cell-coverage": return "#8657A9"
    default: return "#5E7885"
  }
}

export function addRiderMapLayers(map: MapLibreMap) {
  for (const definition of layerCatalog) {
    const runtime = mapLayerRuntime(definition.id)
    if (runtime?.kind !== "raster") continue
    map.addSource(`switchback-${definition.id}-raster-source`, {
      type: "raster",
      tiles: runtime.tiles,
      tileSize: 256,
      attribution: runtime.attribution,
      maxzoom: runtime.maxzoom
    })
    map.addLayer({
      id: riderRasterLayerId(definition.id),
      type: "raster",
      source: `switchback-${definition.id}-raster-source`,
      layout: { visibility: "none" },
      paint: { "raster-opacity": 1, "raster-fade-duration": 0 }
    }, "switchback-route-casing")
  }

  map.addSource(RIDER_FEATURE_SOURCE, { type: "geojson", data: emptyFeatureCollection() })
  for (const id of featureMapLayerIds) {
    const filter: ["==", string, string] = ["==", "layerId", id]
    const color = riderLayerColor(id)
    map.addLayer({
      id: riderFeatureLayerIds(id)[0], type: "fill", source: RIDER_FEATURE_SOURCE, filter,
      layout: { visibility: "none" },
      paint: { "fill-color": color, "fill-opacity": 0.16, "fill-outline-color": color }
    }, "switchback-route-casing")
    map.addLayer({
      id: riderFeatureLayerIds(id)[1], type: "line", source: RIDER_FEATURE_SOURCE, filter,
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color, "line-width": 2.5, "line-opacity": 0.8 }
    }, "switchback-route-casing")
    map.addLayer({
      id: riderFeatureLayerIds(id)[2], type: "circle", source: RIDER_FEATURE_SOURCE, filter,
      layout: { visibility: "none" },
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 7], "circle-color": color, "circle-stroke-color": "#101310", "circle-stroke-width": 1.5, "circle-opacity": 0.9 }
    }, "switchback-route-casing")
  }
}

export function updateRiderMapLayerPresentation(map: MapLibreMap, settings: readonly RiderLayerSetting[]) {
  const byId = new Map(settings.map((setting) => [setting.id, setting]))
  const sorted = [...settings].sort((first, second) => first.order - second.order)
  for (const definition of layerCatalog) {
    const setting = byId.get(definition.id)
    const runtime = mapLayerRuntime(definition.id)
    if (!setting || !runtime) continue
    const visibility = setting.visible ? "visible" : "none"
    if (runtime.kind === "raster") {
      const id = riderRasterLayerId(definition.id)
      map.setLayoutProperty(id, "visibility", visibility)
      map.setPaintProperty(id, "raster-opacity", setting.opacity)
    } else if (runtime.kind === "features") {
      for (const id of riderFeatureLayerIds(definition.id)) map.setLayoutProperty(id, "visibility", visibility)
      map.setPaintProperty(riderFeatureLayerIds(definition.id)[0], "fill-opacity", setting.opacity * 0.2)
      map.setPaintProperty(riderFeatureLayerIds(definition.id)[1], "line-opacity", setting.opacity)
      map.setPaintProperty(riderFeatureLayerIds(definition.id)[2], "circle-opacity", setting.opacity)
    }
  }
  for (const setting of sorted) {
    const runtime = mapLayerRuntime(setting.id)
    const ids = runtime?.kind === "raster" ? [riderRasterLayerId(setting.id)] : runtime?.kind === "features" ? riderFeatureLayerIds(setting.id) : []
    for (const id of ids) map.moveLayer(id, "switchback-route-casing")
  }
}

export function updatePlannerSources(map: MapLibreMap, props: PlannerMapSourceProps) {
  const visibleRoutes = props.rideMode ? props.routes.filter((route) => route.id === props.selectedRouteId) : props.routes
  const progressPercent = props.rideMode && props.navigationFrame ? props.navigationFrame.routePercent : undefined
  geoJsonSource(map, "switchback-routes")?.setData(buildRouteFeatures(visibleRoutes, props.selectedRouteId, progressPercent))
  geoJsonSource(map, "switchback-route-labels")?.setData(buildRouteLabelFeatures(props.rideMode ? visibleRoutes : props.routes, props.selectedRouteId))
  geoJsonSource(map, "switchback-waypoints")?.setData(buildWaypointFeatures(props.start, props.finish, props.via))
  geoJsonSource(map, "switchback-avoid-areas")?.setData({
    type: "FeatureCollection",
    features: props.avoidAreas.map((area) => ({
      type: "Feature" as const,
      properties: { id: area.id, name: area.name ?? "Avoid area" },
      geometry: { type: "Polygon" as const, coordinates: [[...area.polygon, area.polygon[0]!]] }
    }))
  })
  geoJsonSource(map, "switchback-navigation")?.setData(props.navigationFrame ? buildNavigationMapFeatures(props.navigationFrame) : emptyFeatureCollection())
}

export function updateReferenceMapSource(map: MapLibreMap, reference: ReferenceMap | null) {
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
    map.addLayer({ id: layerId, type: "raster", source: sourceId, paint: { "raster-opacity": reference.opacity, "raster-fade-duration": 0 } }, "switchback-route-casing")
  }
  map.setPaintProperty(layerId, "raster-opacity", reference.opacity)
}
