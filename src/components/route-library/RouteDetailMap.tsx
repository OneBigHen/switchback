"use client"

import { useEffect, useRef, useState } from "react"
import { mapStyleUrl } from "@/lib/client/map-layers"
import { boundingBoxOf, padBoundingBox, type GeoBoundingBox } from "@/lib/routes/route-preview"
import type { Coordinate } from "@/lib/routing/types"
import styles from "./RouteDetailMap.module.css"

const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs"
const ROUTE_SOURCE = "detail-route"
const MARKER_SOURCE = "detail-markers"
/** How long the basemap style may take before the hero says it is unavailable. */
const MAP_LOAD_TIMEOUT_MS = 15_000

interface MinimalMap {
  addSource(id: string, source: Record<string, unknown>): void
  addLayer(spec: Record<string, unknown>): void
  once(event: string, handler: () => void): void
  fitBounds(bounds: [[number, number], [number, number]], options: Record<string, unknown>): void
  remove(): void
  addControl(control: unknown, position?: string): void
}

export interface RouteDetailMapProps {
  /** The route's own imported line, in `[longitude, latitude]` degrees. */
  geometry: ReadonlyArray<Coordinate>
  bbox?: GeoBoundingBox | null
  routeName: string
  /** Where this line came from, stated on the map itself. */
  provenanceNote?: string | null
}

/**
 * The route-detail hero.
 *
 * This replaces the dark-grid poster that used to open route detail. A poster
 * is a nice object; it is not an answer to "where does this ride go, and do I
 * want to ride it?" — which is the only question this screen exists for. The
 * map is interactive because route detail is a place a rider actually reads
 * geography, not a thumbnail.
 */
export function RouteDetailMap({ geometry, bbox, routeName, provenanceNote }: RouteDetailMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading")
  const frame = bbox ?? boundingBoxOf(geometry)
  const usable = geometry.length >= 2 && frame !== null

  // An unplaceable route is not a map failure; it is derived state, so it is
  // read at render rather than pushed through an effect.
  const effectiveStatus = usable ? status : "unavailable"

  useEffect(() => {
    if (!usable) return
    let disposed = false
    // Held here, not returned from the async body: a cleanup returned from
    // inside the promise was discarded, so every visit left a live map and its
    // WebGL context behind — browsers cap those at about sixteen and start
    // dropping the oldest, including the shared card-preview renderer's.
    let map: MinimalMap | null = null
    let loadTimeout: number | undefined
    const container = containerRef.current
    if (!container) return

    void (async () => {
      try {
        const maplibre = await import("maplibre-gl")
        maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL)
        if (disposed) return
        const [west, south, east, north] = padBoundingBox(frame!, 0.16)
        const created = new maplibre.Map({
          container,
          style: mapStyleUrl("clean"),
          bounds: [[west, south], [east, north]],
          fitBoundsOptions: { padding: 28 },
          minZoom: 3,
          maxZoom: 17,
          attributionControl: false
        }) as unknown as MinimalMap
        map = created
        const route = created
        let loaded = false
        // A style that never loads left an empty box with no message.
        loadTimeout = window.setTimeout(() => {
          if (!disposed && !loaded) setStatus("unavailable")
        }, MAP_LOAD_TIMEOUT_MS)

        route.once("load", () => {
          loaded = true
          window.clearTimeout(loadTimeout)
          if (disposed) return
          const map = route
          map.addSource(ROUTE_SOURCE, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: geometry }
            }
          })
          map.addSource(MARKER_SOURCE, {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [
                { type: "Feature", properties: { role: "start" }, geometry: { type: "Point", coordinates: geometry[0] } },
                { type: "Feature", properties: { role: "end" }, geometry: { type: "Point", coordinates: geometry[geometry.length - 1] } }
              ]
            }
          })
          map.addLayer({
            id: "detail-route-casing",
            type: "line",
            source: ROUTE_SOURCE,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#FFFDFC", "line-width": 9, "line-opacity": 0.9 }
          })
          map.addLayer({
            id: "detail-route-line",
            type: "line",
            source: ROUTE_SOURCE,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#C94A2A", "line-width": 4.5 }
          })
          map.addLayer({
            id: "detail-markers",
            type: "circle",
            source: MARKER_SOURCE,
            paint: {
              "circle-radius": 6.5,
              "circle-color": ["match", ["get", "role"], "start", "#173C38", "#C94A2A"],
              "circle-stroke-color": "#FFFDFC",
              "circle-stroke-width": 2.5
            }
          })
          try {
            map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right")
          } catch {
            // A missing control is cosmetic; the map itself still reads.
          }
          setStatus("ready")
        })
      } catch {
        if (!disposed) setStatus("unavailable")
      }
    })()

    return () => {
      disposed = true
      window.clearTimeout(loadTimeout)
      map?.remove()
      map = null
    }
    // The route is fixed for this page; geometry identity changes only on a
    // different route, which remounts the page anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usable])

  if (!usable) {
    return (
      <div className={styles.hero} data-detail-map={effectiveStatus}>
        <div className={styles.missing} role="note">
          <strong>No geography was kept for this import</strong>
          <span>This entry has no route line to place on a map.</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.hero} data-detail-map={effectiveStatus}>
      <div ref={containerRef} className={styles.canvas} aria-hidden="true" />
      <p className={styles.summary} role="img" aria-label={`Map of ${routeName} drawn from its own imported line`} />
      {provenanceNote ? <p className={styles.provenance}>{provenanceNote}</p> : null}
      <p className={styles.attribution}>
        <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>
        {" · "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
      </p>
      {effectiveStatus === "unavailable" ? (
        <div className={styles.missing} role="note">
          <strong>Map unavailable here</strong>
          <span>The route details below still describe the whole ride.</span>
        </div>
      ) : null}
    </div>
  )
}
