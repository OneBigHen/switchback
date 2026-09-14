import type { Map as MapLibreMap, SkySpecification } from "maplibre-gl"
import { mapStyleUrl } from "@/lib/client/map-layers"

/**
 * Recon's map look. Hex constants map 1:1 to src/app/styles/tokens.css —
 * Recon never invents a colour. The cinema comes from pitch, terrain relief,
 * sky, a decluttered basemap and a strong route hierarchy.
 */

export const RECON_COLORS = {
  /** --sb-ember: the ride, new-to-you road. */
  ember: "#D65A36",
  emberStrong: "#BF4829",
  /** --sb-signal: previews. */
  signal: "#397C96",
  /** --sb-golden-hour: known gravel evidence. */
  golden: "#C99A46",
  ink: "#161D1C",
  spruce: "#243A35",
  paper: "#FBF9F4",
  sage: "#9DA98F",
  moss: "#65745D",
  sandstone: "#D8C8B7"
} as const

/** OpenFreeMap Liberty through the app's existing style map. */
export const RECON_BASEMAP_STYLE_URL = mapStyleUrl("explorer")

export const RECON_CAMERA = {
  center: [-75.2, 40.4] as [number, number],
  zoom: 6.8,
  pitch: 58,
  bearing: -18,
  maxPitch: 80
}

export const RECON_FIT_MAX_ZOOM = 13.5
export const RECON_FIT_DURATION_MS = 1400

export type ReconAtmosphere = "day" | "dusk"

/** Sky presets: a bright field for exploring, a low golden horizon for replay. */
function reconSky(atmosphere: ReconAtmosphere): SkySpecification {
  if (atmosphere === "dusk") {
    return {
      "sky-color": RECON_COLORS.spruce,
      "horizon-color": RECON_COLORS.golden,
      "fog-color": RECON_COLORS.sandstone,
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.35,
      "fog-ground-blend": 0.55,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 12, 0.6]
    }
  }
  return {
    "sky-color": "#A9C3CC",
    "horizon-color": RECON_COLORS.paper,
    "fog-color": RECON_COLORS.paper,
    "sky-horizon-blend": 0.5,
    "horizon-fog-blend": 0.2,
    "fog-ground-blend": 0.7,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 12, 0.4]
  }
}

/** Basemap symbol layers that compete with the ride at a cinematic pitch. */
const CLUTTER = /(^|[-_])(poi|housenumber|building|aeroway|transit|rail|oneway|mountain_peak)/

export function applyReconAtmosphere(map: MapLibreMap, atmosphere: ReconAtmosphere): void {
  try {
    map.setSky(reconSky(atmosphere))
  } catch {
    // The style rejected the sky; the basemap still reads.
  }
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "symbol" || !CLUTTER.test(layer.id)) continue
    try {
      map.setLayoutProperty(layer.id, "visibility", "none")
    } catch {
      // A renamed basemap layer simply stays visible.
    }
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}
