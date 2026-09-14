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

function subscribeToSessionMapboxFallback(): () => void {
  return () => {}
}

function noSessionMapboxFallback(): boolean {
  return false
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
  const sessionFallback = useSyncExternalStore(
    subscribeToSessionMapboxFallback,
    hasSessionMapboxFallback,
    noSessionMapboxFallback
  )
  const useMapbox = isPremiumMapboxRendererEnabled() && !fallbackRequested && !sessionFallback
  const handleRendererFailure = useCallback(() => {
    if (!useMapbox) return
    rememberSessionMapboxFallback()
    setFallbackRequested(true)
  }, [useMapbox])

  return useMapbox
    ? <MapboxMapStage {...props} onRendererFailure={handleRendererFailure} />
    : <PlannerMapStage {...props} renderer={maplibreRenderer} />
}
