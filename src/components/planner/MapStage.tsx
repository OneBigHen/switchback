"use client"

import type { FeatureCollection } from "geojson"
import type { GeolocateControl, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl"
import { useEffect, useRef, useState } from "react"
import {
  buildRouteFeatures,
  buildWaypointFeatures,
  emptyFeatureCollection
} from "@/lib/client/map-data"
import { createFallbackStyleImage } from "@/lib/client/map-style"
import type { PlannedRoute, Waypoint } from "@/lib/routing/types"
import type { PlannerPointId } from "@/stores/planner-store"

interface MapStageProps {
  routes: PlannedRoute[]
  selectedRouteId: string | null
  start: Waypoint | null
  finish: Waypoint | null
  armedPoint: PlannerPointId | null
  curvatureVisible: boolean
  rideMode: boolean
  onMapPick(point: Waypoint): void
}

type LiveMapProps = MapStageProps

function geoJsonSource(map: MapLibreMap, id: string): GeoJSONSource | null {
  return map.getSource(id) as GeoJSONSource | undefined ?? null
}

function updatePlannerSources(map: MapLibreMap, props: LiveMapProps) {
  geoJsonSource(map, "switchback-routes")?.setData(
    buildRouteFeatures(props.routes, props.selectedRouteId)
  )
  geoJsonSource(map, "switchback-waypoints")?.setData(
    buildWaypointFeatures(props.start, props.finish)
  )
}

function routeFitPadding(rideMode: boolean) {
  const shortLandscape = window.innerHeight <= 520 && window.innerWidth > window.innerHeight
  if (shortLandscape && window.innerWidth >= 800) {
    return rideMode
      ? { top: 80, right: 40, bottom: 150, left: 40 }
      : { top: 40, right: 40, bottom: 40, left: 500 }
  }
  if (shortLandscape) {
    return rideMode
      ? { top: 72, right: 24, bottom: 150, left: 24 }
      : { top: 24, right: 24, bottom: 170, left: 24 }
  }
  return window.innerWidth >= 800
    ? { top: 80, right: 70, bottom: 80, left: rideMode ? 70 : 500 }
    : { top: 90, right: 34, bottom: rideMode ? 250 : 450, left: 34 }
}

function fitSelectedRoute(map: MapLibreMap, props: LiveMapProps) {
  const route = props.routes.find((item) => item.id === props.selectedRouteId)
  if (!route || route.geometry.length < 2) return
  const longitudes = route.geometry.map(([longitude]) => longitude)
  const latitudes = route.geometry.map(([, latitude]) => latitude)
  map.fitBounds(
    [
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)]
    ],
    {
      padding: routeFitPadding(props.rideMode),
      duration: 900,
      maxZoom: 15
    }
  )
}

