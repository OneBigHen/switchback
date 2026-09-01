import { layerCatalog, type RiderLayerId } from "@/lib/client/map-layers"
import type { RouteProfileId } from "@/lib/routing/types"
import type { BikeProfile } from "@/lib/routing/bike-profiles"

/**
 * One versioned operational settings source (SB-011/SB-023).
 *
 * Every visible setting is operational: the active bike enters route
 * constraints, defaults initialize the planner, units affect all values,
 * learning uses the stable `bike.id`, and V2 UI preferences are curated lists
 * rather than arbitrary dashboard layout state.
 */

export const RIDER_SETTINGS_VERSION = 2
const STORAGE_KEY = "switchback:rider-settings"

export type BikeCategory = "street" | "touring" | "adventure" | "dual-sport"
export type UnknownSurfacePolicy = "allow" | "warn" | "avoid"
export type UnitSystem = "imperial" | "metric"
export type ThemePreference = "auto" | "light" | "dark"
export type PlanQuickActionId = "free-ride" | "record" | "home-loop" | "saved-place"
export type RideMetricId = "eta" | "remaining-distance" | "speed" | "elevation" | "elapsed"
export type RecordingMetricId = "distance" | "speed" | "elevation" | "elapsed"
export type RouteDetailModuleId =
  | "overview"
  | "road-character"
  | "surface-elevation"
  | "weather"
  | "traffic"
  | "stops"
  | "directions"
  | "offline"
  | "actions"
  | "evidence"
  | "trip"
  | "rating-publish"

export interface RiderUiPreferences {
  planQuickActions: PlanQuickActionId[]
  quickLayers: RiderLayerId[]
  rideMetrics: RideMetricId[]
  recordingMetrics: RecordingMetricId[]
  routeDetailOrder: RouteDetailModuleId[]
  hiddenRouteDetailModules: RouteDetailModuleId[]
}

export interface RiderBike {
  id: string
  name: string
  category: BikeCategory
  fuelRangeMiles: number
  reserveMiles: number
  maintainedGravel: boolean
  roughTracks: boolean
  unknownSurfacePolicy: UnknownSurfacePolicy
}

export interface RiderSettings {
  version: typeof RIDER_SETTINGS_VERSION
  riderName: string
  activeBikeId: string
  bikes: RiderBike[]
  defaultProfile: RouteProfileId
  defaultAvoidHighways: boolean
  units: UnitSystem
  voiceGuidance: boolean
  theme: ThemePreference
  mapStyle: string
  learningEnabled: boolean
  uiPreferences: RiderUiPreferences
}

const PLAN_QUICK_ACTIONS: readonly PlanQuickActionId[] = ["free-ride", "record", "home-loop", "saved-place"]
const RIDE_METRICS: readonly RideMetricId[] = ["eta", "remaining-distance", "speed", "elevation", "elapsed"]
const RECORDING_METRICS: readonly RecordingMetricId[] = ["distance", "speed", "elevation", "elapsed"]
export const ROUTE_DETAIL_ORDER: readonly RouteDetailModuleId[] = [
  "overview",
  "road-character",
  "surface-elevation",
  "weather",
  "traffic",
  "stops",
  "directions",
  "offline",
  "actions",
  "evidence",
  "trip",
  "rating-publish"
]
const REQUIRED_ROUTE_DETAIL_MODULES = new Set<RouteDetailModuleId>(["overview", "actions"])
const ROUTE_PROFILES = new Set<RouteProfileId>([
  "quick",
  "balanced",
  "twisty",
  "scenic",
  "adventure",
  "gravel",
  "avoid-highways",
  "neural"
])
const RIDER_LAYER_IDS = new Set<RiderLayerId>(layerCatalog.map((layer) => layer.id))

function boundedKnownValues<T extends string>(value: unknown, allowed: ReadonlySet<T>, max?: number): T[] {
  if (!Array.isArray(value)) return []
  const result: T[] = []
  for (const candidate of value) {
    if (typeof candidate !== "string" || !allowed.has(candidate as T) || result.includes(candidate as T)) continue
    result.push(candidate as T)
    if (max !== undefined && result.length >= max) break
  }
  return result
}

export function defaultRiderUiPreferences(): RiderUiPreferences {
  return {
    planQuickActions: ["free-ride", "record"],
    quickLayers: ["curvature", "unpaved"],
    rideMetrics: ["eta", "remaining-distance", "speed"],
    recordingMetrics: ["elapsed", "distance", "speed"],
    routeDetailOrder: [...ROUTE_DETAIL_ORDER],
    hiddenRouteDetailModules: []
  }
}

