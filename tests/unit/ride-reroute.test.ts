import { describe, expect, it } from "vitest"
import { buildReroutePoints } from "@/lib/client/ride-reroute"
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
