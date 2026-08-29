import type { FilterSpecification } from "maplibre-gl"
import type { PlannerMapRenderer } from "./planner-map-renderer"

export const ROAD_LOCK_LINE_LAYER = "switchback-road-lock-lines"
export const ROAD_LOCK_UNRESOLVED_LINE_LAYER = "switchback-road-lock-lines-unresolved"

/**
 * A road lock is drawn solid when it matched the routing graph and dashed
 * when it is only approximate. MapLibre expresses that in one layer with a
 * data-driven `line-dasharray`; Mapbox does not support data-driven dashes,
 * so it gets two filtered layers instead of losing the distinction.
 */
export function roadLockLineLayerIds(renderer: PlannerMapRenderer): string[] {
  return renderer.supportsDataDrivenDash
    ? [ROAD_LOCK_LINE_LAYER]
    : [ROAD_LOCK_LINE_LAYER, ROAD_LOCK_UNRESOLVED_LINE_LAYER]
}

export function roadLockLineFilter(
  renderer: PlannerMapRenderer,
  layerId: string
): { filter?: FilterSpecification } {
  if (renderer.supportsDataDrivenDash) return {}
  return layerId === ROAD_LOCK_UNRESOLVED_LINE_LAYER
    ? { filter: ["==", ["get", "unresolved"], true] }
    : { filter: ["!=", ["get", "unresolved"], true] }
}

export function roadLockDashPaint(
  renderer: PlannerMapRenderer,
  layerId: string
): Record<string, unknown> {
  if (renderer.supportsDataDrivenDash) {
    return {
      "line-dasharray": ["case", ["get", "unresolved"], ["literal", [2, 1.5]], ["literal", [1, 0]]]
    }
  }
  return layerId === ROAD_LOCK_UNRESOLVED_LINE_LAYER ? { "line-dasharray": [2, 1.5] } : {}
}
