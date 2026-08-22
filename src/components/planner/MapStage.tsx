"use client"

import type { FeatureCollection } from "geojson"
import type { Map as MapLibreMap } from "maplibre-gl"
import { Crosshair, Lock, X } from "@phosphor-icons/react"
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react"
import { buildWaypointFeatures, emptyFeatureCollection } from "@/lib/client/map-data"
import { createFallbackStyleImage } from "@/lib/client/map-style"
import type { NavigationFrame } from "@/lib/client/navigation-engine"
import { buildNavigationMapFeatures } from "@/lib/client/navigation-map"
import type { ReferenceMap } from "@/lib/client/reference-map"
import "@/app/styles/map-stage-road-locks.css"
import {
  featureMapLayerIds,
  mapStyleUrl,
  riderFeatureLayersAtZoom,
  riderFeatureQuery,
  type FeatureLayerState,
  type RiderLayerId,
  type RiderLayerSetting,
  type RiderMapPack,
  paUnpavedRoadsQuery,
  shouldShowBaseMapFailure,
  type MapStyleId
} from "@/lib/client/map-layers"
import type { AvoidArea, Coordinate, PlannedRoute, Waypoint } from "@/lib/routing/types"
import { featureFlags } from "@/lib/domain/feature-flags"
import { setMapRuntimeProbe, setRouteRuntimeMetrics } from "@/lib/client/runtime-diagnostics"
import type { PlannerPointId } from "@/stores/planner-store"
import { usePlannerStore } from "@/stores/planner-store"
import { useNavigationFrame } from "@/stores/navigation-store"
import { fitSelectedRoute, followNavigationFrame } from "./map-stage-navigation"
import {
  addRiderMapLayers,
  geoJsonSource,
  RIDER_FEATURE_SOURCE,
  updatePlannerSources,
  updateReferenceMapSource,
  updateRiderMapLayerPresentation
} from "./map-stage-sources"
import { useReferenceMapOverlay } from "./useReferenceMapOverlay"
import { useRoadLockDraft } from "./useRoadLockDraft"
import {
  appendSketchPoint,
  avoidAreaPolygon,
  createAvoidArea,
  hasUsableSketch,
  roadLockAnchorFeatures,
  roadLockDriftArrowFeatures,
  roadLockLineFeatures,
  routeSketchWaypoints,
  resolveRoadLockMatchColorMap
} from "./map-drawing"
import { MapStageLayerControl } from "./MapStageLayerControl"

interface MapStageProps {
  routes: PlannedRoute[]
  selectedRouteId: string | null
  start: Waypoint | null
  finish: Waypoint | null
  via: Waypoint[]
  armedPoint: PlannerPointId | null
  addingVia: boolean
  /** Phase 6: the previous route stays visible but dimmed during replan. */
  recalculating?: boolean
  curvatureVisible: boolean
  unpavedVisible: boolean
  mapStyle: MapStyleId
  riderLayers: RiderLayerSetting[]
  routeVisibility: "standard" | "high-contrast"
  mapPacks: RiderMapPack[]
  rideMode: boolean
  navigationFrame?: NavigationFrame | null
  onCurvatureChange(visible: boolean): void
  onUnpavedChange(visible: boolean): void
  onMapStyleChange(style: MapStyleId): void
  onRiderLayerChange(id: RiderLayerId, patch: Partial<Pick<RiderLayerSetting, "visible" | "opacity">>): void
  onMoveRiderLayer(id: RiderLayerId, direction: "earlier" | "later"): void
  onRouteVisibilityChange(visibility: "standard" | "high-contrast"): void
  onSaveMapPack(name: string): void
  onApplyMapPack(id: string): void
  referenceMap: ReferenceMap | null
  onReferenceMapChange(reference: ReferenceMap | null): void
  onWaypointDrag(kind: "start" | "finish" | "via", index: number, point: Waypoint): void
  onMapPick(point: Waypoint): void
  onRouteSketch(trace: Waypoint[]): void
  onSketchModeChange(active: boolean): void
  avoidAreas: AvoidArea[]
  onAvoidArea(area: AvoidArea): void
  /** A browser "locate me" fix was produced; the planner should adopt it as the start. */
  onLocateMe?(point: { lat: number; lon: number }): void
  /** Live breadcrumb trail for a recording session in ride mode. */
  recordingTrail?: Coordinate[] | null
}

type LiveMapProps = MapStageProps

interface SketchScreenPoint {
  x: number
  y: number
}

