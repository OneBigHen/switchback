"use client"

/**
 * One geographic preview renderer for the whole route catalog.
 *
 * The constraint that shapes this file: a library of 157 routes must not mount
 * 157 WebGL maps. So exactly **one** hidden MapLibre instance exists for the
 * whole application; it renders one preview at a time, hands back an image,
 * and the cards display plain `<img>` elements that cost nothing to scroll.
 *
 * The cache key is the contract the plan asked for —
 * `routeId + geometry fingerprint + padded bbox + style version + size` — so
 * the same route at the same size is rendered once per session no matter how
 * many times it scrolls past, and a selection highlight (a paint-time concern)
 * never invalidates it.
 *
 * If WebGL is unavailable the renderer says so once and every caller gets
 * `null`, which the thumbnail turns into an honest unavailable state rather
 * than a silhouette pretending to be a map.
 */

import { mapStyleUrl } from "@/lib/client/map-layers"
import type { RoutePreviewSpec } from "@/lib/routes/route-preview"
import type { Coordinate } from "@/lib/routing/types"

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs"

/**
 * Previews use the fuller basemap rather than the minimal one. A card has one
 * job — say where the ride is — and at browse zoom the minimal style renders
 * rural ground as an almost empty field, which answers nothing. The interactive
 * workspaces keep the quieter style, where the rider can zoom for themselves.
 */
const PREVIEW_STYLE = "explorer" as const
const ROUTE_SOURCE = "preview-route"
const ROUTE_CASING_LAYER = "preview-route-casing"
const ROUTE_LINE_LAYER = "preview-route-line"
const MARKER_SOURCE = "preview-markers"
const MARKER_LAYER = "preview-markers-layer"

/** Beyond this a preview is abandoned so one slow tile cannot stall the queue. */
const RENDER_TIMEOUT_MS = 9_000
/** Roughly two screens of large cards; older entries are cheap to redraw. */
const CACHE_LIMIT = 140

export interface RoutePreviewRequest {
  readonly spec: RoutePreviewSpec
  readonly geometry: ReadonlyArray<Coordinate>
  readonly start: Coordinate | null
  readonly end: Coordinate | null
}

type RendererState = "idle" | "ready" | "unavailable"

interface QueueEntry {
  readonly request: RoutePreviewRequest
  readonly resolve: (value: string | null) => void
}

const cache = new Map<string, string>()
const inFlight = new Map<string, Promise<string | null>>()
const queue: QueueEntry[] = []

let state: RendererState = "idle"
let container: HTMLDivElement | null = null
let mapPromise: Promise<MapHandle | null> | null = null
let draining = false

interface MapHandle {
  // Structural rather than nominal: this module must not import maplibre-gl's
  // types eagerly, and the preview map uses a deliberately tiny surface of it.
  readonly map: {
    resize(): void
    fitBounds(bounds: [[number, number], [number, number]], options: Record<string, unknown>): void
    getSource(id: string): { setData(data: unknown): void } | undefined
    addSource(id: string, source: Record<string, unknown>): void
    addLayer(spec: Record<string, unknown>): void
    getLayer(id: string): unknown
    once(event: string, handler: () => void): void
    off(event: string, handler: () => void): void
    on(event: string, handler: () => void): void
    loaded(): boolean
    getCanvas(): HTMLCanvasElement
    triggerRepaint(): void
  }
}

function previewContainer(size: { width: number; height: number }): HTMLDivElement {
  if (!container) {
    container = document.createElement("div")
    container.setAttribute("data-route-preview-renderer", "true")
    container.setAttribute("aria-hidden", "true")
    // Off-screen but still composited: `display:none` or `visibility:hidden`
    // would stop WebGL producing frames at all.
    container.style.position = "fixed"
    container.style.top = "0"
    container.style.left = "0"
    container.style.opacity = "0"
    container.style.pointerEvents = "none"
    container.style.zIndex = "-1"
    document.body.appendChild(container)
  }
  container.style.width = `${size.width}px`
  container.style.height = `${size.height}px`
  return container
}

async function createMap(spec: RoutePreviewSpec): Promise<MapHandle | null> {
  try {
    const maplibre = await import("maplibre-gl")
    maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL)
    const map = new maplibre.Map({
      container: previewContainer(spec),
      style: mapStyleUrl(PREVIEW_STYLE),
      center: [(spec.bbox[0] + spec.bbox[2]) / 2, (spec.bbox[1] + spec.bbox[3]) / 2],
      zoom: 6,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      // Required for `toDataURL`: without it the drawing buffer is cleared
      // before a capture can read it.
      preserveDrawingBuffer: true,
      pixelRatio: spec.pixelRatio
    } as ConstructorParameters<typeof maplibre.Map>[0])
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("style load timed out")), RENDER_TIMEOUT_MS)
      map.once("load", () => {
        window.clearTimeout(timer)
        resolve()
      })
      map.once("error", () => {
        window.clearTimeout(timer)
        reject(new Error("map style failed"))
      })
    })
    state = "ready"
    return { map: map as unknown as MapHandle["map"] }
  } catch {
    // No WebGL, blocked tiles, or a style that will not load. Say so once.
    state = "unavailable"
    return null
  }
}

