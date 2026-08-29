"use client"

import { Crosshair, Lock, X } from "@phosphor-icons/react"
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type ReactElement, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import {
  getRideMapControlSlot,
  subscribeRideMapControlSlot
} from "./ride-map-control-slot"
import { buildWaypointFeatures, emptyFeatureCollection } from "@/lib/client/map-data"
import { buildNavigationMapFeatures } from "@/lib/client/navigation-map"
import "@/app/styles/map-stage-road-locks.css"
import {
  type RiderLayerId,
  shouldShowBaseMapFailure
} from "@/lib/client/map-layers"
import type { MapStageProps } from "./map-stage-props"
import type { PlannerMap, PlannerMapRenderer } from "./planner-map-renderer"
import { roadLockDashPaint, roadLockLineFilter, roadLockLineLayerIds } from "./planner-map-layers"
import { featureFlags } from "@/lib/domain/feature-flags"
import { setMapRuntimeProbe, setRouteRuntimeMetrics } from "@/lib/client/runtime-diagnostics"
import { usePlannerStore } from "@/stores/planner-store"
import { useNavigationFrame } from "@/stores/navigation-store"
import { fitSelectedRoute, followNavigationFrame } from "./map-stage-navigation"
import {
  addRiderMapLayers,
  geoJsonSource,
  updatePlannerSources,
  updateReferenceMapSource,
  updateRiderMapLayerPresentation
} from "./map-stage-sources"
import { useRiderFeatureLayers } from "./workspace/use-rider-feature-layers"
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

type LiveMapProps = PlannerMapStageProps

export interface PlannerMapStageProps extends MapStageProps {
  renderer: PlannerMapRenderer
}

interface SketchScreenPoint {
  x: number
  y: number
}

/**
 * The ride HUD owns where the lower ride surface sits, so the recenter control
 * renders into its slot. Until the slot exists (any surface that is not an
 * active ride) the control falls back to its own absolute placement over the
 * map, which is what every non-ride surface already expects.
 */
function renderIntoRideDeck(control: ReactElement, slot: HTMLElement | null) {
  return slot ? createPortal(control, slot) : control
}