export function validateRiderUiPreferences(value: unknown): RiderUiPreferences {
  const defaults = defaultRiderUiPreferences()
  if (!value || typeof value !== "object") return defaults
  const input = value as Record<string, unknown>

  const planQuickActions = boundedKnownValues(input.planQuickActions, new Set(PLAN_QUICK_ACTIONS), 4)
  const quickLayers = boundedKnownValues(input.quickLayers, RIDER_LAYER_IDS, 4)
  const rideMetrics = boundedKnownValues(input.rideMetrics, new Set(RIDE_METRICS), 3)
  const recordingMetrics = boundedKnownValues(input.recordingMetrics, new Set(RECORDING_METRICS), 3)
  const suppliedOrder = boundedKnownValues(input.routeDetailOrder, new Set(ROUTE_DETAIL_ORDER))
  const routeDetailOrder = [
    ...suppliedOrder,
    ...ROUTE_DETAIL_ORDER.filter((module) => !suppliedOrder.includes(module))
  ]
  const hiddenRouteDetailModules = boundedKnownValues(
    input.hiddenRouteDetailModules,
    new Set(ROUTE_DETAIL_ORDER)
  ).filter((module) => !REQUIRED_ROUTE_DETAIL_MODULES.has(module))

  return {
    planQuickActions: planQuickActions.length > 0 ? planQuickActions : defaults.planQuickActions,
    quickLayers: quickLayers.length > 0 ? quickLayers : defaults.quickLayers,
    rideMetrics: rideMetrics.length > 0 ? rideMetrics : defaults.rideMetrics,
    recordingMetrics: recordingMetrics.length > 0 ? recordingMetrics : defaults.recordingMetrics,
    routeDetailOrder,
    hiddenRouteDetailModules
  }
}

export function createDefaultBike(id: string, name: string, category: BikeCategory): RiderBike {
  return {
    id,
    name,
    category,
    fuelRangeMiles: 180,
    reserveMiles: 35,
    maintainedGravel: category === "adventure" || category === "dual-sport",
    roughTracks: category === "dual-sport",
    unknownSurfacePolicy: category === "dual-sport" ? "allow" : "warn"
  }
}

export function createDefaultSettings(): RiderSettings {
  const street = createDefaultBike("bike-default-street", "Street", "street")
  return {
    version: RIDER_SETTINGS_VERSION,
    riderName: "",
    activeBikeId: street.id,
    bikes: [street],
    defaultProfile: "balanced",
    defaultAvoidHighways: false,
    units: "imperial",
    voiceGuidance: false,
    theme: "auto",
    mapStyle: "standard",
    learningEnabled: true,
    uiPreferences: defaultRiderUiPreferences()
  }
}

function isRiderBike(value: unknown): value is RiderBike {
  if (!value || typeof value !== "object") return false
  const bike = value as Partial<RiderBike>
  return typeof bike.id === "string" && bike.id.length > 0 &&
    typeof bike.name === "string" && bike.name.length > 0 &&
    (bike.category === "street" || bike.category === "touring" || bike.category === "adventure" || bike.category === "dual-sport") &&
    typeof bike.fuelRangeMiles === "number" && Number.isFinite(bike.fuelRangeMiles) && bike.fuelRangeMiles > 0 &&
    typeof bike.reserveMiles === "number" && Number.isFinite(bike.reserveMiles) && bike.reserveMiles >= 0 &&
    typeof bike.maintainedGravel === "boolean" && typeof bike.roughTracks === "boolean" &&
    (bike.unknownSurfacePolicy === "allow" || bike.unknownSurfacePolicy === "warn" || bike.unknownSurfacePolicy === "avoid")
}

/**
 * Upgrades a stored V1/V2 settings object without discarding valid rider data.
 * Unknown/corrupt individual fields fall back independently instead of causing
 * a whole-record reset.
 */
