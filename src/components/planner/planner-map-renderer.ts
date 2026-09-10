import type { LayerSpecification, Map as MapLibreMap } from "maplibre-gl"
import { createFallbackStyleImage } from "@/lib/client/map-style"
import { mapStyleUrl } from "@/lib/client/map-layers"
import {
  mapboxRendererStatus,
  mapboxSlotFor,
  type SwitchbackMapSlot
} from "@/lib/client/mapbox-config"
import { mapboxBasemapConfig } from "@/lib/client/mapbox-style-capabilities"
import type { MapPresentation } from "@/lib/client/map-experience"
import { isCompactWorkspaceWidth } from "./workspace/workspace-mode"

/**
 * Migration shim. Mapbox GL JS v3 and MapLibre GL JS 5 expose the same runtime
 * surface for everything the planner stage uses (sources, layers, camera,
 * events, controls), but their type declarations are separate class
 * hierarchies. The stage and its helpers stay typed against one of them and
 * the Mapbox instance is cast at the single point where it is created. Phase
 * 11 deletes MapLibre and this alias becomes the Mapbox map.
 */
export type PlannerMap = MapLibreMap

/** The DEM source backing 3D terrain. One per map, added on style load. */
const TERRAIN_SOURCE = "mapbox-dem"

/**
 * Subtle horizon depth. Deliberately understated: atmosphere must never wash
 * out the contrast between the route and the road network beneath it.
 */
const ATMOSPHERE = {
  range: [1, 12],
  "horizon-blend": 0.08,
  color: "#E8EDF0",
  "high-color": "#B9CBD8",
  "space-color": "#0B0E0D",
  "star-intensity": 0
} as const

let plannerMapsCreated = 0

/**
 * Every Mapbox `Map` is a billable map load, and ordinary mode or lighting
 * switching must not create one (ADR 0015). The counter makes that assertable
 * instead of assumed.
 */
export function countPlannerMapCreated(): number {
  plannerMapsCreated += 1
  return plannerMapsCreated
}

export function plannerMapsCreatedCount(): number {
  return plannerMapsCreated
}

/**
 * The pre-premium OpenFreeMap styles, chosen by the same presentation the
 * premium renderer reads. Night stays a lighting choice for the rider even
 * though MapLibre can only express it as a different style.
 */
function maplibreStyleUrl(presentation: MapPresentation): string {
  if (presentation.lightPreset === "night") return mapStyleUrl("night")
  if (presentation.preset === "road") {
    return process.env.NEXT_PUBLIC_MAP_STYLE_URL || mapStyleUrl("clean")
  }
  return mapStyleUrl("explorer")
}

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
  experience: MapPresentation
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
   * Standard's lighting dims unlit custom layers at dusk and night, and
   * `*-emissive-strength` is how a layer opts out. It is a Standard concept,
   * so the fallback renderer simply has nothing to set.
   */
  supportsEmissiveStrength: boolean
  /**
   * Presentations that share a key share one map instance. Mapbox Standard
   * expresses mode and lighting as configuration, so ordinary switching costs
   * no additional map load.
   */
  styleKey(presentation: MapPresentation): string
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
  /** Applies the presentation profile to a live map. */
  applyExperience(map: PlannerMap, presentation: MapPresentation): void
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
 * MapLibre/Mapbox size their canvas once during construction. The planner shell
 * can change size afterwards without a window resize — checkpoint recovery,
 * mobile browser chrome, sheet detents and orientation all do this. When that
 * happens the canvas and its control corners otherwise keep the stale box,
 * which is why attribution could appear halfway up a freshly restored page.
 */
function keepMapSizedToContainer(map: PlannerMap, container: HTMLDivElement): void {
  if (typeof window === "undefined") return

  let frame: number | null = null
  const resize = () => {
    if (frame !== null) window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(() => {
      frame = null
      map.resize()
    })
  }

  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize)
  observer?.observe(container)
  window.visualViewport?.addEventListener("resize", resize)

  // Run once after controls and shell layout have both had a paint. This fixes
  // the hydration/recovery case even in browsers without ResizeObserver.
  resize()

  map.once("remove", () => {
    observer?.disconnect()
    window.visualViewport?.removeEventListener("resize", resize)
    if (frame !== null) window.cancelAnimationFrame(frame)
    frame = null
  })
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
    setMissingStyleImageResolver?(resolver: (id: string) => void): unknown
  }
  anyMap.addControl(
    new gl.AttributionControl({ compact: true }),
    isCompactWorkspaceWidth(window.innerWidth) ? "bottom-left" : "bottom-right"
  )
  // The style asks for `circle-N` icons no sprite ships; we generate them.
  // How the generated image gets back to the renderer differs, and the two
  // renderers share this function:
  //
  //   Mapbox GL JS v3 resolves it from a `styleimagemissing` listener.
  //   MapLibre GL JS v6 does not — a listener "cannot resolve the missing
  //   image for the current request", and the event now fires only after a
  //   resolver has already declined. `setMissingStyleImageResolver` is the
  //   supported hook, and MapLibre awaits it before giving up.
  //
  // Feature-detecting the resolver keeps one code path honest for both
  // instead of branching on renderer id: the map itself says what it accepts.
  const resolveMissingImage = (id: string) => {
    const image = createFallbackStyleImage(id)
    if (image && !anyMap.hasImage(id)) anyMap.addImage(id, image, { sdf: true })
  }
  if (typeof anyMap.setMissingStyleImageResolver === "function") {
    anyMap.setMissingStyleImageResolver(resolveMissingImage)
  } else {
    anyMap.on("styleimagemissing", (event) => resolveMissingImage(event.id))
  }
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
  keepMapSizedToContainer(map, options.container)
}

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs"

const maplibreWorkerConfigured = new WeakSet<object>()