export function MapStage(props: MapStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const geolocateRef = useRef<GeolocateControl | null>(null)
  const propsRef = useRef<LiveMapProps>(props)
  const curvatureAbortRef = useRef<AbortController | null>(null)
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState("")
  const [curvatureStatus, setCurvatureStatus] = useState<"hidden" | "loading" | "ready" | "zoom" | "error">("hidden")

  useEffect(() => {
    propsRef.current = props
  }, [props])

  useEffect(() => {
    let disposed = false
    let map: MapLibreMap | null = null

    void import("maplibre-gl").then((maplibre) => {
      if (disposed || !containerRef.current) return
      map = new maplibre.Map({
        container: containerRef.current,
        style: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/fiord",
        center: [-76.75, 40.2],
        zoom: 7.5,
        minZoom: 4,
        maxZoom: 18,
        attributionControl: false
      })
      mapRef.current = map
      map.addControl(
        new maplibre.AttributionControl({ compact: true }),
        window.innerWidth <= 760 ? "bottom-left" : "bottom-right"
      )
      map.on("styleimagemissing", (event) => {
        const image = createFallbackStyleImage(event.id)
        if (image && !map?.hasImage(event.id)) {
          map?.addImage(event.id, image, { sdf: true })
        }
      })
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right")
      const geolocate = new maplibre.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        fitBoundsOptions: { maxZoom: 16 }
      })
      geolocateRef.current = geolocate
      map.addControl(geolocate, "bottom-right")
      map.addControl(new maplibre.ScaleControl({ maxWidth: 110, unit: "imperial" }), "bottom-left")

      map.on("click", (event) => {
        const current = propsRef.current
        if (!current.armedPoint) return
        current.onMapPick({
          lat: Number(event.lngLat.lat.toFixed(6)),
          lon: Number(event.lngLat.lng.toFixed(6)),
          label: `Dropped ${current.armedPoint}`
        })
      })

      map.on("load", () => {
        if (!map || disposed) return
        map.addSource("switchback-routes", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        map.addLayer({
          id: "switchback-route-casing",
          type: "line",
          source: "switchback-routes",
          paint: {
            "line-color": "#090B0A",
            "line-width": ["case", ["get", "selected"], 9, 5],
            "line-opacity": 0.9
          },
          layout: { "line-cap": "round", "line-join": "round" }
        })
        map.addLayer({
          id: "switchback-route-lines",
          type: "line",
          source: "switchback-routes",
          paint: {
            "line-color": ["case", ["get", "selected"], "#F36A2D", "#D5DAD6"],
            "line-width": ["case", ["get", "selected"], 5, 2.5],
            "line-opacity": ["case", ["get", "selected"], 1, 0.72]
          },
          layout: { "line-cap": "round", "line-join": "round" }
        })
        map.addSource("switchback-curvature", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        map.addLayer({
          id: "switchback-curvature-lines",
          type: "line",
          source: "switchback-curvature",
          paint: {
            "line-color": "#F36A2D",
            "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1, 13, 3],
            "line-opacity": 0.34,
            "line-dasharray": [2, 2]
          },
          layout: { "line-cap": "round", "line-join": "round" }
        }, "switchback-route-casing")
        map.addSource("switchback-waypoints", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        map.addLayer({
          id: "switchback-waypoint-rings",
          type: "circle",
          source: "switchback-waypoints",
          paint: {
            "circle-radius": 12,
            "circle-color": ["case", ["==", ["get", "kind"], "finish"], "#F36A2D", "#F3EFE6"],
            "circle-stroke-color": "#0B0E0D",
            "circle-stroke-width": 4
          }
        })
        map.addLayer({
          id: "switchback-waypoint-labels",
          type: "symbol",
          source: "switchback-waypoints",
          layout: {
            "text-field": ["get", "marker"],
            "text-size": 11,
            "text-font": ["Noto Sans Bold"]
          },
          paint: {
            "text-color": "#0B0E0D"
          }
        })
        updatePlannerSources(map, propsRef.current)
        setReady(true)
        setMapError("")
      })

      map.on("error", () => {
        if (!map?.isStyleLoaded()) {
          setMapError("The base map could not load. Routing controls remain available.")
        }
      })
    }).catch(() => {
      setMapError("The interactive map could not start in this browser.")
    })

    return () => {
      disposed = true
      curvatureAbortRef.current?.abort()
      map?.remove()
      mapRef.current = null
      geolocateRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const current = propsRef.current
    updatePlannerSources(map, current)
    fitSelectedRoute(map, current)
  }, [props.routes, props.selectedRouteId, props.start, props.finish, props.rideMode, ready])

  useEffect(() => {
    if (ready && props.rideMode) void geolocateRef.current?.trigger()
  }, [props.rideMode, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const refreshCurvature = async () => {
      if (!propsRef.current.curvatureVisible || map.getZoom() < 7) {
        geoJsonSource(map, "switchback-curvature")?.setData(emptyFeatureCollection())
        setCurvatureStatus(propsRef.current.curvatureVisible ? "zoom" : "hidden")
        return
      }
      const bounds = map.getBounds()
      const south = bounds.getSouth()
      const west = bounds.getWest()
      const north = bounds.getNorth()
      const east = bounds.getEast()
      if (north - south > 5 || east - west > 5) {
        geoJsonSource(map, "switchback-curvature")?.setData(emptyFeatureCollection())
        setCurvatureStatus("zoom")
        return
      }
      curvatureAbortRef.current?.abort()
      const controller = new AbortController()
      curvatureAbortRef.current = controller
      const query = new URLSearchParams({
        south: String(south),
        west: String(west),
        north: String(north),
        east: String(east),
        minScore: "700",
        limit: "1200"
      })
      try {
        setCurvatureStatus("loading")
        const response = await fetch(`/api/curvature?${query}`, {
          headers: { accept: "application/geo+json, application/json" },
          signal: controller.signal
        })
        if (!response.ok) {
          setCurvatureStatus("error")
          return
        }
        const collection = await response.json() as FeatureCollection
        geoJsonSource(map, "switchback-curvature")?.setData(collection)
        setCurvatureStatus("ready")
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return
        setCurvatureStatus("error")
      }
    }

    const onMoveEnd = () => void refreshCurvature()
    map.on("moveend", onMoveEnd)
    void refreshCurvature()
    return () => {
      map.off("moveend", onMoveEnd)
      curvatureAbortRef.current?.abort()
    }
  }, [props.curvatureVisible, ready])

  return (
    <div className={`map-stage${props.rideMode ? " is-ride-mode" : ""}`} aria-label="Interactive route map">
      <div ref={containerRef} className="map-canvas" />
      {!ready && !mapError ? <div className="map-loading">Reading the map…</div> : null}
      {mapError ? <div className="map-error" role="status">{mapError}</div> : null}
      {curvatureStatus === "loading" ? <div className="map-layer-status" role="status">Loading curve overlay…</div> : null}
      {curvatureStatus === "zoom" ? <div className="map-layer-status">Zoom in to see curve data</div> : null}
      {curvatureStatus === "error" ? <div className="map-layer-status map-layer-error" role="status">Curve overlay unavailable</div> : null}
      {props.armedPoint ? (
        <div className="map-crosshair" aria-hidden="true">
          <span />
          <small>Place {props.armedPoint}</small>
        </div>
      ) : null}
    </div>
  )
}
