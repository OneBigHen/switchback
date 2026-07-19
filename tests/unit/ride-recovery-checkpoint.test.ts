import { describe, expect, it } from "vitest"
import { buildRideRecoveryCheckpoint } from "@/lib/client/ride-recovery-checkpoint"
import type { NavigationFrame } from "@/lib/client/navigation-engine"
import type { PlannedRoute } from "@/lib/routing/types"

const route = {
  id: "ridge",
  geometry: [[-77, 40], [-76.9, 40], [-76.8, 40]]
} as PlannedRoute

const frame = {
  segmentIndex: 1,
  segmentFraction: 0.7,
  routePercent: 42,
  instructionIndex: 3
} as NavigationFrame

describe("ride recovery checkpoint builder", () => {
  it("anchors recovery to the next geometry point while preserving ride progress and deviation evidence", () => {
    expect(buildRideRecoveryCheckpoint({
      route,
      frame,
      completedWaypointIndexes: [0, 1],
      deviationHistory: [{
        detectedAt: "2026-07-18T12:00:00.000Z",
        coordinate: [-76.7, 40.1],
        distanceFromRouteMeters: 120
      }],
      savedAt: "2026-07-18T12:01:00.000Z",
      paused: true
    })).toEqual({
      routeId: "ridge",
      nearestGeometryIndex: 2,
      percent: 42,
      savedAt: "2026-07-18T12:01:00.000Z",
      completedWaypointIndexes: [0, 1],
      activeInstructionIndex: 3,
      deviationHistory: [{
        detectedAt: "2026-07-18T12:00:00.000Z",
        coordinate: [-76.7, 40.1],
        distanceFromRouteMeters: 120
      }],
      pausedAt: "2026-07-18T12:01:00.000Z"
    })
  })
})