export function PlannerMapStage(props: PlannerMapStageProps) {
  const renderer = props.renderer
  const storedNavigationFrame = useNavigationFrame()
  const navigationFrame = props.navigationFrame ?? storedNavigationFrame
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<PlannerMap | null>(null)
  const styleTimeoutRef = useRef<number | null>(null)
  const propsRef = useRef<LiveMapProps>(props)
  const navigationFollowingRef = useRef(true)

  // The HUD publishes its slot element through a shared registry (a ref on the
  // slot div), so the control follows the slot across HUD remounts — the HUD is
  // keyed by route id, and an accepted rejoin replaces it mid-ride. Until a
  // slot is published (any surface that is not an active ride) the control
  // falls back to its own absolute placement over the map.
  const rideDeckSlot = useSyncExternalStore(
    subscribeRideMapControlSlot,
    getRideMapControlSlot,
    () => null
  )
  const sketchPointsRef = useRef<SketchScreenPoint[]>([])
  const sketchDrawingRef = useRef(false)
  const avoidDrawingRef = useRef(false)
  const [readyStyleKey, setReadyStyleKey] = useState<string | null>(null)
  const [mapError, setMapError] = useState("")
  const [navigationFollowing, setNavigationFollowing] = useState(true)
  const [sketchMode, setSketchMode] = useState(false)
  const [avoidMode, setAvoidMode] = useState(false)
  const [avoidStart, setAvoidStart] = useState<SketchScreenPoint | null>(null)
  const [avoidEnd, setAvoidEnd] = useState<SketchScreenPoint | null>(null)
  const [sketchPoints, setSketchPoints] = useState<SketchScreenPoint[]>([])
  const [sketchMessage, setSketchMessage] = useState("")
  const roadLocks = usePlannerStore((state) => state.roadLocks)
  const addRoadLock = usePlannerStore((state) => state.addRoadLock)
  const sheetDetentOverride = usePlannerStore((state) => state.sheetDetentOverride)
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
  const styleKey = renderer.styleKey(props.mapStyle)
  const ready = readyStyleKey === styleKey
  const {
    curvatureStatus,
    unpavedStatus,
    unpavedCount,
    riderFeaturesStatus,
    riderLayerStates,
    riderLayerCounts,
    retryRiderFeatures
  } = useRiderFeatureLayers(mapRef, ready, propsRef, {
    curvatureVisible: props.curvatureVisible,
    unpavedVisible: props.unpavedVisible,
    riderLayers: props.riderLayers
  })
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
    let map: PlannerMap | null = null
    let releaseMapProbe: (() => void) | null = null
    let initialStyleLoaded = false
    const container = containerRef.current
    if (!container) return
    const initialStart = propsRef.current.start
    void renderer.create({
      container,
      mapStyle: props.mapStyle,
      center: initialStart ? [initialStart.lon, initialStart.lat] : [-98.5795, 39.8283],
      zoom: initialStart ? 10.5 : 3.8,
      onLocateMe: (point) => propsRef.current.onLocateMe?.(point)
    }).then((created) => {
      if (disposed) {
        created.remove()
        return
      }
      map = created
      mapRef.current = map
      releaseMapProbe = setMapRuntimeProbe(() => {
        const style = map?.getStyle()
        return {
          sourceCount: style ? Object.keys(style.sources ?? {}).length : 0,
          layerCount: style?.layers?.length ?? 0
        }
      })
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
        renderer.addLayer(map, {
          id: "switchback-route-casing",
          type: "line",
          source: "switchback-routes",
          paint: {
            "line-color": "#090B0A",
            "line-width": ["case", ["get", "selected"], 9, 5],
            "line-opacity": ["case", ["get", "traversed"], 0.3, 0.9]
          },
          layout: { "line-cap": "round", "line-join": "round" }
        }, { slot: "top" })
        renderer.addLayer(map, {
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
        }, { slot: "top" })
        map.addSource("switchback-route-labels", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        renderer.addLayer(map, {
          id: "switchback-route-labels",
          type: "symbol",
          source: "switchback-route-labels",
          filter: ["!", ["get", "selected"]],
          layout: {
            "text-field": ["get", "label"],
            "text-size": 11,
            "text-font": renderer.boldFont,
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
        }, { slot: "top" })
        renderer.addLayer(map, {
          id: "switchback-route-label-selected",
          type: "symbol",
          source: "switchback-route-labels",
          filter: ["get", "selected"],
          layout: {
            "text-field": ["get", "label"],
            "text-size": 12,
            "text-font": renderer.boldFont,
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
        }, { slot: "top" })
        map.addSource("switchback-navigation", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        renderer.addLayer(map, {
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
        }, { slot: "top" })
        renderer.addLayer(map, {
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
        }, { slot: "top" })
        renderer.addLayer(map, {
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
        }, { slot: "critical" })
        renderer.addLayer(map, {
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
        }, { slot: "critical" })
        renderer.addLayer(map, {
          id: "switchback-navigation-heading",
          type: "symbol",
          source: "switchback-navigation",
          filter: ["==", ["get", "kind"], "rider-position"],
          layout: {
            "text-field": "▲",
            "text-font": renderer.boldFont,
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
        }, { slot: "critical" })
        map.addSource("switchback-unpaved", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        renderer.addLayer(map, {
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
        }, { slot: "middle", beforeId: "switchback-route-casing" })
        map.addSource("switchback-curvature", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        renderer.addLayer(map, {
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
        }, { slot: "middle", beforeId: "switchback-route-casing" })
        addRiderMapLayers(map, renderer)
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
        // An unresolved lock is drawn dashed. `line-dasharray` is data-driven
        // in MapLibre but constant in Mapbox, so the renderers that cannot
        // express it get a second filtered layer rather than a lost signal.
        for (const id of roadLockLineLayerIds(renderer)) {
          renderer.addLayer(map, {
            id,
            type: "line",
            source: "switchback-road-locks",
            ...roadLockLineFilter(renderer, id),
            paint: {
              "line-color": ["get", "color"],
              "line-width": ["case", ["get", "selected"], 6, 4],
              "line-opacity": ["case", ["get", "unresolved"], 0.7, 1],
              ...roadLockDashPaint(renderer, id)
            },
            layout: { "line-cap": "round", "line-join": "round" }
          }, { slot: "top", beforeId: "switchback-route-casing" })
        }
        renderer.addLayer(map, {
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
        }, { slot: "top", beforeId: "switchback-route-casing" })
        renderer.addLayer(map, {
          id: "switchback-road-lock-anchors",
          type: "circle",
          source: "switchback-road-lock-anchors",
          paint: {
            "circle-radius": ["case", ["get", "selected"], 9, 7],
            "circle-color": "#FFFFFF",
            "circle-stroke-color": ["case", ["get", "selected"], "#F36A2D", "#949C97"],
            "circle-stroke-width": ["case", ["get", "selected"], 4, 3]
          }
        }, { slot: "top" })
        for (const layerId of roadLockLineLayerIds(renderer)) {
          map.on("mouseenter", layerId, () => {
            map!.getCanvas().style.cursor = "pointer"
          })
          map.on("mouseleave", layerId, () => {
            map!.getCanvas().style.cursor = ""
          })
          map.on("click", layerId, (event) => {
            const id = event.features?.[0]?.properties?.id
            if (typeof id === "string") {
              setHighlightedLockId((current) => (current === id ? null : id))
            }
          })
        }
        map.addSource("switchback-waypoints", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        map.addSource("switchback-avoid-areas", {
          type: "geojson",
          data: emptyFeatureCollection()
        })
        renderer.addLayer(map, {
          id: "switchback-avoid-area-fill",
          type: "fill",
          source: "switchback-avoid-areas",
          paint: { "fill-color": "#C84432", "fill-opacity": 0.16 }
        }, { slot: "middle", beforeId: "switchback-route-casing" })
        renderer.addLayer(map, {
          id: "switchback-avoid-area-outline",
          type: "line",
          source: "switchback-avoid-areas",
          paint: { "line-color": "#C84432", "line-width": 2.5, "line-dasharray": [1.3, 1] }
        }, { slot: "middle", beforeId: "switchback-route-casing" })
        renderer.addLayer(map, {
          id: "switchback-waypoint-rings",
          type: "circle",
          source: "switchback-waypoints",
          paint: {
            "circle-radius": ["case", ["==", ["get", "kind"], "via"], 10, 12],
            "circle-color": ["case", ["==", ["get", "kind"], "finish"], "#F36A2D", ["==", ["get", "kind"], "via"], "#FFFFFF", "#242321"],
            "circle-stroke-color": "#0B0E0D",
            "circle-stroke-width": 4
          }
        }, { slot: "top" })
        renderer.addLayer(map, {
          id: "switchback-waypoint-labels",
          type: "symbol",
          source: "switchback-waypoints",
          layout: {
            "text-field": ["get", "marker"],
            "text-size": 11,
            "text-font": renderer.boldFont
          },
          paint: {
            "text-color": ["case", ["==", ["get", "kind"], "start"], "#FFFFFF", "#0B0E0D"]
          }
        }, { slot: "top" })
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
        updateReferenceMapSource(map, propsRef.current.referenceMap, renderer)
        setReadyStyleKey(styleKey)
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
      releaseMapProbe?.()
      setReadyStyleKey(null)
      map?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey])

  // Mapbox Standard expresses day/night and Ride Focus as style configuration
  // on the same map instance, so a mode change costs no extra map load. The
  // MapLibre adapter carries its presentation in the style and no-ops here.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    renderer.applyExperience(map, props.mapStyle, props.rideMode ? "ride" : "planning")
  }, [renderer, props.mapStyle, props.rideMode, ready])

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
    fitSelectedRoute(map, { ...current, sheetDetent: sheetDetentOverride ?? undefined })
    // Re-fit when the sheet detent changes: the visible map region grows or
    // shrinks with the ContextSheet, and the route must fit what is visible.
  }, [props.routes, props.selectedRouteId, props.start, props.finish, props.via, props.avoidAreas, props.rideMode, ready, sheetDetentOverride])

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
      renderer.addLayer(map, {
        id: "switchback-recording-trail-line",
        type: "line",
        source: "switchback-recording-trail",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#FF3B24",
          "line-width": 4,
          "line-opacity": 0.9
        }
      }, { slot: "top" })
    }
    if (!map.getLayer("switchback-recording-head")) {
      renderer.addLayer(map, {
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
      }, { slot: "critical" })
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
  }, [props.recordingTrail, props.rideMode, ready, renderer])

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
    updateReferenceMapSource(map, props.referenceMap, renderer)
  }, [props.referenceMap, ready, renderer])

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
    updateRiderMapLayerPresentation(map, props.riderLayers, renderer)
    map.setPaintProperty(
      "switchback-route-lines",
      "line-width",
      props.routeVisibility === "high-contrast"
        ? ["case", ["get", "selected"], 6.5, 3.5]
        : ["case", ["get", "selected"], 5, 2.5]
    )
  }, [props.riderLayers, props.curvatureVisible, props.unpavedVisible, props.routeVisibility, ready, renderer])

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
          <button type="button" className="map-feature-retry" onClick={retryRiderFeatures}>Retry</button>
        </div>
      ) : null}
      {props.rideMode && navigationFrame ? renderIntoRideDeck(
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
        </button>,
        rideDeckSlot
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
        onRetryRiderLayers={retryRiderFeatures}
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
