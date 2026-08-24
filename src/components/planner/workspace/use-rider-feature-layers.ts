"use client"

import type { FeatureCollection } from "geojson"
import type { RefObject } from "react"
import type { Map as MapLibreMap } from "maplibre-gl"
import { useEffect, useRef, useState } from "react"
import { emptyFeatureCollection } from "@/lib/client/map-data"
import {
  featureMapLayerIds,
  paUnpavedRoadsQuery,
  riderFeatureLayersAtZoom,
  riderFeatureQuery,
  type FeatureLayerState,
  type RiderLayerId,
  type RiderLayerSetting
} from "@/lib/client/map-layers"
import { geoJsonSource, RIDER_FEATURE_SOURCE } from "../map-stage-sources"

/**
 * Live props the layer controllers read at event time (through a ref, so
 * moveend handlers see current values without re-binding). Mirrors the
 * fields the pre-extraction MapStage effects consumed.
 */
export interface RiderFeatureLiveProps {
  curvatureVisible: boolean
  unpavedVisible: boolean
  riderLayers: RiderLayerSetting[]
  rideMode: boolean
}

export interface RiderFeatureLayersController {
  curvatureStatus: "hidden" | "loading" | "ready" | "zoom" | "error"
  unpavedStatus: "hidden" | "loading" | "ready" | "zoom" | "error"
  unpavedCount: number
  riderFeaturesStatus: "hidden" | "loading" | "ready" | "zoom" | "error"
  riderLayerStates: Record<string, FeatureLayerState>
  riderLayerCounts: Record<string, number>
  retryRiderFeatures(): void
}

/**
 * Owns fetching and status reporting for the three data-driven rider layers:
 * high-curvature roads, official PA unpaved roads, and OSM rider feature
 * layers. Verbatim extraction of the MapStage effect cluster so the map
 * component composes concerns instead of containing them.
 */
export function useRiderFeatureLayers(
  mapRef: RefObject<MapLibreMap | null>,
  ready: boolean,
  live: RefObject<RiderFeatureLiveProps>,
  deps: {
    curvatureVisible: boolean
    unpavedVisible: boolean
    riderLayers: RiderLayerSetting[]
  }
): RiderFeatureLayersController {
  const [curvatureStatus, setCurvatureStatus] = useState<"hidden" | "loading" | "ready" | "zoom" | "error">("hidden")
  const [unpavedStatus, setUnpavedStatus] = useState<"hidden" | "loading" | "ready" | "zoom" | "error">("hidden")
  const [unpavedCount, setUnpavedCount] = useState(0)
  const [riderFeaturesStatus, setRiderFeaturesStatus] = useState<"hidden" | "loading" | "ready" | "zoom" | "error">("hidden")
  const [riderLayerStates, setRiderLayerStates] = useState<Record<string, FeatureLayerState>>({})
  const [riderLayerCounts, setRiderLayerCounts] = useState<Record<string, number>>({})
  const [riderFeaturesRetry, setRiderFeaturesRetry] = useState(0)
  const curvatureAbortRef = useRef<AbortController | null>(null)
  const unpavedAbortRef = useRef<AbortController | null>(null)
  const riderFeaturesAbortRef = useRef<AbortController | null>(null)

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
      if (!live.current?.curvatureVisible || map.getZoom() < 7) {
        if (!isCurrent(version)) return
        geoJsonSource(map, "switchback-curvature")?.setData(emptyFeatureCollection())
        setCurvatureStatus(live.current?.curvatureVisible ? "zoom" : "hidden")
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
      if (!live.current?.rideMode) void refreshCurvature()
    }
    map.on("moveend", onMoveEnd)
    void refreshCurvature()
    return () => {
      disposed = true
      requestVersion += 1
      map.off("moveend", onMoveEnd)
      curvatureAbortRef.current?.abort()
    }
  }, [deps.curvatureVisible, ready, live, mapRef])

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
      const current = live.current
      if (!current?.unpavedVisible) {
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
      if (!live.current?.rideMode) void refreshUnpavedRoads()
    }
    map.on("moveend", onMoveEnd)
    void refreshUnpavedRoads()
    return () => {
      disposed = true
      requestVersion += 1
      map.off("moveend", onMoveEnd)
      unpavedAbortRef.current?.abort()
    }
  }, [deps.unpavedVisible, ready, live, mapRef])

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
      const current = live.current
      const bounds = map.getBounds()
      const zoom = map.getZoom()
      const selectedLayers = riderFeatureLayersAtZoom(current?.riderLayers ?? [], zoom)
      const selectedSet = new Set<RiderLayerId>(selectedLayers)
      const visibleFeatureLayers = (current?.riderLayers ?? [])
        .filter((setting) => setting.visible && FEATURE_LAYER_SET.has(setting.id))
        .map((setting) => setting.id)
      const query = riderFeatureQuery(current?.riderLayers ?? [], {
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
      if (!live.current?.rideMode) void refreshRiderFeatures()
    }
    map.on("moveend", onMoveEnd)
    void refreshRiderFeatures()
    return () => {
      disposed = true
      requestVersion += 1
      map.off("moveend", onMoveEnd)
      riderFeaturesAbortRef.current?.abort()
    }
  }, [deps.riderLayers, ready, riderFeaturesRetry, live, mapRef])

  return {
    curvatureStatus,
    unpavedStatus,
    unpavedCount,
    riderFeaturesStatus,
    riderLayerStates,
    riderLayerCounts,
    retryRiderFeatures: () => setRiderFeaturesRetry((value) => value + 1)
  }
}
