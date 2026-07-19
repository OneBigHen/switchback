import type { Waypoint } from "@/lib/routing/types"

const STORAGE_KEY = "switchback.planner-location.v1"
const HOME_STORAGE_KEY = "switchback.planner-home.v1"
const MAX_STORED_LOCATION_AGE_MS = 30 * 24 * 60 * 60 * 1000

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface StoredPlannerLocation {
  location: Waypoint
  savedAt: number
}

export interface PlannerGeolocation {
  getCurrentPosition(
    success: PositionCallback,
    failure?: PositionErrorCallback | null,
    options?: PositionOptions
  ): void
}

function roundedCoordinate(value: number): number {
  return Number(value.toFixed(6))
}

function isWaypoint(value: unknown): value is Waypoint {
  if (!value || typeof value !== "object") return false
  const point = value as Partial<Waypoint>
  return typeof point.lat === "number" && Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90
    && typeof point.lon === "number" && Number.isFinite(point.lon) && point.lon >= -180 && point.lon <= 180
    && typeof point.label === "string" && point.label.length > 0
}

export function createPlannerLocation(latitude: number, longitude: number): Waypoint | null {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return null
  }
  return {
    lat: roundedCoordinate(latitude),
    lon: roundedCoordinate(longitude),
    label: "Current location"
  }
}

export function requestPlannerLocation(
  geolocation: PlannerGeolocation | null | undefined
): Promise<Waypoint> {
  if (!geolocation) {
    return Promise.reject(new Error("Allow location access or choose a start point before planning."))
  }
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        const location = createPlannerLocation(position.coords.latitude, position.coords.longitude)
        if (location) resolve(location)
        else reject(new Error("Your browser returned an invalid location. Choose a start point instead."))
      },
      () => reject(new Error("Allow location access or choose a start point before planning.")),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 }
    )
  })
}

export function savePlannerLocation(storage: StorageLike, location: Waypoint, now = Date.now()): void {
  storage.setItem(STORAGE_KEY, JSON.stringify({ location, savedAt: now } satisfies StoredPlannerLocation))
}

export function savePlannerHome(storage: StorageLike, location: Waypoint): void {
  if (!isWaypoint(location)) return
  storage.setItem(HOME_STORAGE_KEY, JSON.stringify({
    lat: roundedCoordinate(location.lat),
    lon: roundedCoordinate(location.lon),
    label: "Home"
  } satisfies Waypoint))
}

export function readPlannerHome(storage: StorageLike): Waypoint | null {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(HOME_STORAGE_KEY) ?? "null")
    if (!isWaypoint(parsed)) return null
    return { ...parsed, label: "Home" }
  } catch {
    return null
  }
}

export function clearPlannerHome(storage: StorageLike): void {
  storage.removeItem(HOME_STORAGE_KEY)
}

export function readStoredPlannerLocation(storage: StorageLike, now = Date.now()): Waypoint | null {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null")
    if (!parsed || typeof parsed !== "object") return null
    const value = parsed as Partial<StoredPlannerLocation>
    if (!isWaypoint(value.location) || typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt)) {
      storage.removeItem(STORAGE_KEY)
      return null
    }
    if (value.savedAt > now + 60_000 || now - value.savedAt > MAX_STORED_LOCATION_AGE_MS) {
      storage.removeItem(STORAGE_KEY)
      return null
    }
    return { ...value.location }
  } catch {
    return null
  }
}
