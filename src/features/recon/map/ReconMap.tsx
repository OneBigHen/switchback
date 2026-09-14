"use client"

import { useEffect, useRef } from "react"
import * as maplibregl from "maplibre-gl"
import { addReconLayers, RECON_FIRST_ROUTE_LAYER } from "./recon-layers"
import { applyReconAtmosphere, RECON_BASEMAP_STYLE_URL, RECON_CAMERA, type ReconAtmosphere } from "./recon-map-style"
import { enhanceReconMapTerrain } from "./terrain"

/**
 * The one MapLibre host for every Recon surface. It creates the map, adds the
 * Recon layers, sky and terrain, then hands the loaded map to its parent once.
 * Parents drive data and camera imperatively; React never sees camera state.
 */

declare global {
  interface Window {
    __reconMapDebug?: { getPitch(): number; getBearing(): number; getZoom(): number; hasTerrain(): boolean }
  }
}

/**
 * MapLibre v6 resolves its worker from a separate module; the vendored copy
 * is published to /public by scripts/copy-maplibre-worker.mjs.
 */
const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs"
let workerConfigured = false

export interface ReconMapProps {
  atmosphere: ReconAtmosphere
  onReady(map: maplibregl.Map): void
  /** Called before the map is removed so parents can dispose map-bound objects. */
  onDispose?(): void
  className?: string
}

export default function ReconMap({ atmosphere, onReady, onDispose, className }: ReconMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const callbacks = useRef({ onReady, onDispose, atmosphere })

  useEffect(() => {
    callbacks.current = { onReady, onDispose, atmosphere }
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (!workerConfigured) {
      maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL)
      workerConfigured = true
    }
    const map = new maplibregl.Map({
      container,
      style: RECON_BASEMAP_STYLE_URL,
      center: RECON_CAMERA.center,
      zoom: RECON_CAMERA.zoom,
      pitch: RECON_CAMERA.pitch,
      bearing: RECON_CAMERA.bearing,
      maxPitch: RECON_CAMERA.maxPitch,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true }
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right")
    let terrain: { dispose(): void } | null = null

    const onLoad = () => {
      addReconLayers(map)
      applyReconAtmosphere(map, callbacks.current.atmosphere)
      terrain = enhanceReconMapTerrain(map, firstRoadLayerId(map) ?? RECON_FIRST_ROUTE_LAYER)
      window.__reconMapDebug = { getPitch: () => map.getPitch(), getBearing: () => map.getBearing(), getZoom: () => map.getZoom(), hasTerrain: () => map.getTerrain() !== null }
      callbacks.current.onReady(map)
    }
    map.once("load", onLoad)

    return () => {
      map.off("load", onLoad)
      callbacks.current.onDispose?.()
      terrain?.dispose()
      delete window.__reconMapDebug
      map.remove()
    }
  }, [])

  return <div ref={containerRef} className={className ?? "recon-map"} role="region" aria-label="Ride map" />
}

/** Hillshade sits under the basemap's roads and labels, not over them. */
function firstRoadLayerId(map: maplibregl.Map): string | null {
  const layers = map.getStyle().layers ?? []
  return layers.find((layer) => layer.type === "symbol" || /road|highway|tunnel|bridge|street/.test(layer.id))?.id ?? null
}
