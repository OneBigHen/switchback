import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createLatestRequestGate } from "@/lib/client/latest-request"
import { usePlannerLocationSeed } from "@/components/planner/usePlannerLocationSeed"
import type { Waypoint } from "@/lib/routing/types"

const savedLocation: Waypoint = { lat: 40.1, lon: -76.9, label: "Saved location" }
const liveLocation: Waypoint = { lat: 40.2, lon: -76.8, label: "Live location" }
const locationApi = vi.hoisted(() => ({
  readStoredPlannerLocation: vi.fn(),
  createPlannerLocation: vi.fn(),
  savePlannerLocation: vi.fn()
}))

vi.mock("@/lib/client/planner-location", () => ({
  readStoredPlannerLocation: locationApi.readStoredPlannerLocation,
  createPlannerLocation: locationApi.createPlannerLocation,
  savePlannerLocation: locationApi.savePlannerLocation
}))

const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation")
const originalPermissions = Object.getOwnPropertyDescriptor(navigator, "permissions")

function planner(past: unknown[] = []) {
  return {
    routePointPast: past,
    startQuery: "",
    seedCurrentLocation: vi.fn()
  }
}

function installGrantedLocation() {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: vi.fn().mockResolvedValue({ state: "granted" }) }
  })
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) => success({
        coords: { latitude: 40.2, longitude: -76.8 }
      } as GeolocationPosition)
    }
  })
}

describe("planner location seed", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    locationApi.readStoredPlannerLocation.mockReset()
    locationApi.createPlannerLocation.mockReset()
    locationApi.savePlannerLocation.mockReset()
    if (originalGeolocation) Object.defineProperty(navigator, "geolocation", originalGeolocation)
    else Reflect.deleteProperty(navigator, "geolocation")
    if (originalPermissions) Object.defineProperty(navigator, "permissions", originalPermissions)
    else Reflect.deleteProperty(navigator, "permissions")
  })

  it("seeds the saved browser location before upgrading it with an already-granted live fix", async () => {
    locationApi.readStoredPlannerLocation.mockReturnValue(savedLocation)
    locationApi.createPlannerLocation.mockReturnValue(liveLocation)
    installGrantedLocation()
    const state = planner()
    const onSeed = vi.fn()

    renderHook(() => usePlannerLocationSeed({
      gate: createLatestRequestGate(),
      getPlanner: () => state,
      onSeed
    }))

    await waitFor(() => expect(state.seedCurrentLocation).toHaveBeenCalledTimes(2))
    expect(state.seedCurrentLocation).toHaveBeenNthCalledWith(1, savedLocation)
    expect(state.seedCurrentLocation).toHaveBeenNthCalledWith(2, liveLocation)
    expect(locationApi.savePlannerLocation).toHaveBeenCalledWith(window.localStorage, liveLocation)
    expect(onSeed).toHaveBeenNthCalledWith(1, "saved")
    expect(onSeed).toHaveBeenNthCalledWith(2, "live")
  })

  it("does not replace an edited route with an automatic location seed", async () => {
    locationApi.readStoredPlannerLocation.mockReturnValue(savedLocation)
    locationApi.createPlannerLocation.mockReturnValue(liveLocation)
    installGrantedLocation()
    const state = planner([{}])

    renderHook(() => usePlannerLocationSeed({
      gate: createLatestRequestGate(),
      getPlanner: () => state,
      onSeed: vi.fn()
    }))

    await waitFor(() => expect(navigator.permissions.query).toHaveBeenCalledOnce())
    expect(state.seedCurrentLocation).not.toHaveBeenCalled()
  })

  it("does not replace a start query the rider is still typing", async () => {
    locationApi.readStoredPlannerLocation.mockReturnValue(savedLocation)
    locationApi.createPlannerLocation.mockReturnValue(liveLocation)
    installGrantedLocation()
    const state = planner()
    state.startQuery = "Phi"

    renderHook(() => usePlannerLocationSeed({
      gate: createLatestRequestGate(),
      getPlanner: () => state,
      onSeed: vi.fn()
    }))

    await waitFor(() => expect(navigator.permissions.query).toHaveBeenCalledOnce())
    expect(state.seedCurrentLocation).not.toHaveBeenCalled()
  })
})
