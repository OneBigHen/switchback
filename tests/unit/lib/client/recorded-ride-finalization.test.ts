import { describe, expect, it } from "vitest"
import { polylineDistanceMeters } from "@/lib/client/geo-math"
import { finalizeRecordedRide } from "@/lib/client/recorded-ride-finalization"
import type { RecordedRidePoint } from "@/lib/storage/ride-journal"
import type { PlannedRoute } from "@/lib/routing/types"

const selectedRoute: PlannedRoute = {
  id: "selected-route",
  name: "Planned ridge",
  profile: "twisty",
  geometry: [[-77, 40], [-76.9, 40.1]],
  waypoints: [],
  instructions: [],
  distanceMiles: 12,
  durationMinutes: 25,
  ascentMeters: 100,
  descentMeters: 80,
  twistiness: 70,
  turnCount: 12,
  roadMix: { secondary: 100 },
  surfaceMix: { asphalt: 100 },
  routingSource: "live",
  provider: "graphhopper",
  providerVersion: "test",
  previewOnly: false
}

const points: RecordedRidePoint[] = [
  { coordinate: [-77, 40], recordedAt: "2026-08-21T10:00:00.000Z", speedMph: 20 },
  { coordinate: [-76.95, 40.05], recordedAt: "2026-08-21T10:10:00.000Z", speedMph: 25 },
  { coordinate: [-76.9, 40.1], recordedAt: "2026-08-21T10:20:00.000Z", speedMph: 30 }
]

describe("finalizeRecordedRide", () => {
  it("reuses the selected route for a normal recording", () => {
    expect(finalizeRecordedRide({
      points,
      wasFreeRide: false,
      selectedRoute,
      now: new Date("2026-08-21T12:00:00.000Z")
    })).toBe(selectedRoute)
  })

  it("builds a free-ride fallback with recorded geometry and endpoints", () => {
    const now = new Date("2026-08-21T12:34:56.000Z")
    const route = finalizeRecordedRide({
      points,
      wasFreeRide: true,
      selectedRoute,
      now
    })

    expect(route).toMatchObject({
      id: `recording-${now.getTime()}`,
      name: `Free Ride · ${now.toLocaleDateString()}`,
      profile: "neural",
      geometry: points.map((point) => point.coordinate),
      waypoints: [
        { lat: 40, lon: -77, label: "Recording start" },
        { lat: 40.1, lon: -76.9, label: "Recording finish" }
      ],
      durationMinutes: 20,
      distanceMiles: polylineDistanceMeters(points.map((point) => point.coordinate)) / 1609.344,
      routingSource: "imported",
      previewOnly: false
    })
    expect(route.provider).toBeUndefined()
    expect(route.providerVersion).toBeUndefined()
  })

  it("builds the regular fallback when no selected route exists", () => {
    const route = finalizeRecordedRide({
      points,
      wasFreeRide: false,
      selectedRoute: null,
      now: new Date("2026-08-21T12:00:00.000Z")
    })

    expect(route.profile).toBe("quick")
    expect(route.name).toMatch(/^Recorded ride · /)
    expect(route.geometry).toEqual(points.map((point) => point.coordinate))
  })
})
