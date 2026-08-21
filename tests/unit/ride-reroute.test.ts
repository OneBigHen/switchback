import { describe, expect, it, vi } from "vitest"
import {
  buildReroutePoints,
  resolveReroute,
  type RerouteRegionalResult
} from "@/lib/client/ride-reroute"
import { buildNavigationModel, updateNavigation } from "@/lib/client/navigation-engine"
import type { PlannedRoute } from "@/lib/routing/types"

const route: PlannedRoute = {
  id: "ridge",
  name: "Ridge ride",
  profile: "twisty",
  geometry: [[-77, 40], [-76.9, 40], [-76.8, 40], [-76.7, 40]],
  waypoints: [
    { lat: 40, lon: -77, label: "Start" },
    { lat: 40, lon: -76.8, label: "Fuel stop" },
    { lat: 40, lon: -76.7, label: "Finish" }
  ],
  instructions: [],
  distanceMiles: 12,
  durationMinutes: 20,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 50,
  turnCount: 4,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

const model = buildNavigationModel(route)
const trustedFrame = updateNavigation(model, {
  coordinate: [-76.9, 40], accuracyMeters: 5, headingDegrees: 90, speedMetersPerSecond: 10, timestamp: 1_000
})
const currentFrame = updateNavigation(model, {
  coordinate: [-75.8, 40.8], accuracyMeters: 5, headingDegrees: 90, speedMetersPerSecond: 10, timestamp: 2_000
}, trustedFrame)

const reroutePoints = route.waypoints.slice(0, 2)

function resolutionInput(overrides: Partial<Parameters<typeof resolveReroute>[0]> = {}) {
  return {
    route,
    points: reroutePoints,
    signal: new AbortController().signal,
    online: true,
    ...overrides
  }
}

describe("ride reroute point builder", () => {
  it("inserts a chosen fuel stop before all remaining planned stops", () => {
    expect(buildReroutePoints({
      route, navigationModel: model, trustedFrame, currentFrame, completedWaypointIndexes: [],
      mode: "fuel-detour",
      fuelStop: {
        id: "fuel", name: "Ridge Fuel", label: "Ridge Fuel", region: "PA", country: "US",
        lat: 40.4, lon: -76.6, kind: "fuel"
      }
    })).toEqual([
      { lat: 40.8, lon: -75.8, label: "Current location" },
      { lat: 40.4, lon: -76.6, label: "Fuel · Ridge Fuel" },
      { lat: 40, lon: -76.8, label: "Fuel stop" },
      { lat: 40, lon: -76.7, label: "Finish" }
    ])
  })

  it("skips the next remaining stop but never a completed stop", () => {
    expect(buildReroutePoints({
      route, navigationModel: model, trustedFrame, currentFrame, completedWaypointIndexes: [1], mode: "skip-point"
    })).toEqual([
      { lat: 40.8, lon: -75.8, label: "Current location" },
      { lat: 40, lon: -76.7, label: "Finish" }
    ])
  })
})

describe("ride reroute resolution", () => {
  it("returns an online route without consulting offline sources", async () => {
    const onlineRoute = { ...route, id: "online-route" }
    const regional = vi.fn(async (): Promise<RerouteRegionalResult> => ({ route: null, error: "not used" }))
    const saved = vi.fn(async () => { throw new Error("not used") })

    const result = await resolveReroute(resolutionInput({
      dependencies: {
        online: vi.fn(async () => onlineRoute),
        regional,
        saved
      }
    }))

    expect(result).toEqual({ route: onlineRoute, source: "online" })
    expect(regional).not.toHaveBeenCalled()
    expect(saved).not.toHaveBeenCalled()
  })

  it("falls back from online failure to regional offline", async () => {
    const regionalRoute = { ...route, id: "regional-route" }
    const saved = vi.fn(async () => { throw new Error("not used") })

    const result = await resolveReroute(resolutionInput({
      dependencies: {
        online: vi.fn(async () => { throw new Error("online unavailable") }),
        regional: vi.fn(async (): Promise<RerouteRegionalResult> => ({ route: regionalRoute, error: null })),
        saved
      }
    }))

    expect(result).toEqual({ route: regionalRoute, source: "regional-offline" })
    expect(saved).not.toHaveBeenCalled()
  })

  it("falls back from online and regional failure to the saved offline pack", async () => {
    const packRoute = { ...route, id: "pack-route" }

    const result = await resolveReroute(resolutionInput({
      dependencies: {
        online: vi.fn(async () => { throw new Error("online unavailable") }),
        regional: vi.fn(async (): Promise<RerouteRegionalResult> => ({ route: null, error: "no region" })),
        saved: vi.fn(async () => packRoute)
      }
    }))

    expect(result).toEqual({ route: packRoute, source: "offline-pack" })
  })

  it("never calls the online provider while offline", async () => {
    const online = vi.fn(async () => route)
    const regionalRoute = { ...route, id: "regional-route" }

    const result = await resolveReroute(resolutionInput({
      online: false,
      dependencies: {
        online,
        regional: vi.fn(async (): Promise<RerouteRegionalResult> => ({ route: regionalRoute, error: null }))
      }
    }))

    expect(result.source).toBe("regional-offline")
    expect(online).not.toHaveBeenCalled()
  })

  it("reports total failure after every source fails", async () => {
    await expect(resolveReroute(resolutionInput({
      dependencies: {
        online: vi.fn(async () => { throw new Error("online unavailable") }),
        regional: vi.fn(async (): Promise<RerouteRegionalResult> => ({ route: null, error: "no region" })),
        saved: vi.fn(async () => { throw new Error("no pack") })
      }
    }))).rejects.toThrow("no pack")
  })

  it("does no work when already aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    const online = vi.fn(async () => route)
    const regional = vi.fn(async (): Promise<RerouteRegionalResult> => ({ route: null, error: "not used" }))
    const saved = vi.fn(async () => route)

    await expect(resolveReroute(resolutionInput({
      signal: controller.signal,
      dependencies: { online, regional, saved }
    }))).rejects.toMatchObject({ name: "AbortError" })
    expect(online).not.toHaveBeenCalled()
    expect(regional).not.toHaveBeenCalled()
    expect(saved).not.toHaveBeenCalled()
  })

  it("does not begin offline fallback after online failure aborts the signal", async () => {
    const controller = new AbortController()
    const regional = vi.fn(async (): Promise<RerouteRegionalResult> => ({ route, error: null }))
    const saved = vi.fn(async () => route)

    await expect(resolveReroute(resolutionInput({
      signal: controller.signal,
      dependencies: {
        online: vi.fn(async () => {
          controller.abort()
          throw new Error("online unavailable")
        }),
        regional,
        saved
      }
    }))).rejects.toThrow("online unavailable")
    expect(regional).not.toHaveBeenCalled()
    expect(saved).not.toHaveBeenCalled()
  })
})
