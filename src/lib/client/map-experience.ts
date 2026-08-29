import type { DayPhase } from "./day-phase"
import type { MapStyleId } from "./map-layers"

/**
 * Mapbox Standard light presets. Switchback derives these from the existing
 * day-phase utilities instead of swapping to a separate "night map style"
 * (ADR 0015).
 */
export type MapLightPreset = "dawn" | "day" | "dusk" | "night"

/**
 * The rider-facing visual modes of the premium map. Phase 1 only reaches
 * these through the map styles the planner already persists; phase 2 makes
 * them directly selectable.
 */
export type MapVisualMode = "standard" | "terrain" | "satellite"

export type MapExperienceStyle =
  | "mapbox://styles/mapbox/standard"
  | "mapbox://styles/mapbox/standard-satellite"

/**
 * The presentation profile applied to Mapbox Standard for one surface. Every
 * value is explicit so a mode change is a data change, not a branch scattered
 * through the map component.
 */
export interface MapExperienceConfig {
  style: MapExperienceStyle
  lightPreset: MapLightPreset
  theme: "default" | "faded" | "monochrome"
  show3dBuildings: boolean
  show3dTrees: boolean
  show3dLandmarks: boolean
  show3dFacades: boolean
  showRoadLabels: boolean
  showPointOfInterestLabels: boolean
  terrain: boolean
}

export interface MapExperienceInput {
  mode: MapVisualMode
  /** Ride Focus is a presentation profile, not a user-selectable mode. */
  surface: "planning" | "ride"
  lightPreset: MapLightPreset
}

/**
 * The planner's persisted map styles predate the premium modes. `clean` is
 * the low-noise Standard view, `explorer` leans on terrain, and `night` is
 * Standard under the night light preset — not a second style.
 */
export function visualModeForMapStyle(mapStyle: MapStyleId): MapVisualMode {
  return mapStyle === "explorer" ? "terrain" : "standard"
}

/**
 * Auto lighting comes from the existing day-phase utilities; the persisted
 * `night` style and a manual override both win over it.
 */
export function lightPresetForMapStyle(
  mapStyle: MapStyleId,
  phase: DayPhase | undefined,
  override?: MapLightPreset | null
): MapLightPreset {
  if (override) return override
  if (mapStyle === "night") return "night"
  switch (phase) {
    case "dawn": return "dawn"
    case "dusk": return "dusk"
    case "night": return "night"
    default: return "day"
  }
}

export function resolveMapExperience(input: MapExperienceInput): MapExperienceConfig {
  const ride = input.surface === "ride"
  const satellite = input.mode === "satellite"
  return {
    style: satellite
      ? "mapbox://styles/mapbox/standard-satellite"
      : "mapbox://styles/mapbox/standard",
    lightPreset: input.lightPreset,
    theme: input.mode === "standard" ? "faded" : "default",
    // Ride Focus keeps buildings for orientation but drops the detail that
    // costs battery and adds visual noise at speed.
    show3dBuildings: true,
    show3dTrees: !ride,
    show3dLandmarks: !ride,
    show3dFacades: !ride && !satellite,
    showRoadLabels: true,
    showPointOfInterestLabels: !ride && input.mode !== "standard",
    terrain: input.mode !== "standard"
  }
}
