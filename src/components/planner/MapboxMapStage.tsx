"use client"

import type { MapStageProps } from "./map-stage-props"
import { PlannerMapStage } from "./PlannerMapStage"
import { mapboxRenderer } from "./planner-map-renderer"

/**
 * The premium renderer's entry point (ADR 0015). It is the same planner stage
 * driven by the Mapbox adapter, so the two renderers cannot drift apart while
 * both exist; phase 11 removes the MapLibre adapter and this wrapper becomes
 * the only stage.
 */
export function MapboxMapStage(props: MapStageProps) {
  return <PlannerMapStage {...props} renderer={mapboxRenderer} />
}