/**
 * MapLibre v6 splits its worker into a separate `maplibre-gl-worker.mjs`
 * chunk, and upstream requires bundler consumers to make one `setWorkerUrl`
 * call so the worker is resolved rather than guessed at runtime.
 *
 * It has to be served from `public/`, not resolved through the bundler.
 * Turbopack honours `new URL(..., import.meta.url)` by emitting the worker
 * alone as a static asset, but the worker imports `./maplibre-gl-shared.mjs`
 * as a relative sibling, and that chunk is not emitted beside it — the import
 * 404s and the worker dies before it registers a single handler.
 * `scripts/copy-maplibre-worker.mjs` publishes both files together so the
 * relative import resolves.
 *
 * Without it the failure is silent and total: the map, its controls and any
 * main-thread layer still draw, so the map looks alive, but every GeoJSON
 * source is tiled in the worker — so the route, its casing, the waypoints and
 * the labels never appear. A rider on the fallback renderer would see an empty
 * basemap and no route at all.
 */
function configureMapLibreWorker(maplibre: typeof import("maplibre-gl")): void {
  // Keyed on the loaded module rather than a module-level flag: the call is
  // configuration of that specific MapLibre instance, and repeating it on every
  // map construction is wasted work.
  if (maplibreWorkerConfigured.has(maplibre)) return
  maplibreWorkerConfigured.add(maplibre)
  maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL)
}

export const maplibreRenderer: PlannerMapRenderer = {
  id: "maplibre",
  boldFont: ["Noto Sans Bold"],
  supportsDataDrivenDash: true,
  supportsEmissiveStrength: false,
  styleKey: (presentation) => `maplibre:${maplibreStyleUrl(presentation)}`,
  load: () => import("maplibre-gl"),
  create(module, options) {
    const maplibre = module as typeof import("maplibre-gl")
    configureMapLibreWorker(maplibre)
    const map = new maplibre.Map({
      container: options.container,
      style: maplibreStyleUrl(options.experience),
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
    // A MapLibre style carries its own presentation, so a change is a change
    // of style URL — which `styleKey` already turns into a new map.
  }
}

/**
 * Planning tilts to show relief. The camera only moves when the tilt actually
 * has to change: every camera move ends in a `moveend`, which is what drives
 * the viewport-scoped rider-layer fetches, so a needless move cancels requests
 * that were already in flight.
 */
function applyCameraDefaults(map: PlannerMap, presentation: MapPresentation): void {
  const target = presentation.camera.pitch
  if (presentation.surface === "ride") return
  if (Math.abs(map.getPitch() - target) < 1) return
  map.easeTo({ pitch: target, duration: presentation.transitionMillis })
}

export const mapboxRenderer: PlannerMapRenderer = {
  id: "mapbox",
  // Standard's glyph endpoint serves the Mapbox font stack, not Noto.
  boldFont: ["DIN Pro Bold", "Arial Unicode MS Bold"],
  supportsDataDrivenDash: false,
  supportsEmissiveStrength: true,
  // Mode and lighting are configuration on the style, so only Standard vs
  // Standard Satellite is a genuinely different style — and therefore the only
  // switch that costs another map load.
  styleKey: (presentation) => `mapbox:${presentation.style}`,
  async load() {
    const status = mapboxRendererStatus()
    if (!status.enabled) throw new Error(`mapbox renderer unavailable: ${status.reason}`)
    const mapboxgl = (await import("mapbox-gl")).default
    mapboxgl.accessToken = status.token
    return mapboxgl
  },
  create(module, options) {
    const mapboxgl = module as (typeof import("mapbox-gl"))["default"]
    const presentation = options.experience
    countPlannerMapCreated()
    const map = new mapboxgl.Map({
      container: options.container,
      style: presentation.style,
      center: options.center,
      zoom: options.zoom,
      minZoom: 4,
      maxZoom: 18,
      attributionControl: false,
      config: { basemap: mapboxBasemapConfig(presentation) }
    } as ConstructorParameters<(typeof import("mapbox-gl"))["default"]["Map"]>[0]) as unknown as PlannerMap
    addStandardControls(map, mapboxgl as unknown as GlControls, options)
    // Terrain needs its DEM source, and the source outlives style config
    // changes, so it is added once per map rather than per presentation change.
    map.on("style.load", () => {
      if (!map.getSource(TERRAIN_SOURCE)) {
        map.addSource(TERRAIN_SOURCE, {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14
        })
      }
      mapboxRenderer.applyExperience(map, presentation)
    })
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
  applyExperience(map, presentation) {
    const premium = map as unknown as {
      setConfigProperty(importId: string, name: string, value: unknown): void
      setTerrain(terrain: { source?: string; exaggeration: number } | null): void
      setFog(fog: Record<string, unknown> | null): void
      getSource(id: string): unknown
    }
    if (typeof premium.setConfigProperty !== "function") return
    for (const [name, value] of Object.entries(mapboxBasemapConfig(presentation))) {
      premium.setConfigProperty("basemap", name, value)
    }
    // Terrain and atmosphere are map-level, not style config. Both are removed
    // rather than flattened when the presentation does not want them.
    if (typeof premium.setTerrain === "function" && premium.getSource(TERRAIN_SOURCE)) {
      premium.setTerrain(
        presentation.terrain
          ? { source: TERRAIN_SOURCE, exaggeration: presentation.terrain.exaggeration }
          : null
      )
    }
    if (typeof premium.setFog === "function") {
      premium.setFog(presentation.atmosphere ? ATMOSPHERE : null)
    }
    applyCameraDefaults(map, presentation)
  }
}

export function plannerMapRenderer(premiumMapbox: boolean): PlannerMapRenderer {
  return premiumMapbox ? mapboxRenderer : maplibreRenderer
}
