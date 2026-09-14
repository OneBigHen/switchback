"use client"

import { useCallback, useState, useSyncExternalStore } from "react"
import { isPremiumMapboxRendererEnabled } from "@/lib/client/mapbox-config"
import type { MapStageProps } from "./map-stage-props"
import { MapboxMapStage } from "./MapboxMapStage"
import { PlannerMapStage } from "./PlannerMapStage"
import { maplibreRenderer } from "./planner-map-renderer"

export type { MapStageProps }

const MAPBOX_FALLBACK_SESSION_KEY = "switchback.mapbox-fallback"

function hasSessionMapboxFallback(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.sessionStorage.getItem(MAPBOX_FALLBACK_SESSION_KEY) === "1"
  } catch {
    return false
  }
}

function rememberSessionMapboxFallback(): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(MAPBOX_FALLBACK_SESSION_KEY, "1")
  } catch {
    // A storage policy must not prevent the in-memory renderer fallback.
  }
}

type MapRendererSelection = "pending" | "mapbox" | "maplibre"

function subscribeToMapRendererSelection(): () => void {
  return () => {}
}

function browserMapRendererSelection(): Exclude<MapRendererSelection, "pending"> {
  return isPremiumMapboxRendererEnabled() && !hasSessionMapboxFallback()
    ? "mapbox"
    : "maplibre"
}

function serverMapRendererSelection(): MapRendererSelection {
  // Session storage does not exist during SSR. Keep the server and hydration
  // markup renderer-neutral, then choose the browser renderer after hydration.
  return "pending"
}

/**
 * The planner's map. Which renderer draws it is a deployment decision, not a
 * component decision: the premium Mapbox renderer is used only when the
 * rollout flag is on *and* a browser-authorized token exists, and MapLibre
 * remains the rollback path until the premium wave's acceptance passes
 * (ADR 0015).
 */
export function MapStage(props: MapStageProps) {
  const [fallbackRequested, setFallbackRequested] = useState(false)
  const rendererSelection = useSyncExternalStore(
    subscribeToMapRendererSelection,
    browserMapRendererSelection,
    serverMapRendererSelection
  )
  const useMapbox = rendererSelection === "mapbox" && !fallbackRequested
  const handleRendererFailure = useCallback(() => {
    if (!useMapbox) return
    rememberSessionMapboxFallback()
    setFallbackRequested(true)
  }, [useMapbox])

  if (rendererSelection === "pending") {
    return <div className="map-stage map-stage-hydrating" aria-label="Interactive route map" />
  }

  return useMapbox
    ? <MapboxMapStage {...props} onRendererFailure={handleRendererFailure} />
    : <PlannerMapStage {...props} renderer={maplibreRenderer} />
}
