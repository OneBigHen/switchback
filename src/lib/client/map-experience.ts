import type { DayPhase } from "./day-phase"
import type { LegacyMapStyleId } from "./map-layers"

/**
 * Mapbox Standard light presets. Switchback derives these from the existing
 * day-phase utilities instead of swapping to a separate "night map style"
 * (ADR 0015).
 */
export type MapLightPreset = "dawn" | "day" | "dusk" | "night"

/** What the rider chooses. `auto` follows the route-start locale's day phase. */
export type MapLightPreference = "auto" | MapLightPreset

/**
 * The rider-facing visual modes of the premium map. Lighting is a separate
 * choice: night is a light preset, not a fourth mode.
 */
export type MapExperienceId = "standard" | "terrain" | "satellite"

export type MapExperienceStyle =
  | "mapbox://styles/mapbox/standard"
  | "mapbox://styles/mapbox/standard-satellite"

export interface MapTerrainConfig {
  exaggeration: number
}

/**
 * What the map is *for* right now. Planning should be dramatic and riding
 * should be restrained, and "no route yet" is a different job from "compare
 * these three routes", so the presentation is a profile rather than one style
 * with conditionals scattered through it.
 *
 * - `explore` — no route yet. Richest view: terrain, landmarks, atmosphere.
 * - `plan` — routes exist and are being compared. Still rich, but the route
 *   ribbon and its alternatives dominate everything behind them.
 * - `ride` — in motion. Scenery yields to the route and the next instruction.
 */
export type MapSurfaceProfile = "explore" | "plan" | "ride"

/**
 * The presentation profile applied to one surface. Every value is explicit so
 * a mode change is a data change, not a branch scattered through the map
 * component.
 */
export interface MapExperienceConfig {
  id: MapExperienceId
  style: MapExperienceStyle
  lightPreset: MapLightPreset
  theme: "default" | "faded" | "monochrome"
  show3dBuildings: boolean
  show3dTrees: boolean
  show3dLandmarks: boolean
  show3dFacades: boolean
  showRoadLabels: boolean
  showPointOfInterestLabels: boolean
  /** Null disables terrain entirely rather than flattening it. */
  terrain: MapTerrainConfig | null
  /** Subtle horizon depth. Never enough to wash out road contrast. */
  atmosphere: boolean
  /**
   * Imagery and night lighting need a brighter route than a pale basemap
   * does, so the ribbon's emphasis is part of the experience, not a
   * per-layer guess.
   */
  routeEmphasis: "standard" | "bright"
  surface: MapSurfaceProfile
  camera: MapCameraDefaults
  /** How long a mode change should take. Riding never gets a long animation. */
  transitionMillis: number
}

export interface MapExperienceInput {
  experience: MapExperienceId
  /** Ride Focus is a presentation profile, not a user-selectable mode. */
  surface: MapSurfaceProfile
  lightPreset: MapLightPreset
}

/** Camera defaults per profile. Planning tilts enough to read terrain. */
export interface MapCameraDefaults {
  pitch: number
  /** Null keeps the rider's current bearing rather than snapping north. */
  bearing: number | null
}

export const MAP_EXPERIENCES: readonly MapExperienceId[] = ["standard", "terrain", "satellite"]

export const MAP_LIGHT_PREFERENCES: readonly MapLightPreference[] =
  ["auto", "dawn", "day", "dusk", "night"]

export function isMapExperienceId(value: unknown): value is MapExperienceId {
  return typeof value === "string" && (MAP_EXPERIENCES as readonly string[]).includes(value)
}

export function isMapLightPreference(value: unknown): value is MapLightPreference {
  return typeof value === "string" && (MAP_LIGHT_PREFERENCES as readonly string[]).includes(value)
}

/**
 * The planner's persisted map styles predate the premium modes. Reading them
 * must never lose a rider's saved intent: `night` was a lighting choice
 * expressed as a style, so it migrates to Standard under the night preset.
 */
