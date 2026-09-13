"use client"

import { CrosshairSimple, NavigationArrow } from "@phosphor-icons/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { mapStyleUrl } from "@/lib/client/map-layers"
import type { AtlasBrowseRoute } from "@/app/gpx-library/atlas-browse"
import { padBoundingBox, type GeoBoundingBox } from "@/lib/routes/route-preview"
import { browseRouteGeography } from "./route-preview-source"
import styles from "./RouteLibraryMap.module.css"

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs"
const ROUTES_SOURCE = "discovery-routes"
const ROUTES_CASING = "discovery-routes-casing"
const ROUTES_LINE = "discovery-routes-line"
const SELECTED_LINE = "discovery-selected-line"
const ENDPOINTS_SOURCE = "discovery-endpoints"
const ENDPOINTS_LAYER = "discovery-endpoints-layer"

/** Overlay resolution: enough to read a road's shape, not a survey trace. */
const OVERLAY_POINTS = 72

interface MinimalMap {
  addSource(id: string, source: Record<string, unknown>): void
  addLayer(spec: Record<string, unknown>): void
  getSource(id: string): { setData(data: unknown): void } | undefined
  getLayer(id: string): unknown
  on(event: string, layerOrHandler: unknown, handler?: unknown): void
  once(event: string, handler: () => void): void
  remove(): void
  resize(): void
  fitBounds(bounds: [[number, number], [number, number]], options: Record<string, unknown>): void
  easeTo(options: Record<string, unknown>): void
  getCanvas(): HTMLCanvasElement
  setPaintProperty(layer: string, property: string, value: unknown): void
}

export interface RouteLibraryMapProps {
  routes: readonly AtlasBrowseRoute[]
  selectedId: string | null
  /** Increments only when the camera is allowed to move to the selection. */
  fitToken: number
  riderMovedMap: boolean
  onSelect(routeId: string): void
  onRiderMovedMap(): void
  onRecenter(): void
  onLocate?(): void
  locating?: boolean
}

/**
 * The Explore / GPX Library discovery map.
 *
 * One interactive map instance for the surface — this is a primary map
 * workspace, unlike the route cards, which share a single off-screen renderer.
 * Route lines come from the same browse rows the cards render, recovered into
 * real geography, so map and list can never disagree about which routes exist.
 */