function ensureLayers(handle: MapHandle): void {
  const { map } = handle
  if (map.getLayer(ROUTE_LINE_LAYER)) return
  map.addSource(ROUTE_SOURCE, { type: "geojson", data: emptyCollection() })
  map.addSource(MARKER_SOURCE, { type: "geojson", data: emptyCollection() })
  map.addLayer({
    id: ROUTE_CASING_LAYER,
    type: "line",
    source: ROUTE_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#FFFDFC", "line-width": 6, "line-opacity": 0.9 }
  })
  map.addLayer({
    id: ROUTE_LINE_LAYER,
    type: "line",
    source: ROUTE_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    // Terracotta: the route is the subject, the basemap is context.
    paint: { "line-color": "#C94A2A", "line-width": 3.2 }
  })
  map.addLayer({
    id: MARKER_LAYER,
    type: "circle",
    source: MARKER_SOURCE,
    paint: {
      "circle-radius": 4.5,
      "circle-color": ["match", ["get", "role"], "start", "#173C38", "#C94A2A"],
      "circle-stroke-color": "#FFFDFC",
      "circle-stroke-width": 2
    }
  })
}

function emptyCollection() {
  return { type: "FeatureCollection", features: [] }
}

function setData(handle: MapHandle, request: RoutePreviewRequest): void {
  const route = handle.map.getSource(ROUTE_SOURCE)
  route?.setData({
    type: "FeatureCollection",
    features: request.geometry.length >= 2
      ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: request.geometry } }]
      : []
  })
  const markers = handle.map.getSource(MARKER_SOURCE)
  markers?.setData({
    type: "FeatureCollection",
    features: [
      ...request.start ? [{ type: "Feature", properties: { role: "start" }, geometry: { type: "Point", coordinates: request.start } }] : [],
      ...request.end ? [{ type: "Feature", properties: { role: "end" }, geometry: { type: "Point", coordinates: request.end } }] : []
    ]
  })
}

function waitForIdle(handle: MapHandle): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      handle.map.off("idle", done)
      resolve()
    }
    const timer = window.setTimeout(done, RENDER_TIMEOUT_MS)
    handle.map.on("idle", done)
    handle.map.triggerRepaint()
  })
}

async function renderOne(request: RoutePreviewRequest): Promise<string | null> {
  if (state === "unavailable") return null
  mapPromise ??= createMap(request.spec)
  const handle = await mapPromise
  if (!handle) return null

  try {
    previewContainer(request.spec)
    handle.map.resize()
    ensureLayers(handle)
    setData(handle, request)
    handle.map.fitBounds(
      [[request.spec.bbox[0], request.spec.bbox[1]], [request.spec.bbox[2], request.spec.bbox[3]]],
      { padding: 12, duration: 0, animate: false }
    )
    await waitForIdle(handle)
    return handle.map.getCanvas().toDataURL("image/webp", 0.82)
  } catch {
    return null
  }
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (queue.length > 0) {
      const entry = queue.shift()!
      const cached = cache.get(entry.request.spec.key)
      if (cached) {
        entry.resolve(cached)
        continue
      }
      const image = await renderOne(entry.request)
      if (image) remember(entry.request.spec.key, image)
      entry.resolve(image)
      if (state === "unavailable") {
        // Nothing later in the queue can succeed either.
        while (queue.length > 0) queue.shift()!.resolve(null)
      }
    }
  } finally {
    draining = false
  }
}

function remember(key: string, image: string): void {
  cache.set(key, image)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/**
 * Ask for one preview. Repeat requests for the same key share one render, and
 * a key already rendered this session resolves immediately from memory.
 */
export function requestRoutePreview(request: RoutePreviewRequest): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null)
  const cached = cache.get(request.spec.key)
  if (cached) return Promise.resolve(cached)
  if (state === "unavailable") return Promise.resolve(null)
  const pending = inFlight.get(request.spec.key)
  if (pending) return pending

  const promise = new Promise<string | null>((resolve) => {
    queue.push({ request, resolve })
    void drain()
  }).finally(() => inFlight.delete(request.spec.key))
  inFlight.set(request.spec.key, promise)
  return promise
}

export function cachedRoutePreview(key: string): string | null {
  return cache.get(key) ?? null
}

export function routePreviewRendererState(): RendererState {
  return state
}

/** Test seam: drop every cached image and the shared map. */
export function resetRoutePreviewRenderer(): void {
  cache.clear()
  inFlight.clear()
  queue.length = 0
  mapPromise = null
  state = "idle"
  container?.remove()
  container = null
}
