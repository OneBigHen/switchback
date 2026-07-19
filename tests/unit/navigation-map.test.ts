import { describe, expect, it } from "vitest"
import {
  buildNavigationMapFeatures,
  navigationCameraOptions
} from "@/lib/client/navigation-map"
import type { NavigationFrame } from "@/lib/client/navigation-engine"

const frame: NavigationFrame = {
  status: "navigating",
  rawCoordinate: [-76.985, 40.001],
  matchedCoordinate: [-76.985, 40],
  accuracyMeters: 8,
  headingDegrees: 92,
  speedMetersPerSecond: 14,
  timestamp: 1_000,
  segmentIndex: 2,
  segmentFraction: 0.4,
  matchedDistanceMeters: 1_200,
  distanceFromRouteMeters: 111,
  routePercent: 40,
  remainingDistanceMeters: 1_800,
  remainingDurationSeconds: 180,
  instructionIndex: 1,
  instruction: null,
  thenInstruction: null,
  distanceToInstructionMeters: 300,
  offRouteFixCount: 0,
  offRouteSince: null,
  matchAmbiguous: false
}

describe("ride navigation map presentation", () => {
  it("centers the camera on the actual GPS fix with heading and mobile look-ahead", () => {
    expect(navigationCameraOptions(frame, { width: 390, height: 844 })).toEqual({
      center: [-76.985, 40.001],
      bearing: 92,
      pitch: 52,
      zoom: 16.1,
      padding: { top: 220, right: 28, bottom: 92, left: 28 },
      duration: 650,
      essential: true
    })
  })

  it("uses a compact camera rail in landscape without losing the live position", () => {
    const options = navigationCameraOptions(
      { ...frame, status: "off-route", headingDegrees: null },
      { width: 844, height: 390 }
    )

    expect(options.center).toEqual(frame.rawCoordinate)
    expect(options.bearing).toBeUndefined()
    expect(options.pitch).toBe(28)
    expect(options.zoom).toBeLessThan(16)
    expect(options.padding).toEqual({ top: 112, right: 24, bottom: 52, left: 24 })
  })

  it("renders both the raw rider fix and its route match without hiding deviation", () => {
    const features = buildNavigationMapFeatures(frame)

    expect(features.features).toHaveLength(3)
    expect(features.features[0]).toMatchObject({
      properties: { kind: "match-link", status: "navigating" },
      geometry: { type: "LineString", coordinates: [frame.rawCoordinate, frame.matchedCoordinate] }
    })
    expect(features.features[1]).toMatchObject({
      properties: { kind: "matched-position" },
      geometry: { type: "Point", coordinates: frame.matchedCoordinate }
    })
    expect(features.features[2]).toMatchObject({
      properties: { kind: "rider-position", bearing: 92, accuracy: 8 },
      geometry: { type: "Point", coordinates: frame.rawCoordinate }
    })
  })
})