export function MapStage(props: MapStageProps) {
  const storedNavigationFrame = useNavigationFrame()
  const navigationFrame = props.navigationFrame ?? storedNavigationFrame
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const styleTimeoutRef = useRef<number | null>(null)
  const propsRef = useRef<LiveMapProps>(props)
  const navigationFollowingRef = useRef(true)
  const curvatureAbortRef = useRef<AbortController | null>(null)
  const unpavedAbortRef = useRef<AbortController | null>(null)
  const riderFeaturesAbortRef = useRef<AbortController | null>(null)
  const sketchPointsRef = useRef<SketchScreenPoint[]>([])
  const sketchDrawingRef = useRef(false)
  const avoidDrawingRef = useRef(false)
  const [readyStyle, setReadyStyle] = useState<MapStyleId | null>(null)
  const [mapError, setMapError] = useState("")
  const [curvatureStatus, setCurvatureStatus] = useState<"hidden" | "loading" | "ready" | "zoom" | "error">("hidden")
  const [unpavedStatus, setUnpavedStatus] = useState<"hidden" | "loading" | "ready" | "zoom" | "error">("hidden")
  const [unpavedCount, setUnpavedCount] = useState(0)
  const [riderFeaturesStatus, setRiderFeaturesStatus] = useState<"hidden" | "loading" | "ready" | "zoom" | "error">("hidden")
  const [riderLayerStates, setRiderLayerStates] = useState<Record<string, FeatureLayerState>>({})
  const [riderLayerCounts, setRiderLayerCounts] = useState<Record<string, number>>({})
  const [riderFeaturesRetry, setRiderFeaturesRetry] = useState(0)
  const [navigationFollowing, setNavigationFollowing] = useState(true)
  const [sketchMode, setSketchMode] = useState(false)
  const [avoidMode, setAvoidMode] = useState(false)
  const [avoidStart, setAvoidStart] = useState<SketchScreenPoint | null>(null)
  const [avoidEnd, setAvoidEnd] = useState<SketchScreenPoint | null>(null)
  const [sketchPoints, setSketchPoints] = useState<SketchScreenPoint[]>([])
  const [sketchMessage, setSketchMessage] = useState("")
  const roadLocks = usePlannerStore((state) => state.roadLocks)
  const addRoadLock = usePlannerStore((state) => state.addRoadLock)
  const [highlightedLockId, setHighlightedLockId] = useState<string | null>(null)
  const {
    lockDrawMode,
    lockAnchors,
    lockMode,
    lockName,
    lockDraftStep,
    lockDraftMessage,
    beginLockDraft,
    isLockDrawActive,
    resetLockDraft,
    handleLockDrawTap,
    commitLockDraft,
    setLockMode,
    setLockName
  } = useRoadLockDraft({ addRoadLock })
  const ready = readyStyle === props.mapStyle
  const { referenceMessage, alignReferenceToView, handleReferenceFile, removeReferenceMap } = useReferenceMapOverlay({
    mapRef,
    ready,
    referenceMap: props.referenceMap,
    onReferenceMapChange: props.onReferenceMapChange
  })
  const setCurrentSketchPoints = (points: SketchScreenPoint[]) => {
    sketchPointsRef.current = points
    setSketchPoints(points)
  }

  const screenPoint = (
    event: ReactPointerEvent<HTMLDivElement>,
    clientX = event.clientX,
    clientY = event.clientY
  ): SketchScreenPoint => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: clientX - bounds.left, y: clientY - bounds.top }
  }

  const beginSketch = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    event.preventDefault()
    sketchDrawingRef.current = true
    setSketchMessage("")
    setCurrentSketchPoints([screenPoint(event)])
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const continueSketch = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!sketchDrawingRef.current) return
    event.preventDefault()
    const nativeEvents = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
    let points = sketchPointsRef.current
    for (const nativeEvent of nativeEvents) {
      const next = screenPoint(event, nativeEvent.clientX, nativeEvent.clientY)
      points = appendSketchPoint(points, next)
    }
    if (points !== sketchPointsRef.current) setCurrentSketchPoints(points)
  }

  const finishSketch = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!sketchDrawingRef.current) return
    event.preventDefault()
    sketchDrawingRef.current = false
    const points = sketchPointsRef.current
    const map = mapRef.current
    if (!map || !ready) {
      setSketchMessage("Wait for the map to finish loading, then draw again.")
      setCurrentSketchPoints([])
      return
    }
    if (!hasUsableSketch(points)) {
      setSketchMessage("Draw a longer line through the roads you want.")
      setCurrentSketchPoints([])
      return
    }
    const trace = routeSketchWaypoints(map, points)
    propsRef.current.onRouteSketch(trace)
    setCurrentSketchPoints([])
    setSketchMode(false)
    propsRef.current.onSketchModeChange(false)
  }

  const cancelSketch = () => {
    sketchDrawingRef.current = false
    setCurrentSketchPoints([])
    setSketchMessage("")
    setSketchMode(false)
    propsRef.current.onSketchModeChange(false)
  }

  const beginAvoidArea = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    event.preventDefault()
    const point = screenPoint(event)
    avoidDrawingRef.current = true
    setAvoidStart(point)
    setAvoidEnd(point)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const continueAvoidArea = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!avoidDrawingRef.current) return
    event.preventDefault()
    setAvoidEnd(screenPoint(event))
  }

  const cancelAvoidArea = () => {
    avoidDrawingRef.current = false
    setAvoidStart(null)
    setAvoidEnd(null)
    setAvoidMode(false)
    propsRef.current.onSketchModeChange(false)
  }

  const finishAvoidArea = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!avoidDrawingRef.current) return
    event.preventDefault()
    avoidDrawingRef.current = false
    const start = avoidStart
    const end = screenPoint(event)
    const map = mapRef.current
    if (!start || !map || !ready) {
      cancelAvoidArea()
      return
    }
    const polygon = avoidAreaPolygon(map, start, end)
    if (!polygon) {
      cancelAvoidArea()
      return
    }
    propsRef.current.onAvoidArea(createAvoidArea(
      `avoid-${Date.now().toString(36)}`,
      propsRef.current.avoidAreas.length,
      polygon
    ))
    cancelAvoidArea()
  }

  useEffect(() => {
    propsRef.current = props
  }, [props])

  useEffect(() => {
    let disposed = false
    let map: MapLibreMap | null = null
    let releaseMapProbe: (() => void) | null = null
    let initialStyleLoaded = false
    void import("maplibre-gl").then((maplibre) => {
      if (disposed || !containerRef.current) return
      const initialStart = propsRef.current.start
      map = new maplibre.Map({
        container: containerRef.current,
        style: props.mapStyle === "clean" && process.env.NEXT_PUBLIC_MAP_STYLE_URL
          ? process.env.NEXT_PUBLIC_MAP_STYLE_URL
          : mapStyleUrl(props.mapStyle),
        center: initialStart ? [initialStart.lon, initialStart.lat] : [-98.5795, 39.8283],
        zoom: initialStart ? 10.5 : 3.8,
        minZoom: 4,
        maxZoom: 18,
        attributionControl: false
      })
      mapRef.current = map
      releaseMapProbe = setMapRuntimeProbe(() => {
        const style = map?.getStyle()
        return {
          sourceCount: style ? Object.keys(style.sources ?? {}).length : 0,
          layerCount: style?.layers?.length ?? 0
        }
      })
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
      // The GeolocateControl is a dead button on insecure contexts (LAN http),
      // where browsers hide navigator.geolocation entirely — only offer it
      // when the browser can actually produce a fix.
      if ("geolocation" in navigator) {
        const geolocate = new maplibre.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: false,
          fitBoundsOptions: { maxZoom: 16 }
        })
        // Adopt the browser fix as the planner start instead of leaving the
        // control as a map-view-only button: clicking it seeds the route and,
        // when a finish is already set, runs the plan.
        geolocate.on("geolocate", (position) => {
          const { latitude, longitude } = position.coords
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            propsRef.current.onLocateMe?.({ lat: latitude, lon: longitude })
          }
        })
        map.addControl(geolocate, "bottom-right")
      }
      map.addControl(new maplibre.ScaleControl({ maxWidth: 110, unit: "imperial" }), "bottom-left")
      map.on("dragstart", () => {
        if (!propsRef.current.rideMode) return
        navigationFollowingRef.current = false
        setNavigationFollowing(false)
      })

      let draggedWaypoint: { kind: "start" | "finish" | "via"; index: number } | null = null
      let suppressNextClick = false

      map.on("click", (event) => {
        if (suppressNextClick) {
          suppressNextClick = false
          return
        }
        const current = propsRef.current
        if (isLockDrawActive()) {
          handleLockDrawTap({
            lat: Number(event.lngLat.lat.toFixed(6)),
            lon: Number(event.lngLat.lng.toFixed(6))
          })
          return
        }
        if (!current.armedPoint && !current.addingVia) return
        current.onMapPick({
          lat: Number(event.lngLat.lat.toFixed(6)),
          lon: Number(event.lngLat.lng.toFixed(6)),
          label: current.addingVia ? `Shaping stop ${current.via.length + 1}` : `Dropped ${current.armedPoint}`
        })
      })

      map.on("load", () => {
        if (!map || disposed) return
        initialStyleLoaded = true
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
            "line-opacity": ["case", ["get", "traversed"], 0.3, 0.9]
          },
          layout: { "line-cap": "round", "line-join": "round" }
        })
        map.addLayer({
          id: "switchback-route-lines",
          type: "line",
          source: "switchback-routes",
          paint: {
            "line-color": ["case",
              ["get", "traversed"], "#5a5e5b",
              ["get", "selected"], "#F36A2D", "#D5DAD6"
            ],
            "line-width": ["case", ["get", "selected"], 5, 2.5],
            "line-opacity": ["case",
              ["get", "traversed"], 0.35,
              ["get", "selected"], 1, 0.72
            ]
          },
          layout: { "line-cap": "round", "line-join": "round" }
        })
        map.addSource("switchback-route-labels", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        map.addLayer({
          id: "switchback-route-labels",
          type: "symbol",
          source: "switchback-route-labels",
          filter: ["!", ["get", "selected"]],
          layout: {
            "text-field": ["get", "label"],
            "text-size": 11,
            "text-font": ["Noto Sans Bold"],
            "text-anchor": "center",
            "text-offset": [0, 0],
            "text-allow-overlap": true,
            "symbol-sort-key": 0
          },
          paint: {
            "text-color": "#3a3d3a",
            "text-halo-color": "#FFFFFF",
            "text-halo-width": 3
          }
        })
        map.addLayer({
          id: "switchback-route-label-selected",
          type: "symbol",
          source: "switchback-route-labels",
          filter: ["get", "selected"],
          layout: {
            "text-field": ["get", "label"],
            "text-size": 12,
            "text-font": ["Noto Sans Bold"],
            "text-anchor": "center",
            "text-offset": [0, 0],
            "text-allow-overlap": true,
            "symbol-sort-key": 1
          },
          paint: {
            "text-color": "#F36A2D",
            "text-halo-color": "#FFFFFF",
            "text-halo-width": 3
          }
        })
        map.addSource("switchback-navigation", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        map.addLayer({
          id: "switchback-navigation-match-link",
          type: "line",
          source: "switchback-navigation",
          filter: ["==", ["get", "kind"], "match-link"],
          paint: {
            "line-color": "#1A73E8",
            "line-width": 2,
            "line-opacity": 0.58,
            "line-dasharray": [1.2, 1.2]
          },
          layout: { "line-cap": "round" }
        })
        map.addLayer({
          id: "switchback-navigation-match",
          type: "circle",
          source: "switchback-navigation",
          filter: ["==", ["get", "kind"], "matched-position"],
          paint: {
            "circle-radius": 5,
            "circle-color": "#FFFFFF",
            "circle-stroke-color": "#1A73E8",
            "circle-stroke-width": 2,
            "circle-opacity": 0.92
          }
        })
        map.addLayer({
          id: "switchback-navigation-rider-halo",
          type: "circle",
          source: "switchback-navigation",
          filter: ["==", ["get", "kind"], "rider-position"],
          paint: {
            "circle-radius": 18,
            "circle-color": "#FFFFFF",
            "circle-opacity": 0.82,
            "circle-blur": 0.2
          }
        })
        map.addLayer({
          id: "switchback-navigation-rider",
          type: "circle",
          source: "switchback-navigation",
          filter: ["==", ["get", "kind"], "rider-position"],
          paint: {
            "circle-radius": 12,
            "circle-color": ["case", ["==", ["get", "status"], "off-route"], "#E35D54", "#1A73E8"],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 3
          }
        })
        map.addLayer({
          id: "switchback-navigation-heading",
          type: "symbol",
          source: "switchback-navigation",
          filter: ["==", ["get", "kind"], "rider-position"],
          layout: {
            "text-field": "▲",
            "text-size": 15,
            "text-rotate": ["get", "bearing"],
            "text-rotation-alignment": "map",
            "text-pitch-alignment": "map",
            "text-offset": [0, -1.35],
            "text-allow-overlap": true
          },
          paint: {
            "text-color": "#1A73E8",
            "text-halo-color": "#FFFFFF",
            "text-halo-width": 2
          }
        })
        map.addSource("switchback-unpaved", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        map.addLayer({
          id: "switchback-unpaved-lines",
          type: "line",
          source: "switchback-unpaved",
          paint: {
            "line-color": "#8B5E34",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 14, 4],
            "line-opacity": 0.82,
            "line-dasharray": [1.4, 1.1]
          },
          layout: { "line-cap": "round", "line-join": "round" }
        }, "switchback-route-casing")
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
        addRiderMapLayers(map)
        map.addSource("switchback-road-locks", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        map.addSource("switchback-road-lock-anchors", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        map.addSource("switchback-road-lock-drift", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        map.addLayer({
          id: "switchback-road-lock-lines",
          type: "line",
          source: "switchback-road-locks",
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["case", ["get", "selected"], 6, 4],
            "line-opacity": ["case", ["get", "unresolved"], 0.7, 1],
            "line-dasharray": ["case", ["get", "unresolved"], ["literal", [2, 1.5]], ["literal", [1, 0]]]
          },
          layout: { "line-cap": "round", "line-join": "round" }
        }, "switchback-route-casing")
        map.addLayer({
          id: "switchback-road-lock-drift",
          type: "line",
          source: "switchback-road-lock-drift",
          paint: {
            "line-color": ["get", "color"],
            "line-width": 2,
            "line-opacity": 0.6,
            "line-dasharray": [1.4, 1]
          },
          layout: { "line-cap": "round" }
        }, "switchback-route-casing")
        map.addLayer({
          id: "switchback-road-lock-anchors",
          type: "circle",
          source: "switchback-road-lock-anchors",
          paint: {
            "circle-radius": ["case", ["get", "selected"], 9, 7],
            "circle-color": "#FFFFFF",
            "circle-stroke-color": ["case", ["get", "selected"], "#F36A2D", "#949C97"],
            "circle-stroke-width": ["case", ["get", "selected"], 4, 3]
          }
        })
        map.on("mouseenter", "switchback-road-lock-lines", () => {
          map!.getCanvas().style.cursor = "pointer"
        })
        map.on("mouseleave", "switchback-road-lock-lines", () => {
          map!.getCanvas().style.cursor = ""
        })
        map.on("click", "switchback-road-lock-lines", (event) => {
          const id = event.features?.[0]?.properties?.id
          if (typeof id === "string") {
            setHighlightedLockId((current) => (current === id ? null : id))
          }
        })
        map.addSource("switchback-waypoints", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        map.addSource("switchback-avoid-areas", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        map.addLayer({
          id: "switchback-avoid-area-fill",
          type: "fill",
          source: "switchback-avoid-areas",
          paint: { "fill-color": "#C84432", "fill-opacity": 0.16 }
        }, "switchback-route-casing")
        map.addLayer({
          id: "switchback-avoid-area-outline",
          type: "line",
          source: "switchback-avoid-areas",
          paint: { "line-color": "#C84432", "line-width": 2.5, "line-dasharray": [1.3, 1] }
        }, "switchback-route-casing")
        map.addLayer({
          id: "switchback-waypoint-rings",
          type: "circle",
          source: "switchback-waypoints",
          paint: {
            "circle-radius": ["case", ["==", ["get", "kind"], "via"], 10, 12],
            "circle-color": ["case", ["==", ["get", "kind"], "finish"], "#F36A2D", ["==", ["get", "kind"], "via"], "#FFFFFF", "#242321"],
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
            "text-color": ["case", ["==", ["get", "kind"], "start"], "#FFFFFF", "#0B0E0D"]
          }
        })
        map.on("mouseenter", "switchback-waypoint-rings", () => {
          map!.getCanvas().style.cursor = "grab"
        })
        map.on("mouseleave", "switchback-waypoint-rings", () => {
          if (!draggedWaypoint) map!.getCanvas().style.cursor = ""
        })
        map.on("mousedown", "switchback-waypoint-rings", (event) => {
          const properties = event.features?.[0]?.properties
          const kind = properties?.kind
          if (kind !== "start" && kind !== "finish" && kind !== "via") return
          draggedWaypoint = {
            kind,
            index: Number.isInteger(Number(properties?.index)) ? Number(properties?.index) : -1
          }
          event.preventDefault()
          map!.dragPan.disable()
          map!.getCanvas().style.cursor = "grabbing"
        })
        map.on("mousemove", (event) => {
          if (!draggedWaypoint) return
          const current = propsRef.current
          const point = {
            lat: Number(event.lngLat.lat.toFixed(6)),
            lon: Number(event.lngLat.lng.toFixed(6)),
            label: "Dragged waypoint"
          }
          const previewVia = [...current.via]
          let previewStart = current.start
          let previewFinish = current.finish
          if (draggedWaypoint.kind === "via" && draggedWaypoint.index >= 0) {
            previewVia[draggedWaypoint.index] = point
          } else if (draggedWaypoint.kind === "start") {
            previewStart = point
          } else if (draggedWaypoint.kind === "finish") {
            previewFinish = point
          }
          geoJsonSource(map!, "switchback-waypoints")?.setData(
            buildWaypointFeatures(previewStart, previewFinish, previewVia)
          )
        })
        map.on("mouseup", (event) => {
          if (!draggedWaypoint) return
          const dragged = draggedWaypoint
          draggedWaypoint = null
          suppressNextClick = true
          map!.dragPan.enable()
          map!.getCanvas().style.cursor = "grab"
          propsRef.current.onWaypointDrag(dragged.kind, dragged.index, {
            lat: Number(event.lngLat.lat.toFixed(6)),
            lon: Number(event.lngLat.lng.toFixed(6)),
            label: "Dragged waypoint"
          })
        })
        updatePlannerSources(map, propsRef.current)
        updateReferenceMapSource(map, propsRef.current.referenceMap)
        setReadyStyle(props.mapStyle)
        setMapError("")
      })

      map.on("error", () => {
        if (shouldShowBaseMapFailure(initialStyleLoaded, map?.isStyleLoaded() ?? false)) {
          setMapError("The base map could not load. Routing controls remain available.")
        }
      })

      // A hanging style endpoint (no "load", no "error" event) would leave
      // the "Reading the map…" overlay up forever. Surface a timeout with a
      // retry hint instead of an infinite spinner.
      const styleTimeout = window.setTimeout(() => {
        if (disposed) return
        if (!initialStyleLoaded && !map?.isStyleLoaded()) {
          setMapError("The map is taking too long to load. Check your connection, then reload to retry.")
        }
      }, 20_000)
      map.on("load", () => window.clearTimeout(styleTimeout))
      styleTimeoutRef.current = styleTimeout
    }).catch(() => {
      setMapError("The interactive map could not start in this browser.")
    })

    return () => {
      disposed = true
      if (styleTimeoutRef.current != null) window.clearTimeout(styleTimeoutRef.current)
      styleTimeoutRef.current = null
      curvatureAbortRef.current?.abort()
      unpavedAbortRef.current?.abort()
      riderFeaturesAbortRef.current?.abort()
      releaseMapProbe?.()
      setReadyStyle(null)
      map?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mapStyle])

  useEffect(() => {
    setRouteRuntimeMetrics({
      entityCount: props.routes.length,
      geometryBytesEstimate: props.routes.reduce(
        (total, route) => total + route.geometry.length * 2 * Float64Array.BYTES_PER_ELEMENT,
        0
      )
    })
    return () => setRouteRuntimeMetrics(null)
  }, [props.routes])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const current = propsRef.current
    updatePlannerSources(map, current)
    fitSelectedRoute(map, current)
  }, [props.routes, props.selectedRouteId, props.start, props.finish, props.via, props.avoidAreas, props.rideMode, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const colorMap = resolveRoadLockMatchColorMap()
    geoJsonSource(map, "switchback-road-locks")?.setData(
      roadLockLineFeatures(roadLocks, props.routes, colorMap, highlightedLockId)
    )
    geoJsonSource(map, "switchback-road-lock-anchors")?.setData(
      roadLockAnchorFeatures(roadLocks, highlightedLockId)
    )
    geoJsonSource(map, "switchback-road-lock-drift")?.setData(
      roadLockDriftArrowFeatures(roadLocks, props.routes, colorMap)
    )
  }, [roadLocks, props.routes, highlightedLockId, ready])

  useEffect(() => {
    if (!props.rideMode) return
    navigationFollowingRef.current = true
    const publishFollowing = window.setTimeout(() => setNavigationFollowing(true), 0)
    return () => window.clearTimeout(publishFollowing)
  }, [props.rideMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    geoJsonSource(map, "switchback-navigation")?.setData(
      navigationFrame ? buildNavigationMapFeatures(navigationFrame) : emptyFeatureCollection()
    )
    if (props.rideMode && navigationFrame && navigationFollowingRef.current) {
      followNavigationFrame(map, navigationFrame)
    }
  }, [navigationFrame, props.rideMode, ready])

  // Recording session breadcrumb trail: draw the captured GPS trail and keep
  // the camera on the latest fix while riding. The trail is removed when the
  // recording ends or ride mode exits.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const trail = props.recordingTrail
    if (!props.rideMode || !trail || trail.length === 0) {
      for (const id of ["switchback-recording-head", "switchback-recording-trail-line"] as const) {
        if (map.getLayer(id)) map.removeLayer(id)
      }
      if (map.getSource("switchback-recording-trail")) map.removeSource("switchback-recording-trail")
      return
    }
    if (!map.getSource("switchback-recording-trail")) {
      map.addSource("switchback-recording-trail", { type: "geojson", data: emptyFeatureCollection() })
    }
    if (!map.getLayer("switchback-recording-trail-line")) {
      map.addLayer({
        id: "switchback-recording-trail-line",
        type: "line",
        source: "switchback-recording-trail",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#FF3B24",
          "line-width": 4,
          "line-opacity": 0.9
        }
      })
    }
    if (!map.getLayer("switchback-recording-head")) {
      map.addLayer({
        id: "switchback-recording-head",
        type: "circle",
        source: "switchback-recording-trail",
        filter: ["==", ["get", "kind"], "head"],
        paint: {
          "circle-radius": 9,
          "circle-color": "#FF3B24",
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 3
        }
      })
    }
    const head = trail[trail.length - 1]!
    geoJsonSource(map, "switchback-recording-trail")?.setData({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: trail } },
        { type: "Feature", properties: { kind: "head" }, geometry: { type: "Point", coordinates: head } }
      ]
    })
    // Follow the latest fix while recording so the rider can glance at the
    // app and always see where they are.
    map.easeTo({
      center: head,
      zoom: Math.max(map.getZoom(), 14.5),
      duration: 650,
      essential: true
    })
  }, [props.recordingTrail, props.rideMode, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || props.routes.length > 0 || !props.start) return
    map.flyTo({
      center: [props.start.lon, props.start.lat],
      zoom: 10.5,
      duration: 650,
      essential: true
    })
  }, [props.start, props.routes.length, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    updateReferenceMapSource(map, props.referenceMap)
  }, [props.referenceMap, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const opacity = (id: RiderLayerId, fallback: number) =>
      props.riderLayers.find((layer) => layer.id === id)?.opacity ?? fallback
    const visible = (id: RiderLayerId, fallback: boolean) =>
      props.riderLayers.find((layer) => layer.id === id)?.visible ?? fallback
    map.setPaintProperty("switchback-curvature-lines", "line-opacity", opacity("curvature", 0.34))
    map.setPaintProperty("switchback-unpaved-lines", "line-opacity", opacity("unpaved", 0.82))
    map.setLayoutProperty("switchback-curvature-lines", "visibility", visible("curvature", props.curvatureVisible) ? "visible" : "none")
    map.setLayoutProperty("switchback-unpaved-lines", "visibility", visible("unpaved", props.unpavedVisible) ? "visible" : "none")
    updateRiderMapLayerPresentation(map, props.riderLayers)
    map.setPaintProperty(
      "switchback-route-lines",
      "line-width",
      props.routeVisibility === "high-contrast"
        ? ["case", ["get", "selected"], 6.5, 3.5]
        : ["case", ["get", "selected"], 5, 2.5]
    )
  }, [props.riderLayers, props.curvatureVisible, props.unpavedVisible, props.routeVisibility, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    let disposed = false
    let requestVersion = 0
    const isCurrent = (version: number) => !disposed && mapRef.current === map && version === requestVersion

    const refreshCurvature = async () => {
      if (disposed || mapRef.current !== map) return
      const version = ++requestVersion
      curvatureAbortRef.current?.abort()
      if (!propsRef.current.curvatureVisible || map.getZoom() < 7) {
        if (!isCurrent(version)) return
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
        if (!isCurrent(version)) return
        geoJsonSource(map, "switchback-curvature")?.setData(emptyFeatureCollection())
        setCurvatureStatus("zoom")
        return
      }
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
        if (!isCurrent(version)) return
        setCurvatureStatus("loading")
        const response = await fetch(`/api/curvature?${query}`, {
          headers: { accept: "application/geo+json, application/json" },
          signal: controller.signal
        })
        if (!isCurrent(version)) return
        if (!response.ok) {
          setCurvatureStatus("error")
          return
        }
        const collection = await response.json() as FeatureCollection
        if (!isCurrent(version)) return
        geoJsonSource(map, "switchback-curvature")?.setData(collection)
        setCurvatureStatus("ready")
      } catch (caught) {
        if (!isCurrent(version) || (caught instanceof DOMException && caught.name === "AbortError")) return
        setCurvatureStatus("error")
      }
    }

    const onMoveEnd = () => {
      if (!propsRef.current.rideMode) void refreshCurvature()
    }
    map.on("moveend", onMoveEnd)
    void refreshCurvature()
    return () => {
      disposed = true
      requestVersion += 1
      map.off("moveend", onMoveEnd)
      curvatureAbortRef.current?.abort()
    }
  }, [props.curvatureVisible, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    let disposed = false
    let requestVersion = 0
    const isCurrent = (version: number) => !disposed && mapRef.current === map && version === requestVersion

    const refreshUnpavedRoads = async () => {
      if (disposed || mapRef.current !== map) return
      const version = ++requestVersion
      unpavedAbortRef.current?.abort()
      const current = propsRef.current
      if (!current.unpavedVisible) {
        if (!isCurrent(version)) return
        geoJsonSource(map, "switchback-unpaved")?.setData(emptyFeatureCollection())
        setUnpavedStatus("hidden")
        setUnpavedCount(0)
        return
      }
      const bounds = map.getBounds()
      const query = paUnpavedRoadsQuery({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth()
      }, map.getZoom())
      if (!query) {
        if (!isCurrent(version)) return
        geoJsonSource(map, "switchback-unpaved")?.setData(emptyFeatureCollection())
        setUnpavedStatus("zoom")
        setUnpavedCount(0)
        return
      }
      const controller = new AbortController()
      unpavedAbortRef.current = controller
      try {
        if (!isCurrent(version)) return
        setUnpavedStatus("loading")
        const response = await fetch(`/api/pa-unpaved-roads?${query}`, {
          headers: { accept: "application/geo+json, application/json" },
          signal: controller.signal
        })
        if (!isCurrent(version)) return
        if (!response.ok) {
          setUnpavedStatus("error")
          return
        }
        const collection = await response.json() as FeatureCollection & { metadata?: { count?: number } }
        if (!isCurrent(version)) return
        geoJsonSource(map, "switchback-unpaved")?.setData(collection)
        setUnpavedCount(collection.metadata?.count ?? collection.features.length)
        setUnpavedStatus("ready")
      } catch (caught) {
        if (!isCurrent(version) || (caught instanceof DOMException && caught.name === "AbortError")) return
        setUnpavedStatus("error")
      }
    }

    const onMoveEnd = () => {
      if (!propsRef.current.rideMode) void refreshUnpavedRoads()
    }
    map.on("moveend", onMoveEnd)
    void refreshUnpavedRoads()
    return () => {
      disposed = true
      requestVersion += 1
      map.off("moveend", onMoveEnd)
      unpavedAbortRef.current?.abort()
    }
  }, [props.unpavedVisible, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    let disposed = false
    let requestVersion = 0
    const isCurrent = (version: number) => !disposed && mapRef.current === map && version === requestVersion

    const FEATURE_LAYER_SET = new Set<RiderLayerId>(featureMapLayerIds)

    const refreshRiderFeatures = async () => {
      if (disposed || mapRef.current !== map) return
      const version = ++requestVersion
      riderFeaturesAbortRef.current?.abort()
      const current = propsRef.current
      const bounds = map.getBounds()
      const zoom = map.getZoom()
      const selectedLayers = riderFeatureLayersAtZoom(current.riderLayers, zoom)
      const selectedSet = new Set<RiderLayerId>(selectedLayers)
      const visibleFeatureLayers = current.riderLayers
        .filter((setting) => setting.visible && FEATURE_LAYER_SET.has(setting.id))
        .map((setting) => setting.id)
      const query = riderFeatureQuery(current.riderLayers, {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth()
      }, zoom)

      // No query (zoom too low for every enabled feature layer, or no layers
      // enabled at all). Mark the visible-but-below-zoom layers so the panel
      // can tell the user *why* nothing is showing.
      if (!query) {
        if (!isCurrent(version)) return
        if (selectedLayers.length === 0 && visibleFeatureLayers.length === 0) {
          setRiderLayerStates({})
          setRiderLayerCounts({})
          setRiderFeaturesStatus("hidden")
          return
        }
        setRiderLayerStates(() => {
          const next: Record<string, FeatureLayerState> = {}
          for (const id of visibleFeatureLayers) next[id] = "zoom"
          return next
        })
        setRiderLayerCounts({})
        setRiderFeaturesStatus("zoom")
        return
      }

      const controller = new AbortController()
      riderFeaturesAbortRef.current = controller

      // Preserve prior ready/empty states while a refetch is in flight so
      // panning around with already-loaded data does not flash "loading"
      // back onto the screen. Only newly-enabled layers show loading.
      if (!isCurrent(version)) return
      setRiderLayerStates((prev) => {
        const next: Record<string, FeatureLayerState> = {}
        for (const id of visibleFeatureLayers) {
          if (selectedSet.has(id)) {
            const was = prev[id]
            next[id] = was === "ready" || was === "empty" ? was : "loading"
          } else {
            next[id] = "zoom"
          }
        }
        return next
      })
      // The aggregate banner only flips to loading if there is no prior
      // successful data — otherwise keep "ready" so the corner banner
      // stays calm during panning.
      if (!isCurrent(version)) return
      setRiderFeaturesStatus((prev) => (prev === "ready" ? "ready" : "loading"))

      try {
        if (!isCurrent(version)) return
        const response = await fetch(`/api/map-features?${query}`, {
          headers: { accept: "application/geo+json, application/json" },
          signal: controller.signal
        })
        if (!isCurrent(version)) return
        if (!response.ok) {
          geoJsonSource(map, RIDER_FEATURE_SOURCE)?.setData(emptyFeatureCollection())
          setRiderLayerStates((prev) => {
            const next: Record<string, FeatureLayerState> = { ...prev }
            for (const id of selectedLayers) next[id] = "error"
            return next
          })
          setRiderLayerCounts({})
          setRiderFeaturesStatus("error")
          return
        }
        const collection = await response.json() as FeatureCollection
        if (!isCurrent(version)) return
        geoJsonSource(map, RIDER_FEATURE_SOURCE)?.setData(collection)
        // Tally per-layer counts so the Layers panel can answer "did this
        // layer load but find nothing in view?" — a very common case for
        // sparse OSM data that previously looked indistinguishable from a
        // failed fetch.
        const counts: Record<string, number> = {}
        for (const feature of collection.features) {
          const lid = (feature.properties as Record<string, unknown> | null)?.layerId
          if (typeof lid === "string") counts[lid] = (counts[lid] ?? 0) + 1
        }
        setRiderLayerCounts(counts)
        setRiderLayerStates((prev) => {
          const next: Record<string, FeatureLayerState> = { ...prev }
          for (const id of visibleFeatureLayers) {
            if (selectedSet.has(id)) {
              next[id] = (counts[id] ?? 0) > 0 ? "ready" : "empty"
            } else {
              next[id] = "zoom"
            }
          }
          return next
        })
        setRiderFeaturesStatus("ready")
      } catch (caught) {
        if (!isCurrent(version) || (caught instanceof DOMException && caught.name === "AbortError")) return
        geoJsonSource(map, RIDER_FEATURE_SOURCE)?.setData(emptyFeatureCollection())
        setRiderLayerStates((prev) => {
          const next: Record<string, FeatureLayerState> = { ...prev }
          for (const id of selectedLayers) next[id] = "error"
          return next
        })
        setRiderLayerCounts({})
        setRiderFeaturesStatus("error")
      }
    }

    const onMoveEnd = () => {
      if (!propsRef.current.rideMode) void refreshRiderFeatures()
    }
    map.on("moveend", onMoveEnd)
    void refreshRiderFeatures()
    return () => {
      disposed = true
      requestVersion += 1
      map.off("moveend", onMoveEnd)
      riderFeaturesAbortRef.current?.abort()
    }
  }, [props.riderLayers, ready, riderFeaturesRetry])

  return (
    <div className={`map-stage${props.rideMode ? " is-ride-mode" : ""}${lockDrawMode ? " is-lock-drawing" : ""}${props.recalculating ? " is-recalculating" : ""}`} aria-label="Interactive route map" data-recalculating={props.recalculating ? "true" : "false"}>
      <div ref={containerRef} className="map-canvas" />
      {!ready && !mapError ? <div className="map-loading">Reading the map…</div> : null}
      {mapError ? <div className="map-error" role="status">{mapError}</div> : null}
      {curvatureStatus === "loading" ? <div className="map-layer-status" role="status">Loading curve overlay…</div> : null}
      {curvatureStatus === "zoom" ? <div className="map-layer-status">Zoom in to see curve data</div> : null}
      {curvatureStatus === "error" ? <div className="map-layer-status map-layer-error" role="status">Curve overlay unavailable</div> : null}
      {unpavedStatus === "loading" ? <div className="map-layer-status unpaved-status" role="status">Loading official PA gravel roads…</div> : null}
      {unpavedStatus === "error" ? <div className="map-layer-status map-layer-error unpaved-status" role="status">PA gravel overlay unavailable</div> : null}
      {riderFeaturesStatus === "loading" ? (
        <div className="map-layer-status map-feature-banner" role="status" aria-live="polite">
          <span className="map-layer-spinner" aria-hidden="true" />
          <span>Loading map layers…</span>
        </div>
      ) : null}
      {riderFeaturesStatus === "zoom" ? (
        <div className="map-layer-status map-feature-banner" role="status">
          <span>Zoom in to load selected layers</span>
        </div>
      ) : null}
      {riderFeaturesStatus === "error" ? (
        <div className="map-layer-status map-layer-error map-feature-banner" role="alert">
          <span>Map layers unavailable</span>
          <button type="button" className="map-feature-retry" onClick={() => setRiderFeaturesRetry((value) => value + 1)}>Retry</button>
        </div>
      ) : null}
      {props.rideMode && navigationFrame ? (
        <button
          type="button"
          className={`ride-map-recenter${navigationFollowing ? " is-following" : ""}`}
          aria-label="Recenter map on current location"
          aria-pressed={navigationFollowing}
          onClick={() => {
            navigationFollowingRef.current = true
            setNavigationFollowing(true)
            const map = mapRef.current
            if (map && navigationFrame) followNavigationFrame(map, navigationFrame, true)
          }}
        >
          <Crosshair weight="bold" aria-hidden="true" />
          <span>{navigationFollowing ? "Following" : "Recenter"}</span>
        </button>
      ) : null}
      {!props.rideMode ? <MapStageLayerControl
        sketchMode={sketchMode}
        avoidMode={avoidMode}
        mapStyle={props.mapStyle}
        riderLayers={props.riderLayers}
        routeVisibility={props.routeVisibility}
        mapPacks={props.mapPacks}
        unpavedStatus={unpavedStatus}
        unpavedCount={unpavedCount}
        riderLayerStates={riderLayerStates}
        riderLayerCounts={riderLayerCounts}
        onRetryRiderLayers={() => setRiderFeaturesRetry((value) => value + 1)}
        referenceMap={props.referenceMap}
        referenceMessage={referenceMessage}
        onToggleSketch={() => {
          if (sketchMode) cancelSketch()
          else {
            setSketchMode(true)
            setSketchMessage("")
            propsRef.current.onSketchModeChange(true)
          }
        }}
        onToggleAvoid={() => {
          if (avoidMode) cancelAvoidArea()
          else {
            if (sketchMode) cancelSketch()
            setAvoidMode(true)
            propsRef.current.onSketchModeChange(true)
          }
        }}
        onMapStyleChange={props.onMapStyleChange}
        onRiderLayerChange={props.onRiderLayerChange}
        onMoveRiderLayer={props.onMoveRiderLayer}
        onRouteVisibilityChange={props.onRouteVisibilityChange}
        onSaveMapPack={props.onSaveMapPack}
        onApplyMapPack={props.onApplyMapPack}
        onReferenceFile={handleReferenceFile}
        onReferenceMapChange={props.onReferenceMapChange}
        onAlignReferenceToView={alignReferenceToView}
        onRemoveReferenceMap={removeReferenceMap}
      /> : null}
      {sketchMode && !props.rideMode ? (
        <div
          className="map-sketch-surface"
          role="region"
          aria-label="Draw a rough route"
          onPointerDown={beginSketch}
          onPointerMove={continueSketch}
          onPointerUp={finishSketch}
          onPointerCancel={cancelSketch}
        >
          <svg className="map-sketch-line" aria-hidden="true">
            <polyline points={sketchPoints.map((point) => `${point.x},${point.y}`).join(" ")} />
          </svg>
          <div className="map-sketch-instructions" aria-live="polite">
            <strong>Draw the road you mean</strong>
            <span>{sketchMessage || "Drag one line through the roads or areas you want to ride."}</span>
            <small>Switchback will snap it to legal roads and keep the shaping stops editable.</small>
          </div>
        </div>
      ) : null}
      {avoidMode && !props.rideMode ? (
        <div
          className="map-sketch-surface map-avoid-surface"
          role="region"
          aria-label="Draw an avoid area"
          onPointerDown={beginAvoidArea}
          onPointerMove={continueAvoidArea}
          onPointerUp={finishAvoidArea}
          onPointerCancel={cancelAvoidArea}
        >
          {avoidStart && avoidEnd ? (
            <div
              className="map-avoid-preview"
              aria-hidden="true"
              style={{
                left: Math.min(avoidStart.x, avoidEnd.x),
                top: Math.min(avoidStart.y, avoidEnd.y),
                width: Math.abs(avoidEnd.x - avoidStart.x),
                height: Math.abs(avoidEnd.y - avoidStart.y)
              }}
            />
          ) : null}
          <div className="map-sketch-instructions" aria-live="polite">
            <strong>Draw a closed road or area</strong>
            <span>Drag a box around a closure, private road, or area you do not want to ride.</span>
            <small>Switchback will ask the routing engine to avoid roads inside it.</small>
          </div>
        </div>
      ) : null}
      {props.armedPoint || props.addingVia ? (
        <div className="map-crosshair" aria-hidden="true">
          <span />
          <small>{props.addingVia ? "Place stop" : `Place ${props.armedPoint}`}</small>
        </div>
      ) : null}
      {!props.rideMode && !sketchMode && !avoidMode ? (
        <button
          type="button"
          className={`map-layers-button map-road-lock-toggle${lockDrawMode ? " is-active" : ""}`}
          aria-label={lockDrawMode ? "Cancel drawing a road lock" : "Lock a road corridor"}
          aria-pressed={lockDrawMode}
          onClick={() => {
            if (lockDrawMode) resetLockDraft()
            else beginLockDraft()
          }}
        >
          <Lock weight="bold" aria-hidden="true" />
          <span>{lockDrawMode ? "Cancel" : "Lock a road"}</span>
        </button>
      ) : null}
      {lockDrawMode && !props.rideMode ? (
        <div
          className="map-road-lock-panel"
          role="region"
          aria-label="Road lock draft"
        >
          <header>
            <strong>
              {lockDraftStep === "first" ? "Tap the start of the corridor"
                : lockDraftStep === "second" ? "Tap the end of the corridor"
                : "Name and save this lock"}
            </strong>
            <button
              type="button"
              className="icon-tool"
              aria-label="Cancel road lock draft"
              onClick={resetLockDraft}
            >
              <X aria-hidden="true" />
            </button>
          </header>
          <span className="map-road-lock-status" aria-live="polite">
            {lockDraftMessage
              || (lockAnchors.length === 0
                ? "Pick two points along the road you want to ride."
                : `${lockAnchors.length} anchor${lockAnchors.length === 1 ? "" : "s"} placed`)}
          </span>
          {lockDraftStep === "naming" ? (
            <>
              <fieldset
                className="map-road-lock-mode-picker"
                aria-label="Road lock mode"
                role="radiogroup"
              >
                {featureFlags.roadRequirements ? (
                  <label className={`map-road-lock-mode-option${lockMode === "must" ? " is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="road-lock-mode"
                      value="must"
                      checked={lockMode === "must"}
                      onChange={() => setLockMode("must")}
                    />
                    Must use
                  </label>
                ) : null}
                <label className={`map-road-lock-mode-option${lockMode === "prefer" ? " is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="road-lock-mode"
                    value="prefer"
                    checked={lockMode === "prefer"}
                    onChange={() => setLockMode("prefer")}
                  />
                  Prefer
                </label>
              </fieldset>
              {!featureFlags.roadRequirements ? (
                <p className="map-road-lock-experimental-note">
                  Experimental: this road is matched approximately to your saved corridor and
                  cannot be honored exactly yet.
                </p>
              ) : null}
              <label className="map-road-lock-name">
                <span>Name (optional)</span>
                <input
                  type="text"
                  value={lockName}
                  placeholder="Best section of PA-125"
                  maxLength={120}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setLockName(event.currentTarget.value)}
                />
              </label>
              <button
                type="button"
                className="map-road-lock-save"
                onClick={commitLockDraft}
                aria-label="Save road lock"
              >
                Save lock
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
