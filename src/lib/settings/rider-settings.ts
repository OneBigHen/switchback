import type { RouteProfileId } from "@/lib/routing/types"

/**
 * One versioned operational settings source (SB-011/SB-023).
 *
 * Every visible setting is operational: the active bike enters route
 * constraints, defaults initialize the planner, units affect all values,
 * and learning uses the stable `bike.id` — never the mutable display name.
 */

export const RIDER_SETTINGS_VERSION = 1
const STORAGE_KEY = "switchback:rider-settings"

export type BikeCategory = "street" | "touring" | "adventure" | "dual-sport"
export type UnknownSurfacePolicy = "allow" | "warn" | "avoid"
export type UnitSystem = "imperial" | "metric"
export type ThemePreference = "auto" | "light" | "dark"

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
  version: number
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
    learningEnabled: true
  }
}

/** Stable slug for a legacy bike name; used only to migrate old records once. */
function stableBikeIdFromName(name: string, index: number): string {
  const slug = name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "motorcycle"
  return `bike-${slug}-${index}`
}

/**
 * Migrate legacy per-bike fields (rider profile / motorcycle name + fuel /
 * gravel/rough options) into stable RiderBike records. The generated ids are
 * persisted, so later renames of the display name never change the identity
 * used for preference learning or route constraints (SB-011).
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
    const parsed = JSON.parse(raw) as RiderSettings
    if (!parsed || parsed.version !== RIDER_SETTINGS_VERSION || !Array.isArray(parsed.bikes)) {
      return createDefaultSettings()
    }
    return parsed
  } catch {
    return createDefaultSettings()
  }
}

export function saveRiderSettings(settings: RiderSettings): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, version: RIDER_SETTINGS_VERSION }))
  } catch {
    // Storage unavailable (private mode): settings are in-memory only.
  }
}

export function getActiveBike(settings: RiderSettings): RiderBike {
  return settings.bikes.find((bike) => bike.id === settings.activeBikeId) ?? settings.bikes[0]!
}
