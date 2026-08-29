"use client"

import { isPremiumMapboxRendererEnabled } from "@/lib/client/mapbox-config"
import type { MapStageProps } from "./map-stage-props"
import { MapboxMapStage } from "./MapboxMapStage"
import { PlannerMapStage } from "./PlannerMapStage"
import { maplibreRenderer } from "./planner-map-renderer"

export type { MapStageProps }

/**
 * The planner's map. Which renderer draws it is a deployment decision, not a
 * component decision: the premium Mapbox renderer is used only when the
 * rollout flag is on *and* a browser-authorized token exists, and MapLibre
 * remains the rollback path until the premium wave's acceptance passes
 * (ADR 0015).
 */
export function MapStage(props: MapStageProps) {
  return isPremiumMapboxRendererEnabled()
    ? <MapboxMapStage {...props} />
    : <PlannerMapStage {...props} renderer={maplibreRenderer} />
}
