import type { DayPhase } from "./day-phase"
import type { LegacyMapStyleId } from "./map-layers"
import {
  mapPresetDefinition,
  type MapPresetId,
  type MapStyleFamily
} from "./map-preset-registry"

/** Mapbox Standard light presets. */
export type MapLightPreset = "dawn" | "day" | "dusk" | "night"

/** What the rider chooses. `auto` follows the route-start locale's day phase. */
export type MapLightPreference = "auto" | MapLightPreset

/**
 * The map id shape written by the premium-wave build.
 *
 * Compatibility containment: this type and the two functions that convert it
 * exist only at the storage boundary (rider map packs and offline packs), so
 * an older build can still read a pack this one wrote. No runtime concept and
 * no component prop uses it. Delete it once no stored pack predates the
 * canonical `preset` field.
 */
export type LegacyMapExperienceId = "standard" | "terrain" | "satellite"

export type MapPresentationStyle =
  | "mapbox://styles/mapbox/standard"
  | "mapbox://styles/mapbox/standard-satellite"

export interface MapTerrainConfig {
  exaggeration: number
}

/** What the map is for right now, independent of the rider-facing preset. */
export type MapSurfaceProfile = "explore" | "plan" | "ride"

export interface MapCameraDefaults {
  pitch: number
  /** Null keeps the rider's current bearing rather than snapping north. */
  bearing: number | null
}

/**
 * One resolved runtime presentation. The canonical rider choice is `preset`;
 * renderer style family comes from the preset registry rather than another
 * switch statement scattered through the map component.
 */
export interface MapPresentation {
  preset: MapPresetId
  styleFamily: MapStyleFamily
  style: MapPresentationStyle
  lightPreset: MapLightPreset
  theme: "default" | "faded" | "monochrome"
  /** Mapbox Standard's `show3dObjects`. Standard Satellite does not take it. */
  show3dBuildings: boolean
  showRoadLabels: boolean
  showPointOfInterestLabels: boolean
  /** Null disables terrain entirely rather than flattening it. */
  terrain: MapTerrainConfig | null
  /** Subtle horizon depth. Never enough to wash out road contrast. */
  atmosphere: boolean
  /**
   * Imagery and night lighting need a brighter route ribbon than a pale
   * basemap does. Read by `planner-map-layers` when it paints the route.
   */
  routeEmphasis: "standard" | "bright"
  surface: MapSurfaceProfile
  camera: MapCameraDefaults
  /** How long a presentation change should take. Riding never animates it. */
  transitionMillis: number
}

export interface MapPresentationInput {
  preset: MapPresetId
  surface: MapSurfaceProfile
  lightPreset: MapLightPreset
}

export const MAP_LIGHT_PREFERENCES: readonly MapLightPreference[] =
  ["auto", "dawn", "day", "dusk", "night"]

export function isMapLightPreference(value: unknown): value is MapLightPreference {
  return typeof value === "string" && (MAP_LIGHT_PREFERENCES as readonly string[]).includes(value)
}

const LEGACY_MAP_EXPERIENCE_IDS: readonly LegacyMapExperienceId[] = ["standard", "terrain", "satellite"]

/** Narrow a stored premium-wave value before migrating it. */
export function isLegacyMapExperienceId(value: unknown): value is LegacyMapExperienceId {
  return typeof value === "string" && (LEGACY_MAP_EXPERIENCE_IDS as readonly string[]).includes(value)
}

/** Convert the premium-wave stored ID to the canonical rider preset. */
export function migrateLegacyMapExperience(
  experience: LegacyMapExperienceId | string | undefined
): MapPresetId {
  switch (experience) {
    case "terrain": return "terrain"
    case "satellite": return "satellite"
    case "standard":
    default: return "road"
  }
}

/** Exact rollback value for builds that still read the premium-wave field. */
export function legacyMapExperienceFor(preset: MapPresetId): LegacyMapExperienceId {
  return preset === "road" ? "standard" : preset
}

export interface LegacyMapStyleMigration {
  preset: MapPresetId
  lightPreference: MapLightPreference
  /** @deprecated Temporary bridge for premium-wave map-pack readers. */
  experience: LegacyMapExperienceId
}

function legacyStyleMigration(
  preset: MapPresetId,
  lightPreference: MapLightPreference
): LegacyMapStyleMigration {
  return {
    preset,
    lightPreference,
    experience: legacyMapExperienceFor(preset)
  }
}

/**
 * Pre-premium styles are less expressive than canonical presets. Night was a
 * lighting choice expressed as a style, so it remains lighting on migration.
 */
export function migrateLegacyMapStyle(
  mapStyle: LegacyMapStyleId | string | undefined
): LegacyMapStyleMigration {
  switch (mapStyle) {
    case "explorer":
    case "terrain": return legacyStyleMigration("terrain", "auto")
    case "satellite": return legacyStyleMigration("satellite", "auto")
    case "night": return legacyStyleMigration("road", "night")
    default: return legacyStyleMigration("road", "auto")
  }
}

/**
 * Nearest pre-premium rollback style. Satellite necessarily degrades to the
 * old explorer style; newer canonical/premium fields retain the exact choice.
 */
export function legacyMapStyleFor(
  preset: MapPresetId,
  lightPreference: MapLightPreference
): LegacyMapStyleId {
  if (lightPreference === "night") return "night"
  return preset === "road" ? "clean" : "explorer"
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

function cameraDefaults(input: MapPresentationInput): MapCameraDefaults {
  if (input.surface === "ride") return { pitch: 0, bearing: null }
  const relief = input.preset !== "road"
  if (input.surface === "explore") return { pitch: relief ? 55 : 25, bearing: null }
  return { pitch: relief ? 38 : 12, bearing: null }
}

export function resolveMapPresentation(input: MapPresentationInput): MapPresentation {
  const preset = mapPresetDefinition(input.preset)
  const ride = input.surface === "ride"
  const explore = input.surface === "explore"
  const satellite = preset.styleFamily === "standard-satellite"
  const dark = input.lightPreset === "night" || input.lightPreset === "dusk"
  const relief = input.preset !== "road"

  return {
    preset: input.preset,
    styleFamily: preset.styleFamily,
    style: preset.styleFamily === "standard-satellite"
      ? "mapbox://styles/mapbox/standard-satellite"
      : "mapbox://styles/mapbox/standard",
    lightPreset: input.lightPreset,
    theme: input.preset === "road" ? "faded" : "default",
    show3dBuildings: true,
    showRoadLabels: true,
    showPointOfInterestLabels: explore && input.preset !== "road",
    terrain: relief ? { exaggeration: ride ? 1 : explore ? 1.3 : 1.12 } : null,
    atmosphere: relief && !ride,
    routeEmphasis: satellite || dark ? "bright" : "standard",
    surface: input.surface,
    camera: cameraDefaults(input),
    transitionMillis: ride ? 0 : 900
  }
}