export function migrateStoredRiderSettings(value: unknown): RiderSettings {
  const defaults = createDefaultSettings()
  if (!value || typeof value !== "object") return defaults
  const input = value as Record<string, unknown>
  const bikes = Array.isArray(input.bikes) ? input.bikes.filter(isRiderBike).map((bike) => ({ ...bike })) : []
  const safeBikes = bikes.length > 0 ? bikes : defaults.bikes
  const requestedActiveBike = typeof input.activeBikeId === "string" ? input.activeBikeId : ""
  const activeBikeId = safeBikes.some((bike) => bike.id === requestedActiveBike)
    ? requestedActiveBike
    : safeBikes[0]!.id
  const requestedProfile = input.defaultProfile

  return {
    version: RIDER_SETTINGS_VERSION,
    riderName: typeof input.riderName === "string" ? input.riderName.trim().slice(0, 80) : defaults.riderName,
    activeBikeId,
    bikes: safeBikes,
    defaultProfile: typeof requestedProfile === "string" && ROUTE_PROFILES.has(requestedProfile as RouteProfileId)
      ? requestedProfile as RouteProfileId
      : defaults.defaultProfile,
    defaultAvoidHighways: typeof input.defaultAvoidHighways === "boolean" ? input.defaultAvoidHighways : defaults.defaultAvoidHighways,
    units: input.units === "metric" || input.units === "imperial" ? input.units : defaults.units,
    voiceGuidance: typeof input.voiceGuidance === "boolean" ? input.voiceGuidance : defaults.voiceGuidance,
    theme: input.theme === "auto" || input.theme === "light" || input.theme === "dark" ? input.theme : defaults.theme,
    mapStyle: typeof input.mapStyle === "string" && input.mapStyle.trim() ? input.mapStyle : defaults.mapStyle,
    learningEnabled: typeof input.learningEnabled === "boolean" ? input.learningEnabled : defaults.learningEnabled,
    uiPreferences: validateRiderUiPreferences(input.uiPreferences)
  }
}

/** Stable slug for a legacy bike name; used only to migrate old records once. */
function stableBikeIdFromName(name: string, index: number): string {
  const slug = name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "motorcycle"
  return `bike-${slug}-${index}`
}

/**
 * Migrate the pre-versioned rider-profile record into the versioned settings
 * source. This remains separate from migrateStoredRiderSettings because the
 * old record used different field names.
 */
export function migrateLegacySettings(legacy: {
  riderName?: unknown
  motorcycleName?: unknown
  fuelRangeMiles?: unknown
  gravelTolerance?: unknown
  roughTrackTolerance?: unknown
  learningEnabled?: unknown
  units?: unknown
  voice?: unknown
} | null): RiderSettings {
  const settings = createDefaultSettings()
  if (!legacy || typeof legacy !== "object") return settings

  if (typeof legacy.riderName === "string" && legacy.riderName.trim()) {
    settings.riderName = legacy.riderName.trim().slice(0, 80)
  }
  const bikeName = typeof legacy.motorcycleName === "string" && legacy.motorcycleName.trim()
    ? legacy.motorcycleName.trim().slice(0, 80)
    : "Street"
  const category: BikeCategory = typeof legacy.gravelTolerance === "number" && legacy.gravelTolerance >= 0.4
    ? "adventure"
    : "street"
  const bike = createDefaultBike(stableBikeIdFromName(bikeName, 0), bikeName, category)
  if (typeof legacy.fuelRangeMiles === "number" && Number.isFinite(legacy.fuelRangeMiles) && legacy.fuelRangeMiles > 0) {
    bike.fuelRangeMiles = legacy.fuelRangeMiles
  }
  settings.bikes = [bike]
  settings.activeBikeId = bike.id
  if (legacy.learningEnabled === false) settings.learningEnabled = false
  if (legacy.units === "metric") settings.units = "metric"
  if (legacy.voice === true) settings.voiceGuidance = true
  return settings
}

export function loadRiderSettings(): RiderSettings {
  if (typeof window === "undefined") return createDefaultSettings()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const legacy = JSON.parse(window.localStorage.getItem("switchback:rider-profile") ?? "null") as unknown
      const migrated = migrateLegacySettings(legacy as Parameters<typeof migrateLegacySettings>[0])
      saveRiderSettings(migrated)
      return migrated
    }
    const migrated = migrateStoredRiderSettings(JSON.parse(raw) as unknown)
    saveRiderSettings(migrated)
    return migrated
  } catch {
    return createDefaultSettings()
  }
}

export function saveRiderSettings(settings: RiderSettings): void {
  if (typeof window === "undefined") return
  try {
    const validated = migrateStoredRiderSettings(settings)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(validated))
  } catch {
    // Storage unavailable (private mode): settings are in-memory only.
  }
}

export function getActiveBike(settings: RiderSettings): RiderBike {
  return settings.bikes.find((bike) => bike.id === settings.activeBikeId) ?? settings.bikes[0]!
}

export function bikeProfileFromRiderSettings(settings: RiderSettings): BikeProfile {
  const bike = getActiveBike(settings)
  return {
    name: bike.name,
    category: bike.category,
    fuelRangeMiles: bike.fuelRangeMiles,
    reserveMiles: bike.reserveMiles,
    allowMaintainedGravel: bike.maintainedGravel,
    allowRoughTracks: bike.roughTracks,
    avoidUnknownSurface: bike.unknownSurfacePolicy === "avoid"
  }
}
