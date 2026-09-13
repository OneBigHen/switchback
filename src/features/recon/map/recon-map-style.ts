import type {
  CircleLayerSpecification,
  LightSpecification,
  LineLayerSpecification,
  Map as MapLibreMap,
  SkySpecification,
} from "maplibre-gl";
import { mapStyleUrl } from "@/lib/client/map-layers";

/**
 * Recon style module.
 *
 * Hex constants are mapped 1:1 to the design tokens in
 * src/app/styles/tokens.css — Recon never invents a colour on the map. All
 * cinema comes from pitch, terrain, light, atmosphere, reduced clutter and
 * stronger route emphasis, never from new colours.
 */

export const RECON_COLORS = {
  /** var(--sb-ember) — current ride / selection. */
  ember: "#D65A36",
  /** var(--sb-signal) — preview / navigation. */
  signal: "#397C96",
  /** var(--sb-ink) */
  ink: "#161D1C",
  /** var(--sb-paper) */
  paper: "#FBF9F4",
  /** var(--sb-sage) — quiet ride history. */
  sage: "#9DA98F",
  /** var(--sb-moss) — quiet ride history. */
  moss: "#65745D",
  /** var(--sb-sandstone) — Gravel Atlas evidence. */
  sandstone: "#D8C8B7",
} as const;

/** Basemap: OpenFreeMap Liberty through the existing pre-premium style map. */
export const RECON_BASEMAP_STYLE_URL = mapStyleUrl("explorer");

/**
 * Shared camera truth. The map factory and the per-selection fit both read
 * this, so the explorer has one camera vocabulary.
 */
export const RECON_CAMERA = {
  center: [-77.5, 40.9] as [number, number],
  zoom: 6.8,
  /** Cinematic tilt, inside the required 55–65° band. */
  pitch: 58,
  /** Intentionally off-north so the field reads as terrain, not a diagram. */
  bearing: -18,
  maxPitch: 75,
};

/** Fit ceiling for a selected track; tight enough to stay ride-shaped. */
export const RECON_FIT_MAX_ZOOM = 13.5;
/** Camera animation length; reduced-motion users get 0 (see ReconMap). */
export const RECON_FIT_DURATION_MS = 900;

/**
 * Dash patterns are multiples of line width. Previews get a tight, regular
 * dash so playback kind is distinguishable by pattern as well as colour;
 * evidence gets a longer stride so the two dashed lines never read alike.
 */
export const PREVIEW_LINE_DASHARRAY = [1.2, 1.8] as const;
export const EVIDENCE_LINE_DASHARRAY = [3, 2] as const;

/** Restrained outer glow: wide blur, low opacity, subtle — never neon. */
export function selectedRouteGlowPaint(): LineLayerSpecification["paint"] {
  return {
    "line-color": RECON_COLORS.ember,
    "line-opacity": 0.26,
    "line-blur": 8,
    "line-width": ["interpolate", ["linear"], ["zoom"], 8, 12, 14, 26],
  };
}

/** Ink casing at half opacity keeps the route legible over imagery. */
export function selectedRouteCasingPaint(): LineLayerSpecification["paint"] {
  return {
    "line-color": RECON_COLORS.ink,
    "line-opacity": 0.5,
    "line-width": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 9],
  };
}

/** Recorded rides paint Ember — the strongest element on screen. */
export function selectedRecordedLinePaint(): LineLayerSpecification["paint"] {
  return {
    "line-color": RECON_COLORS.ember,
    "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3.5, 14, 6.5],
  };
}

/** Previews paint Signal and carry a dash so kind survives colour loss. */
export function selectedPreviewLinePaint(): LineLayerSpecification["paint"] {
  return {
    "line-color": RECON_COLORS.signal,
    "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3.5, 14, 6.5],
    "line-dasharray": [...PREVIEW_LINE_DASHARRAY],
  };
}

/** Start/end markers: paper-on-ember ring, ink-on-paper, as in phase 0. */
export function routeEndpointPaint(
  color: string,
  strokeColor: string,
): CircleLayerSpecification["paint"] {
  return {
    "circle-radius": 4.5,
    "circle-color": color,
    "circle-stroke-color": strokeColor,
    "circle-stroke-width": 2,
  };
}

/**
 * Ride history is clearly subordinate: thin (≈1.5–2 px) quiet lines. SAGE and
 * MOSS alternate per ride so overlapping history stays readable without
 * leaving the token palette.
 */
export function rideHistoryLinePaint(): LineLayerSpecification["paint"] {
  return {
    "line-color": [
      "match",
      ["get", "tone"],
      "moss",
      RECON_COLORS.moss,
      RECON_COLORS.sage,
    ],
    "line-opacity": 0.85,
    "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.5, 14, 2],
  };
}

/** Gravel evidence: SANDSTONE dashed lines drawn under the selected route. */
export function gravelEvidenceLinePaint(): LineLayerSpecification["paint"] {
  return {
    "line-color": RECON_COLORS.sandstone,
    "line-opacity": 0.9,
    "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 14, 4.5],
    "line-dasharray": [...EVIDENCE_LINE_DASHARRAY],
  };
}

/**
 * Atmospheric depth, from token colours only. The fog colour only matters
 * once terrain is enabled; without terrain the sky simply reads soft.
 */
function reconSky(): SkySpecification {
  return {
    "sky-color": RECON_COLORS.paper,
    "horizon-color": RECON_COLORS.sage,
    "fog-color": RECON_COLORS.paper,
    "fog-ground-blend": 0.5,
    "horizon-fog-blend": 0.08,
  };
}

/** Soft, high light so terrain relief reads without hard contrast. */
function reconLight(): LightSpecification {
  return {
    anchor: "map",
    color: RECON_COLORS.paper,
    intensity: 0.36,
    position: [1.15, 210, 30],
  };
}

/**
 * Reduced clutter: hide basemap POI symbols (OpenMapTiles-schema styles name
 * these layers "poi*"; anything unrecognised is left untouched) and apply the
 * sky and light. Every step degrades silently — a style change must never
 * break the explorer.
 */
export function applyReconAtmosphere(map: MapLibreMap): void {
  try {
    map.setSky(reconSky());
  } catch {
    // Style rejected the sky; the flat basemap still reads.
  }
  try {
    map.setLight(reconLight());
  } catch {
    // Style rejected the light; default basemap light still applies.
  }
  for (const layer of map.getStyle().layers) {
    if (layer.type !== "symbol") continue;
    if (!/(^|-)poi/.test(layer.id)) continue;
    try {
      map.setLayoutProperty(layer.id, "visibility", "none");
    } catch {
      // A renamed or removed basemap layer is simply left visible.
    }
  }
}