export function migrateLegacyMapStyle(
  mapStyle: LegacyMapStyleId | string | undefined
): { experience: MapExperienceId; lightPreference: MapLightPreference } {
  switch (mapStyle) {
    case "explorer":
    case "terrain": return { experience: "terrain", lightPreference: "auto" }
    case "satellite": return { experience: "satellite", lightPreference: "auto" }
    case "night": return { experience: "standard", lightPreference: "night" }
    default: return { experience: "standard", lightPreference: "auto" }
  }
}

/**
 * The nearest legacy style for state that is still stored in the old shape
 * (offline route packs). Writing it keeps older readers — and an older build,
 * if one is rolled back to — able to restore a sensible presentation.
 */
export function legacyMapStyleFor(
  experience: MapExperienceId,
  lightPreference: MapLightPreference
): LegacyMapStyleId {
  if (lightPreference === "night") return "night"
  return experience === "standard" ? "clean" : "explorer"
}

/** Auto lighting comes from the existing day-phase utilities. */
export function resolveLightPreset(
  preference: MapLightPreference,
  phase: DayPhase | undefined
): MapLightPreset {
  if (preference !== "auto") return preference
  switch (phase) {
    case "dawn": return "dawn"
    case "dusk": return "dusk"
    case "night": return "night"
    default: return "day"
  }
}

/**
 * Planning tilts to show relief; the flat Standard canvas stays flat because
 * pitch without terrain only costs legibility. Ride keeps whatever the
 * navigation camera is doing — phase 3 owns that camera.
 */
function cameraDefaults(input: MapExperienceInput): MapCameraDefaults {
  if (input.surface === "ride") return { pitch: 0, bearing: null }
  const relief = input.experience !== "standard"
  if (input.surface === "explore") return { pitch: relief ? 55 : 25, bearing: null }
  // Planning compares routes, so the tilt stays mild enough that a route's
  // far end does not disappear behind the near terrain.
  return { pitch: relief ? 38 : 12, bearing: null }
}

export function resolveMapExperience(input: MapExperienceInput): MapExperienceConfig {
  const ride = input.surface === "ride"
  const explore = input.surface === "explore"
  const satellite = input.experience === "satellite"
  const dark = input.lightPreset === "night" || input.lightPreset === "dusk"
  return {
    id: input.experience,
    style: satellite
      ? "mapbox://styles/mapbox/standard-satellite"
      : "mapbox://styles/mapbox/standard",
    lightPreset: input.lightPreset,
    // Standard's faded theme is the low-noise planning canvas; terrain and
    // imagery want their own colour back.
    theme: input.experience === "standard" ? "faded" : "default",
    // Ride Focus keeps buildings for orientation but drops the detail that
    // costs battery and adds visual noise at speed.
    show3dBuildings: true,
    show3dTrees: explore,
    show3dLandmarks: !ride,
    show3dFacades: explore && !satellite,
    showRoadLabels: true,
    // Points of interest are scenery while exploring and clutter once there
    // is a route to read.
    showPointOfInterestLabels: explore && input.experience !== "standard",
    // Terrain is what Terrain mode is for; imagery reads better with it too.
    // The clean Standard canvas stays flat so the route is the only relief.
    // Terrain is what Terrain and Satellite are for. The clean Standard canvas
    // stays flat so the route is the only relief on it.
    terrain: input.experience === "standard"
      ? null
      // Exaggeration is taste, not data: enough to read a ridge line while
      // exploring, restrained once a route has to stay legible over it.
      : { exaggeration: ride ? 1 : explore ? 1.3 : 1.12 },
    atmosphere: input.experience !== "standard" && !ride,
    routeEmphasis: satellite || dark ? "bright" : "standard",
    surface: input.surface,
    camera: cameraDefaults(input),
    // A mode change should feel like the map moving, not like a page reload —
    // except in motion, where an animating camera is a hazard.
    transitionMillis: ride ? 0 : 900
  }
}
