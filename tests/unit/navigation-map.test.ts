import { describe, expect, it } from "vitest"
import { buildNavigationMapFeatures } from "@/lib/client/navigation-map"
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
