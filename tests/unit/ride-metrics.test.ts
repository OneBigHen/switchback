import { describe, expect, it } from "vitest"
import { locateRideProgress } from "@/lib/client/ride-metrics"
import type { PlannedRoute } from "@/lib/routing/types"

const route: PlannedRoute = {
  id: "ride",
  name: "Ride",
  profile: "twisty",
  geometry: [[-77, 40], [-76.9, 40], [-76.8, 40]],
  waypoints: [],
  instructions: [
    { distanceMeters: 8_000, timeMilliseconds: 1, sign: 0, text: "Head east", streetName: "Ridge Road", interval: [0, 1] },
    { distanceMeters: 8_000, timeMilliseconds: 1, sign: 2, text: "Turn right", streetName: "River Road", interval: [1, 2] }
  ],
  distanceMiles: 10,
  durationMinutes: 20,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 50,
  turnCount: 1,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

const retracedRoute: PlannedRoute = {
  ...route,
  id: "retraced-ride",
  geometry: [
    [-77, 40],
    [-76.9, 40],
    [-76.8, 40],
    [-76.9, 40],
    [-77, 40]
  ],
  instructions: [
    { distanceMeters: 8_000, timeMilliseconds: 1, sign: 0, text: "Continue east", streetName: "Outbound Road", interval: [1, 2] },
    { distanceMeters: 8_000, timeMilliseconds: 1, sign: -2, text: "Continue west", streetName: "Return Road", interval: [3, 4] }
  ],
  distanceMiles: 21
}

describe("ride progress", () => {
  it("finds the nearest route position and upcoming instruction", () => {
    const progress = locateRideProgress(route, [-76.89, 40])

    expect(progress.percent).toBeCloseTo(50, -1)
    expect(progress.instruction?.streetName).toBe("River Road")
    expect(progress.remainingMiles).toBeGreaterThan(4)
    expect(progress.offRoute).toBe(false)
    expect(progress.distanceToInstructionMiles).toBeLessThan(1)
  })

  it("flags a GPS fix that is materially off the planned route", () => {
    expect(locateRideProgress(route, [-75.9, 41]).offRoute).toBe(true)
  })

  it("marks a shared outbound and return leg ambiguous without heading or continuity", () => {
    const progress = locateRideProgress(retracedRoute, [-76.95, 40])

    expect(progress.matchAmbiguous).toBe(true)
    expect(progress.instruction).toBeNull()
  })

  it("uses travel heading to distinguish opposite directions on a retraced leg", () => {
    const outbound = locateRideProgress(retracedRoute, [-76.95, 40], {
      headingDegrees: 90
    })
    const returning = locateRideProgress(retracedRoute, [-76.95, 40], {
      headingDegrees: 270
    })

    expect(outbound.matchAmbiguous).toBe(false)
    expect(outbound.percent).toBeLessThan(25)
    expect(outbound.instruction?.streetName).toBe("Outbound Road")
    expect(returning.matchAmbiguous).toBe(false)
    expect(returning.percent).toBeGreaterThan(75)
    expect(returning.instruction?.streetName).toBe("Return Road")
  })

  it("uses the prior match to maintain continuity when heading is unavailable", () => {
    const outboundStart = locateRideProgress(retracedRoute, [-76.96, 40], {
      headingDegrees: 90
    })
    const outboundNext = locateRideProgress(retracedRoute, [-76.94, 40], {
      previousProgress: outboundStart
    })
    const returnStart = locateRideProgress(retracedRoute, [-76.94, 40], {
      headingDegrees: 270
    })
    const returnNext = locateRideProgress(retracedRoute, [-76.96, 40], {
      previousProgress: returnStart
    })

    expect(outboundNext.matchAmbiguous).toBe(false)
    expect(outboundNext.percent).toBeLessThan(25)
    expect(returnNext.matchAmbiguous).toBe(false)
    expect(returnNext.percent).toBeGreaterThan(75)
  })
})
