import type { LayerSpecification, Map as MapLibreMap } from "maplibre-gl"
import { createFallbackStyleImage } from "@/lib/client/map-style"
import { mapStyleUrl, type MapStyleId } from "@/lib/client/map-layers"
import {
  mapboxRendererStatus,
  mapboxSlotFor,
  standardConfigProperties,
  type SwitchbackMapSlot
} from "@/lib/client/mapbox-config"
import {
  lightPresetForMapStyle,
  resolveMapExperience,
  visualModeForMapStyle
} from "@/lib/client/map-experience"

/**
 * Migration shim. Mapbox GL JS v3 and MapLibre GL JS 5 expose the same runtime
 * surface for everything the planner stage uses (sources, layers, camera,
 * events, controls), but their type declarations are separate class
 * hierarchies. The stage and its helpers stay typed against one of them and
 * the Mapbox instance is cast at the single point where it is created. Phase
 * 11 deletes MapLibre and this alias becomes the Mapbox map.
 */
export type PlannerMap = MapLibreMap

export interface StageLayerPlacement {
  slot: SwitchbackMapSlot
  /**
   * Ordering relative to another *Switchback* layer, used by the renderer
   * that has no slots. Never a basemap-internal layer id.
   */
  beforeId?: string
}

/**
 * The loaded renderer module. Loading and construction are separate so the
 * stage can abandon a mount that was unmounted while the dynamic import was
 * still in flight — constructing a map only to remove it aborts its own style
 * request, which surfaces as a failed network request in the mobile QA gate.
 */
export type PlannerMapModule = unknown

export interface CreatePlannerMapOptions {
  container: HTMLDivElement
  mapStyle: MapStyleId
  center: [number, number]
  zoom: number
  onLocateMe(point: { lat: number; lon: number }): void
}

export interface PlannerMapRenderer {
  id: "maplibre" | "mapbox"
  /** Font stack available to custom symbol layers in this renderer's glyphs. */
  boldFont: string[]
  /** Mapbox does not support data-driven `line-dasharray`; MapLibre does. */
  supportsDataDrivenDash: boolean
  /**
   * Styles that share a key share one map instance. Mapbox Standard expresses
   * day/night as configuration, so switching does not cost another map load.
   */
  styleKey(mapStyle: MapStyleId): string
  /** Loads the renderer bundle. Safe to abandon: nothing is constructed yet. */
  load(): Promise<PlannerMapModule>
  /** Constructs the map. Only call this once the mount is known to be live. */
  create(module: PlannerMapModule, options: CreatePlannerMapOptions): PlannerMap
  addLayer(map: PlannerMap, spec: LayerSpecification, placement: StageLayerPlacement): void
  /**
   * Reorders one Switchback layer. `beforeId` is only honoured by renderers
   * without slots; a slotted renderer moves the layer to the top of its slot,
   * because a cross-slot `beforeId` is rejected.
   */
  moveLayer(map: PlannerMap, layerId: string, beforeId: string): void
  /** Applies the presentation profile for the current style and surface. */
  applyExperience(map: PlannerMap, mapStyle: MapStyleId, surface: "planning" | "ride"): void
}

interface GlControls {
  AttributionControl: new (options: { compact: boolean }) => object
  NavigationControl: new (options: { showCompass: boolean }) => object
  GeolocateControl: new (options: Record<string, unknown>) => {
    on(event: "geolocate", handler: (position: { coords: { latitude: number; longitude: number } }) => void): void
  }
  ScaleControl: new (options: { maxWidth: number; unit: "imperial" }) => object
}

/**
 * Both renderers ship the same control set with the same constructor options,
 * so control wiring is shared instead of duplicated per renderer.
 */
function addStandardControls(map: PlannerMap, gl: GlControls, options: CreatePlannerMapOptions) {
  const anyMap = map as unknown as {
    addControl(control: object, position: string): void
    on(event: string, handler: (event: { id: string }) => void): void
    hasImage(id: string): boolean
    addImage(id: string, image: unknown, options: { sdf: boolean }): void
  }
  anyMap.addControl(
    new gl.AttributionControl({ compact: true }),
    window.innerWidth <= 760 ? "bottom-left" : "bottom-right"
  )
  anyMap.on("styleimagemissing", (event) => {
    const image = createFallbackStyleImage(event.id)
    if (image && !anyMap.hasImage(event.id)) anyMap.addImage(event.id, image, { sdf: true })
  })
  anyMap.addControl(new gl.NavigationControl({ showCompass: false }), "bottom-right")
  // The GeolocateControl is a dead button on insecure contexts (LAN http),
  // where browsers hide navigator.geolocation entirely — only offer it when
  // the browser can actually produce a fix.
  if ("geolocation" in navigator) {
    const geolocate = new gl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      fitBoundsOptions: { maxZoom: 16 }
    })
    // Adopt the browser fix as the planner start instead of leaving the
    // control as a map-view-only button.
    geolocate.on("geolocate", (position) => {
      const { latitude, longitude } = position.coords
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        options.onLocateMe({ lat: latitude, lon: longitude })
      }
    })
    anyMap.addControl(geolocate, "bottom-right")
  }
  anyMap.addControl(new gl.ScaleControl({ maxWidth: 110, unit: "imperial" }), "bottom-left")
}

