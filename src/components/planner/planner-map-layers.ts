import type { FilterSpecification, LayerSpecification } from "maplibre-gl"
import type { PlannerMap, PlannerMapRenderer } from "./planner-map-renderer"
import type { MapExperienceConfig } from "@/lib/client/map-experience"

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

/**
 * The premium route ribbon: one geometry drawn as a stack so the selected
 * route reads as a physical object on the map rather than a coloured line.
 *
 * Order matters — shadow, then casing, then the accent core. Every layer sits
 * in the `top` slot so 3D buildings, trees, and terrain can never bury the
 * route, which is the one thing on the map the rider must always find.
 */
export function routeRibbonLayers(
  renderer: PlannerMapRenderer,
  experience: MapExperienceConfig,
  routeVisibility: "standard" | "high-contrast" = "standard"
): LayerSpecification[] {
  const bright = experience.routeEmphasis === "bright"
  const ride = experience.surface === "ride"
  // High contrast is the rider's own accessibility choice, so it widens the
  // ribbon on top of whatever the experience already asked for.
  const boost = routeVisibility === "high-contrast" ? 2 : 0
  // Imagery and night need a hotter accent than a pale paper basemap does.
  const accent = bright ? "#FF7A34" : "#F36A2D"
  const alternate = bright ? "#DCE3E6" : "#8A938E"
  const casing = bright ? "#050706" : "#090B0A"
  // Standard lighting dims unlit custom layers at dusk and night. Emissive
  // strength is what keeps the route as bright as it was at midday.
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
        "line-width": ["case", ["get", "selected"], (ride ? 11 : 10) + boost, 5.5 + boost * 0.6],
        "line-opacity": ["case", ["get", "traversed"], 0.3, 0.9],
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
          ["get", "selected"], accent, alternate
        ],
        "line-width": ["case", ["get", "selected"], (ride ? 7 : 6) + boost, 2.8 + boost * 0.6],
        // A traveled section stays visible but stops competing with what is
        // still ahead; an alternative stays readable without ever being
        // mistaken for the chosen route.
        "line-opacity": ["case",
          ["get", "traversed"], 0.32,
          ["get", "selected"], 1, bright ? 0.82 : 0.66
        ],
        ...emissive(1, 0.55)
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
      // The curvature score runs roughly 650 (the query floor) to 1500.
      "line-color": ["interpolate", ["linear"], ["get", "curvature"],
        650, bright ? "#8FB9C9" : "#7FA3B4",
        1500, bright ? "#FFC46B" : "#E8933A"
      ],
      "line-width": ["interpolate", ["linear"], ["zoom"],
        7, ["interpolate", ["linear"], ["get", "curvature"], 650, 1, 1500, 2.4],
        13, ["interpolate", ["linear"], ["get", "curvature"], 650, 2.5, 1500, 6]
      ],
      // Curvier roads are drawn more strongly, and the rider's own opacity
      // scales the whole range rather than flattening it.
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
