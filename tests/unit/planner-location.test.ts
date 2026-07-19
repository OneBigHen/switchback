import { describe, expect, it } from "vitest"
import {
  createPlannerLocation,
  clearPlannerHome,
  readPlannerHome,
  readStoredPlannerLocation,
  requestPlannerLocation,
  savePlannerHome,
  savePlannerLocation
} from "@/lib/client/planner-location"

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe("planner current location", () => {
  it("keeps the permitted browser location precise and labels it clearly", () => {
    expect(createPlannerLocation(40.2732456, -76.8867345)).toEqual({
      lat: 40.273246,
      lon: -76.886735,
      label: "Current location"
    })
  })

  it("keeps the last permitted location only in browser storage and expires stale values", () => {
    const storage = new MemoryStorage()
    const now = Date.parse("2026-07-15T12:00:00Z")
    const location = createPlannerLocation(40.2732456, -76.8867345)!

    savePlannerLocation(storage, location, now)
    expect(readStoredPlannerLocation(storage, now + 60_000)).toEqual(location)
    expect(readStoredPlannerLocation(storage, now + 31 * 24 * 60 * 60 * 1000)).toBeNull()
  })

  it("stores an explicitly chosen Home locally until the rider removes it", () => {
    const storage = new MemoryStorage()
    const home = { lat: 40.273246, lon: -76.886735, label: "My garage" }

    savePlannerHome(storage, home)

    expect(readPlannerHome(storage)).toEqual({ ...home, label: "Home" })
    clearPlannerHome(storage)
    expect(readPlannerHome(storage)).toBeNull()
  })

  it("requests a fresh location after the rider explicitly asks to plan", async () => {
    const geolocation = {
      getCurrentPosition(success: PositionCallback) {
        success({ coords: { latitude: 40.2732456, longitude: -76.8867345 } } as GeolocationPosition)
      }
    }

    await expect(requestPlannerLocation(geolocation)).resolves.toEqual({
      lat: 40.273246,
      lon: -76.886735,
      label: "Current location"
    })
  })

  it("returns an actionable error when the rider cannot share a start", async () => {
    const geolocation = {
      getCurrentPosition(_success: PositionCallback, failure?: PositionErrorCallback | null) {
        failure?.({ code: 1, message: "denied", PERMISSION_DENIED: 1 } as GeolocationPositionError)
      }
    }

    await expect(requestPlannerLocation(geolocation)).rejects.toThrow(
      "Allow location access or choose a start point"
    )
  })
})