export const maplibreRenderer: PlannerMapRenderer = {
  id: "maplibre",
  boldFont: ["Noto Sans Bold"],
  supportsDataDrivenDash: true,
  styleKey: (mapStyle) => `maplibre:${mapStyle}`,
  load: () => import("maplibre-gl"),
  create(module, options) {
    const maplibre = module as typeof import("maplibre-gl")
    const map = new maplibre.Map({
      container: options.container,
      style: options.mapStyle === "clean" && process.env.NEXT_PUBLIC_MAP_STYLE_URL
        ? process.env.NEXT_PUBLIC_MAP_STYLE_URL
        : mapStyleUrl(options.mapStyle),
      center: options.center,
      zoom: options.zoom,
      minZoom: 4,
      maxZoom: 18,
      attributionControl: false
    })
    addStandardControls(map, maplibre as unknown as GlControls, options)
    return map
  },
  addLayer(map, spec, placement) {
    map.addLayer(spec, placement.beforeId)
  },
  moveLayer(map, layerId, beforeId) {
    map.moveLayer(layerId, beforeId)
  },
  applyExperience() {
    // MapLibre styles carry their own presentation; nothing to configure.
  }
}

export const mapboxRenderer: PlannerMapRenderer = {
  id: "mapbox",
  // Standard's glyph endpoint serves the Mapbox font stack, not Noto.
  boldFont: ["DIN Pro Bold", "Arial Unicode MS Bold"],
  supportsDataDrivenDash: false,
  styleKey(mapStyle) {
    const experience = resolveMapExperience({
      mode: visualModeForMapStyle(mapStyle),
      surface: "planning",
      lightPreset: "day"
    })
    // Day/night is configuration on the same Standard style, so only a real
    // style change recreates the map.
    return `mapbox:${experience.style}`
  },
  async load() {
    const status = mapboxRendererStatus()
    if (!status.enabled) throw new Error(`mapbox renderer unavailable: ${status.reason}`)
    const mapboxgl = (await import("mapbox-gl")).default
    mapboxgl.accessToken = status.token
    return mapboxgl
  },
  create(module, options) {
    const mapboxgl = module as (typeof import("mapbox-gl"))["default"]
    const experience = resolveMapExperience({
      mode: visualModeForMapStyle(options.mapStyle),
      surface: "planning",
      lightPreset: lightPresetForMapStyle(options.mapStyle, undefined)
    })
    const map = new mapboxgl.Map({
      container: options.container,
      style: experience.style,
      center: options.center,
      zoom: options.zoom,
      minZoom: 4,
      maxZoom: 18,
      attributionControl: false,
      config: { basemap: standardConfigProperties(experience) }
    } as ConstructorParameters<(typeof import("mapbox-gl"))["default"]["Map"]>[0]) as unknown as PlannerMap
    addStandardControls(map, mapboxgl as unknown as GlControls, options)
    return map
  },
  addLayer(map, spec, placement) {
    const slot = mapboxSlotFor(placement.slot)
    // Standard places custom layers by slot. A `beforeId` that belongs to a
    // different slot is rejected, and basemap layer ids are not a stable
    // contract, so slot placement replaces relative ordering entirely.
    map.addLayer(slot ? { ...spec, slot } as unknown as LayerSpecification : spec)
  },
  moveLayer(map, layerId) {
    map.moveLayer(layerId)
  },
  applyExperience(map, mapStyle, surface) {
    const experience = resolveMapExperience({
      mode: visualModeForMapStyle(mapStyle),
      surface,
      lightPreset: lightPresetForMapStyle(mapStyle, undefined)
    })
    const configurable = map as unknown as {
      setConfigProperty(importId: string, name: string, value: unknown): void
    }
    if (typeof configurable.setConfigProperty !== "function") return
    for (const [name, value] of Object.entries(standardConfigProperties(experience))) {
      configurable.setConfigProperty("basemap", name, value)
    }
  }
}

export function plannerMapRenderer(premiumMapbox: boolean): PlannerMapRenderer {
  return premiumMapbox ? mapboxRenderer : maplibreRenderer
}