export function RouteLibraryMap({
  routes,
  selectedId,
  fitToken,
  riderMovedMap,
  onSelect,
  onRiderMovedMap,
  onRecenter,
  onLocate,
  locating = false
}: RouteLibraryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MinimalMap | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading")
  // The map is created once and lives outside React, so its handlers read the
  // latest callbacks through refs rather than forcing a map rebuild whenever a
  // parent re-renders.
  const selectRef = useRef(onSelect)
  const movedRef = useRef(onRiderMovedMap)
  useEffect(() => {
    selectRef.current = onSelect
    movedRef.current = onRiderMovedMap
  }, [onRiderMovedMap, onSelect])

  const features = useMemo(() => routes.map((route) => {
    const geography = browseRouteGeography(route, OVERLAY_POINTS)
    return { route, geography }
  }).filter((entry) => entry.geography.geometry.length >= 2), [routes])

  const collectionBounds = useMemo<GeoBoundingBox | null>(() => {
    let west = Infinity
    let south = Infinity
    let east = -Infinity
    let north = -Infinity
    for (const { route } of features) {
      if (!route.bbox) continue
      west = Math.min(west, route.bbox[0])
      south = Math.min(south, route.bbox[1])
      east = Math.max(east, route.bbox[2])
      north = Math.max(north, route.bbox[3])
    }
    return Number.isFinite(west) && Number.isFinite(north) ? [west, south, east, north] : null
  }, [features])

  useEffect(() => {
    let disposed = false
    const container = containerRef.current
    if (!container) return

    void (async () => {
      try {
        const maplibre = await import("maplibre-gl")
        maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL)
        if (disposed) return
        const map = new maplibre.Map({
          container,
          style: mapStyleUrl("clean"),
          center: [-77.5, 40.9],
          zoom: 6,
          minZoom: 3,
          maxZoom: 16,
          attributionControl: false
        }) as unknown as MinimalMap

        map.once("load", () => {
          if (disposed) return
          installLayers(map)
          setStatus("ready")
        })

        // A rider who has moved the map owns it until they say otherwise. Only
        // a gesture counts: programmatic `fitBounds` fires the same events, so
        // the originalEvent check is what separates "the rider moved it" from
        // "we moved it".
        const claimCamera = (event: { originalEvent?: unknown }) => {
          if (event?.originalEvent) movedRef.current()
        }
        map.on("dragstart", claimCamera)
        map.on("zoomstart", claimCamera)
        map.on("rotatestart", claimCamera)

        map.on("click", ROUTES_LINE, (event: { features?: Array<{ properties?: { id?: string } }> }) => {
          const id = event.features?.[0]?.properties?.id
          if (typeof id === "string") selectRef.current(id)
        })
        map.on("mouseenter", ROUTES_LINE, () => {
          map.getCanvas().style.cursor = "pointer"
        })
        map.on("mouseleave", ROUTES_LINE, () => {
          map.getCanvas().style.cursor = ""
        })

        mapRef.current = map
      } catch {
        if (!disposed) setStatus("unavailable")
      }
    })()

    return () => {
      disposed = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Route overlays follow the shared query result.
  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== "ready") return
    map.getSource(ROUTES_SOURCE)?.setData({
      type: "FeatureCollection",
      features: features.map(({ route, geography }) => ({
        type: "Feature",
        properties: { id: route.id, selected: route.id === selectedId ? 1 : 0 },
        geometry: { type: "LineString", coordinates: geography.geometry }
      }))
    })
    const selected = features.find(({ route }) => route.id === selectedId)
    map.getSource(ENDPOINTS_SOURCE)?.setData({
      type: "FeatureCollection",
      features: selected
        ? [
            ...selected.geography.start ? [{ type: "Feature", properties: { role: "start" }, geometry: { type: "Point", coordinates: selected.geography.start } }] : [],
            ...selected.geography.end ? [{ type: "Feature", properties: { role: "end" }, geometry: { type: "Point", coordinates: selected.geography.end } }] : []
          ]
        : []
    })
  }, [features, selectedId, status])

  // Camera. `fitToken` changes only on an explicit selection or recenter, so
  // an incidental re-render or a filter recount can never take the map back
  // from a rider who is exploring it.
  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== "ready" || riderMovedMap) return
    const selected = features.find(({ route }) => route.id === selectedId)
    const target = selected?.route.bbox ?? collectionBounds
    if (!target) return
    const [west, south, east, north] = padBoundingBox(target, selected ? 0.18 : 0.08)
    map.fitBounds([[west, south], [east, north]], {
      padding: { top: 44, right: 28, bottom: 36, left: 28 },
      duration: prefersReducedMotion() ? 0 : 520,
      maxZoom: 13
    })
    // `features`/`collectionBounds` intentionally do not re-run the camera:
    // only an explicit selection change (a new fitToken) may move it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken, status])

  const selectedRoute = routes.find((route) => route.id === selectedId) ?? null

  return (
    <div className={styles.stage} data-map-status={status}>
      <div ref={containerRef} className={styles.canvas} aria-hidden="true" />

      {/* The canvas is not an accessible surface. This is: it states what the
          map is showing and what is selected, and updates politely so map
          movement does not flood a screen reader. */}
      <p className={styles.mapSummary} role="status" aria-live="polite">
        {status === "unavailable"
          ? "The discovery map could not start on this device. Use the route list instead."
          : selectedRoute
            ? `Map showing ${routes.length} ${routes.length === 1 ? "route" : "routes"}. ${selectedRoute.title} is selected.`
            : `Map showing ${routes.length} ${routes.length === 1 ? "route" : "routes"}. No route selected.`}
      </p>

      <div className={styles.controls}>
        {onLocate ? (
          <button
            type="button"
            className={styles.control}
            aria-label="Centre the map on my location"
            disabled={locating}
            onClick={onLocate}
          >
            <NavigationArrow weight="fill" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className={styles.control}
          aria-label={selectedRoute ? `Recentre on ${selectedRoute.title}` : "Recentre on these routes"}
          onClick={onRecenter}
        >
          <CrosshairSimple weight="bold" aria-hidden="true" />
        </button>
      </div>

      <p className={styles.attribution}>
        <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>
        {" · "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
      </p>

      {status === "unavailable" ? (
        <div className={styles.fallback} role="note">
          <strong>Map unavailable here</strong>
          <span>Switch to List to browse the same routes.</span>
        </div>
      ) : null}
    </div>
  )
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
}

function installLayers(map: MinimalMap): void {
  if (map.getLayer(ROUTES_LINE)) return
  map.addSource(ROUTES_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } })
  map.addSource(ENDPOINTS_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } })

  // Unselected routes stay legible but quiet in forest/gray-green; the
  // selected route is terracotta and heavier, so the rider's current choice
  // is the only thing competing with the basemap.
  map.addLayer({
    id: ROUTES_CASING,
    type: "line",
    source: ROUTES_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#FFFDFC",
      "line-width": ["case", ["==", ["get", "selected"], 1], 9, 5],
      "line-opacity": 0.85
    }
  })
  map.addLayer({
    id: ROUTES_LINE,
    type: "line",
    source: ROUTES_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["case", ["==", ["get", "selected"], 1], "#C94A2A", "#68736F"],
      "line-width": ["case", ["==", ["get", "selected"], 1], 5, 2.4],
      "line-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.55]
    }
  })
  map.addLayer({
    id: SELECTED_LINE,
    type: "line",
    source: ROUTES_SOURCE,
    filter: ["==", ["get", "selected"], 1],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#C94A2A", "line-width": 5 }
  })
  map.addLayer({
    id: ENDPOINTS_LAYER,
    type: "circle",
    source: ENDPOINTS_SOURCE,
    paint: {
      "circle-radius": 6,
      "circle-color": ["match", ["get", "role"], "start", "#173C38", "#C94A2A"],
      "circle-stroke-color": "#FFFDFC",
      "circle-stroke-width": 2.5
    }
  })
}
