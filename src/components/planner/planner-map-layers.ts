import type { FilterSpecification, LayerSpecification } from "maplibre-gl"
import type { PlannerMap, PlannerMapRenderer } from "./planner-map-renderer"
import type { MapExperienceConfig } from "@/lib/client/map-experience"

export const ROAD_LOCK_LINE_LAYER = "switchback-road-lock-lines"
export const ROAD_LOCK_UNRESOLVED_LINE_LAYER = "switchback-road-lock-lines-unresolved"
export const ROUTE_HIT_LAYER = "switchback-route-hit-area"

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

/**
 * The premium route ribbon: one geometry drawn as a stack so the selected
 * route reads as a physical object on the map rather than a coloured line.
 * Preview is deliberately less dominant than selection but materially wider
 * and more opaque than an alternate, so state is not encoded by color alone.
 */
export function routeRibbonLayers(
  renderer: PlannerMapRenderer,
  experience: MapExperienceConfig,
  routeVisibility: "standard" | "high-contrast" = "standard"
): LayerSpecification[] {
  const bright = experience.routeEmphasis === "bright"
  const ride = experience.surface === "ride"
  const boost = routeVisibility === "high-contrast" ? 2 : 0
  const accent = bright ? "#FF7A34" : "#F36A2D"
  const previewAccent = bright ? "#F1A266" : "#D88B55"
  const alternate = bright ? "#DCE3E6" : "#8A938E"
  const casing = bright ? "#050706" : "#090B0A"
  const emissive = (selected: number, other: number) =>
    renderer.supportsEmissiveStrength
      ? { "line-emissive-strength": ["case", ["get", "selected"], selected, other] }
      : {}

  return [
    {
      id: "switchback-route-shadow",
      type: "line",
      source: "switchback-routes",
      filter: ["get", "selected"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#000000",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 8, 14, 18],
        "line-blur": 6,
        "line-opacity": ["case", ["get", "traversed"], 0.06, bright ? 0.34 : 0.22]
      }
    },
    {
      id: "switchback-route-casing",
      type: "line",
      source: "switchback-routes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": casing,
        "line-width": ["case",
          ["get", "selected"], (ride ? 11 : 10) + boost,
          ["get", "previewed"], 8 + boost * 0.8,
          5.5 + boost * 0.6
        ],
        "line-opacity": ["case",
          ["get", "traversed"], 0.3,
          ["get", "selected"], 0.9,
          ["get", "previewed"], 0.82,
          0.72
        ],
        ...emissive(0.35, 0.2)
      }
    },
    {
      id: "switchback-route-lines",
      type: "line",
      source: "switchback-routes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["case",
          ["get", "traversed"], "#5a5e5b",
          ["get", "selected"], accent,
          ["get", "previewed"], previewAccent,
          alternate
        ],
        "line-width": ["case",
          ["get", "selected"], (ride ? 7 : 6) + boost,
          ["get", "previewed"], 4.6 + boost * 0.7,
          2.8 + boost * 0.6
        ],
        "line-opacity": ["case",
          ["get", "traversed"], 0.32,
          ["get", "selected"], 1,
          ["get", "previewed"], 0.94,
          bright ? 0.82 : 0.66
        ],
        ...emissive(1, 0.55)
      }
    },
    {
      id: ROUTE_HIT_LAYER,
      type: "line",
      source: "switchback-routes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        // Nearly transparent rather than zero: MapLibre still considers the
        // geometry queryable while the visible ribbon keeps its real weight.
        "line-color": "#000000",
        "line-opacity": 0.01,
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 22, 14, 34]
      }
    }
  ] as LayerSpecification[]
}

/**
 * Road character, not a diagnostic overlay: a thin highlight whose weight and
 * opacity follow how curvy the road actually is, so the great roads read as
 * texture on the map instead of dashes competing with the route.
 */
export function roadCharacterLayer(
  renderer: PlannerMapRenderer,
  experience: MapExperienceConfig,
  /** The rider's own opacity for this layer, from the layers panel. */
  layerOpacity = 1
): LayerSpecification {
  const bright = experience.routeEmphasis === "bright"
  const fade = Math.max(0, Math.min(1, layerOpacity))
  return {
    id: "switchback-curvature-lines",
    type: "line",
    source: "switchback-curvature",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["interpolate", ["linear"], ["get", "curvature"],
        650, bright ? "#8FB9C9" : "#7FA3B4",
        1500, bright ? "#FFC46B" : "#E8933A"
      ],
      "line-width": ["interpolate", ["linear"], ["zoom"],
        7, ["interpolate", ["linear"], ["get", "curvature"], 650, 1, 1500, 2.4],
        13, ["interpolate", ["linear"], ["get", "curvature"], 650, 2.5, 1500, 6]
      ],
      "line-opacity": ["interpolate", ["linear"], ["get", "curvature"],
        650, 0.35 * fade,
        1500, 0.85 * fade
      ],
      ...(renderer.supportsEmissiveStrength ? { "line-emissive-strength": 0.7 } : {})
    }
  } as LayerSpecification
}

/**
 * Re-applies a layer spec's paint to a live map. A change of experience
 * changes colour, weight, and emissive strength but never the layer's
 * identity or its slot, so the layers are repainted rather than rebuilt —
 * rebuilding them would drop their data for a frame.
 */
export function repaintLayer(map: PlannerMap, spec: LayerSpecification): void {
  if (!map.getLayer(spec.id)) return
  const paint = (spec as { paint?: Record<string, unknown> }).paint ?? {}
  for (const [property, value] of Object.entries(paint)) {
    map.setPaintProperty(spec.id, property as never, value as never)
  }
}
