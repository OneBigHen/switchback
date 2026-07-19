import { afterEach, describe, expect, it } from "vitest"
import { clearRideRecovery, loadRideRecovery, saveRideRecovery } from "@/lib/storage/ride-recovery"

describe("ride recovery checkpoint", () => {
  afterEach(() => clearRideRecovery())

  it("restores the last verified progress only for the same route and while fresh", () => {
    saveRideRecovery({ routeId: "ridge", nearestGeometryIndex: 14, percent: 44, savedAt: "2026-07-15T10:00:00.000Z" })

    expect(loadRideRecovery("ridge", new Date("2026-07-15T14:00:00.000Z"))).toMatchObject({ nearestGeometryIndex: 14, percent: 44 })
    expect(loadRideRecovery("other", new Date("2026-07-15T14:00:00.000Z"))).toBeNull()
    expect(loadRideRecovery("ridge", new Date("2026-07-17T10:00:00.000Z"))).toBeNull()
  })

  it("persists completed stops and the active maneuver for restart-safe rerouting", () => {
    saveRideRecovery({
      routeId: "ridge",
      nearestGeometryIndex: 14,
      percent: 44,
      completedWaypointIndexes: [0, 1, 1, -1, 3.5],
      activeInstructionIndex: 5,
      savedAt: "2026-07-15T10:00:00.000Z"
    })

    expect(loadRideRecovery("ridge", new Date("2026-07-15T14:00:00.000Z"))).toMatchObject({
      completedWaypointIndexes: [0, 1],
      activeInstructionIndex: 5
    })
  })

  it("persists a valid guidance pause timestamp for restart recovery", () => {
    saveRideRecovery({
      routeId: "ridge",
      nearestGeometryIndex: 14,
      percent: 44,
      savedAt: "2026-07-15T10:00:00.000Z",
      pausedAt: "2026-07-15T10:05:00.000Z"
    })

    expect(loadRideRecovery("ridge", new Date("2026-07-15T14:00:00.000Z")))
      .toMatchObject({ pausedAt: "2026-07-15T10:05:00.000Z" })
  })

  it("keeps an explicitly paused overnight session while expiring ordinary stale recovery", () => {
    saveRideRecovery({
      routeId: "ridge",
      nearestGeometryIndex: 14,
      percent: 44,
      savedAt: "2026-07-15T10:00:00.000Z",
      pausedAt: "2026-07-15T10:05:00.000Z"
    })

    expect(loadRideRecovery("ridge", new Date("2026-07-18T09:00:00.000Z")))
      .toMatchObject({ pausedAt: "2026-07-15T10:05:00.000Z" })
    expect(loadRideRecovery("ridge", new Date("2026-07-23T11:00:00.000Z"))).toBeNull()
  })

  it("keeps a bounded, valid deviation history for recovery evidence", () => {
    saveRideRecovery({
      routeId: "ridge", nearestGeometryIndex: 14, percent: 44, savedAt: "2026-07-15T10:00:00.000Z",
      deviationHistory: [
        { detectedAt: "2026-07-15T10:05:00.000Z", coordinate: [-76.9, 40], distanceFromRouteMeters: 70 },
        { detectedAt: "bad", coordinate: [-76.9, 40], distanceFromRouteMeters: 70 }
      ]
    })

    expect(loadRideRecovery("ridge", new Date("2026-07-15T14:00:00.000Z")))
      .toMatchObject({ deviationHistory: [{ coordinate: [-76.9, 40], distanceFromRouteMeters: 70 }] })
  })
})
