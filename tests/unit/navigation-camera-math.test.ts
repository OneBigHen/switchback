import { describe, expect, it } from "vitest"
import {
  cameraUpdateExceedsDeadband,
  followPitch,
  followZoom,
  lookaheadMeters,
  normalizeBearing,
  resolveFollowBearing,
  resolveFollowCameraTarget,
  shortestBearingDelta,
  smoothBearing,
  routeLookaheadCoordinate,
  routeTangentBearing,
  type FollowCameraInputs
} from "@/lib/client/navigation-camera-math"
import { turfPointAlong } from "@/lib/client/geo-math"
import type { Coordinate } from "@/lib/routing/types"

function inputs(overrides: Partial<FollowCameraInputs> = {}): FollowCameraInputs {
  return {
    status: "navigating",
    speedMetersPerSecond: 20,
    headingDegrees: 90,
    accuracyMeters: 8,
    routeBearingDegrees: null,
    distanceToManeuverMeters: 2000,
    maneuverSign: 0,
    distanceFromRouteMeters: 3,
    matchAmbiguous: false,
    previousBearingDegrees: 90,
    ...overrides
  }
}

describe("bearing arithmetic across the north wrap", () => {
  it("turns 359 to 1 the short way", () => {
    expect(shortestBearingDelta(359, 1)).toBe(2)
    expect(smoothBearing(359, 1, 1)).toBeCloseTo(1)
    // Half way round a 2 degree turn is 0, not 180.
    expect(smoothBearing(359, 1, 0.5)).toBeCloseTo(0)
  })

  it("turns 1 to 359 the short way", () => {
    expect(shortestBearingDelta(1, 359)).toBe(-2)
    expect(smoothBearing(1, 359, 0.5)).toBeCloseTo(0)
  })

  it("keeps every result inside a single turn of the compass", () => {
    expect(normalizeBearing(-90)).toBe(270)
    expect(normalizeBearing(450)).toBe(90)
    expect(smoothBearing(350, 20, 1)).toBeCloseTo(20)
    expect(smoothBearing(350, 20, 0.5)).toBeCloseTo(5)
  })

  it("resolves an exact reversal consistently rather than oscillating", () => {
    expect(shortestBearingDelta(0, 180)).toBe(180)
    expect(shortestBearingDelta(180, 0)).toBe(180)
  })

  it("adopts the first bearing outright when there is nothing to smooth from", () => {
    expect(smoothBearing(null, 137, 0.2)).toBeCloseTo(137)
  })
})

describe("which direction the camera trusts", () => {
  it("prefers the matched route tangent over a noisy course", () => {
    const bearing = resolveFollowBearing(inputs({ routeBearingDegrees: 200, headingDegrees: 95 }))
    expect(bearing).toBe(200)
  })

  it("falls back to device course when the route is not being matched", () => {
    expect(resolveFollowBearing(inputs({ status: "off-route", routeBearingDegrees: 200, headingDegrees: 95 })))
      .toBe(95)
  })

  it("does not steer by an ambiguous match", () => {
    // The engine says the fix could belong to more than one road, so its
    // tangent is a guess the camera must not commit to.
    expect(resolveFollowBearing(inputs({
      matchAmbiguous: true,
      routeBearingDegrees: 200,
      headingDegrees: 95
    }))).toBe(95)
  })

  it("stops believing a tangent once the fix has drifted off the road", () => {
    expect(resolveFollowBearing(inputs({
      status: "deviating",
      distanceFromRouteMeters: 120,
      routeBearingDegrees: 200,
      headingDegrees: 95
    }))).toBe(95)
  })

  it("keeps steering by the route while the rider is merely drifting", () => {
    // Deviating but still on the road: the tangent is the best direction there is.
    expect(resolveFollowBearing(inputs({
      status: "deviating",
      distanceFromRouteMeters: 12,
      routeBearingDegrees: 200,
      headingDegrees: 95
    }))).toBe(200)
  })

  it("refuses a stale tangent carried over by a weak-signal fix", () => {
    // The engine reuses the previous frame's route fields when the fix is too
    // inaccurate to match, so the tangent it carries is old news.
    expect(resolveFollowBearing(inputs({
      status: "weak-signal",
      routeBearingDegrees: 200,
      headingDegrees: 95,
      speedMetersPerSecond: 18
    }))).toBe(95)
  })

  it("returns to the route tangent once matching recovers", () => {
    const lost = inputs({ status: "off-route", routeBearingDegrees: 200, headingDegrees: 95 })
    expect(resolveFollowBearing(lost)).toBe(95)
    const recovered = inputs({
      status: "navigating",
      distanceFromRouteMeters: 6,
      routeBearingDegrees: 200,
      headingDegrees: 95,
      previousBearingDegrees: 95
    })
    expect(resolveFollowBearing(recovered)).toBe(200)
  })

  it("holds the last bearing at a standstill instead of spinning on noise", () => {
    const stationary = inputs({
      speedMetersPerSecond: 0.3,
      headingDegrees: 275,
      routeBearingDegrees: null,
      previousBearingDegrees: 90
    })
    expect(resolveFollowBearing(stationary)).toBe(90)
  })

  it("has no opinion when there is no history and no usable signal", () => {
    expect(resolveFollowBearing(inputs({
      speedMetersPerSecond: 0,
      headingDegrees: null,
      routeBearingDegrees: null,
      previousBearingDegrees: null
    }))).toBeNull()
  })
})

describe("look-ahead", () => {
  it("looks further ahead the faster the rider is going", () => {
    const crawl = lookaheadMeters(inputs({ speedMetersPerSecond: 2 }))
    const town = lookaheadMeters(inputs({ speedMetersPerSecond: 10 }))
    const country = lookaheadMeters(inputs({ speedMetersPerSecond: 20 }))
    const highway = lookaheadMeters(inputs({ speedMetersPerSecond: 30 }))
    expect(crawl).toBeLessThan(town)
    expect(town).toBeLessThan(country)
    expect(country).toBeLessThan(highway)
    expect(crawl).toBeGreaterThanOrEqual(40)
    expect(highway).toBeLessThanOrEqual(450)
  })

  it("pulls the look-ahead back to keep an approaching turn in frame", () => {
    const far = lookaheadMeters(inputs({ speedMetersPerSecond: 25, distanceToManeuverMeters: 2000 }))
    const near = lookaheadMeters(inputs({ speedMetersPerSecond: 25, distanceToManeuverMeters: 120 }))
    expect(near).toBeLessThan(far)
    expect(near).toBeLessThan(120)
  })

  it("gives a sharp turn more room than a gentle one", () => {
    const gentle = lookaheadMeters(inputs({ distanceToManeuverMeters: 100, maneuverSign: 1 }))
    const sharp = lookaheadMeters(inputs({ distanceToManeuverMeters: 100, maneuverSign: 3 }))
    expect(sharp).toBeLessThan(gentle)
  })

  it("never looks so close that the rider outruns the frame", () => {
    expect(lookaheadMeters(inputs({ distanceToManeuverMeters: 5 }))).toBeGreaterThanOrEqual(40)
  })
})

describe("zoom", () => {
  it("zooms out as speed rises", () => {
    expect(followZoom(inputs({ speedMetersPerSecond: 2 })))
      .toBeGreaterThan(followZoom(inputs({ speedMetersPerSecond: 30 })))
  })

  it("zooms in to reveal an intersection that is nearly here", () => {
    const approaching = followZoom(inputs({ distanceToManeuverMeters: 90, maneuverSign: 2 }))
    const cruising = followZoom(inputs({ distanceToManeuverMeters: 2000, maneuverSign: 2 }))
    expect(approaching).toBeGreaterThan(cruising)
  })

  it("pulls back when the rider is off route", () => {
    expect(followZoom(inputs({ status: "off-route", distanceFromRouteMeters: 400 })))
      .toBeLessThan(followZoom(inputs()))
  })

  it("pulls back when the fix cannot be trusted", () => {
    expect(followZoom(inputs({ status: "weak-signal" }))).toBeLessThan(followZoom(inputs()))
    expect(followZoom(inputs({ accuracyMeters: 90 }))).toBeLessThan(followZoom(inputs()))
  })

  it("stays inside sane limits at every extreme", () => {
    const extreme = followZoom(inputs({
      status: "off-route",
      speedMetersPerSecond: 60,
      accuracyMeters: 500,
      distanceFromRouteMeters: 5000
    }))
    expect(extreme).toBeGreaterThanOrEqual(12.5)
    expect(extreme).toBeLessThanOrEqual(17.5)
  })
})

describe("pitch", () => {
  it("earns the tilt on a confident cruise", () => {
    expect(followPitch(inputs())).toBeGreaterThanOrEqual(50)
  })

  it("flattens when the fix is uncertain or the signal is weak", () => {
    expect(followPitch(inputs({ status: "uncertain" }))).toBeLessThan(40)
    expect(followPitch(inputs({ status: "weak-signal" }))).toBeLessThan(40)
    expect(followPitch(inputs({ accuracyMeters: 90 }))).toBeLessThan(40)
  })

  it("flattens off route so the rider can see where they actually are", () => {
    expect(followPitch(inputs({ status: "off-route" }))).toBeLessThan(35)
  })

  it("drops on arrival", () => {
    expect(followPitch(inputs({ status: "arrived" }))).toBeLessThanOrEqual(25)
  })

  it("eases off slightly into a turn", () => {
    const turning = followPitch(inputs({ distanceToManeuverMeters: 100, maneuverSign: 2 }))
    expect(turning).toBeLessThan(followPitch(inputs()))
    expect(turning).toBeGreaterThan(40)
  })
})

describe("camera update deadband", () => {
  const state = { bearingDegrees: 90, pitchDegrees: 55, zoom: 15.5, centerDistanceMeters: 0 }

  it("always applies the first camera state", () => {
    expect(cameraUpdateExceedsDeadband(null, state)).toBe(true)
  })

  it("ignores movement too small to see", () => {
    expect(cameraUpdateExceedsDeadband(state, {
      bearingDegrees: 90.2,
      pitchDegrees: 55.1,
      zoom: 15.51,
      centerDistanceMeters: 0.4
    })).toBe(false)
  })

  it("applies a real change in any single axis", () => {
    expect(cameraUpdateExceedsDeadband(state, { ...state, bearingDegrees: 95 })).toBe(true)
    expect(cameraUpdateExceedsDeadband(state, { ...state, pitchDegrees: 30 })).toBe(true)
    expect(cameraUpdateExceedsDeadband(state, { ...state, zoom: 16 })).toBe(true)
    expect(cameraUpdateExceedsDeadband(state, { ...state, centerDistanceMeters: 12 })).toBe(true)
  })

  it("measures the bearing deadband the short way round north", () => {
    const atNorth = { ...state, bearingDegrees: 359.9 }
    expect(cameraUpdateExceedsDeadband(atNorth, { ...atNorth, bearingDegrees: 0.1 })).toBe(false)
    expect(cameraUpdateExceedsDeadband(atNorth, { ...atNorth, bearingDegrees: 5 })).toBe(true)
  })
})

describe("resolved camera target", () => {
  it("answers every axis at once for a normal cruise", () => {
    const target = resolveFollowCameraTarget(inputs({ routeBearingDegrees: 137 }))
    expect(target.bearingDegrees).toBe(137)
    expect(target.pitchDegrees).toBe(55)
    expect(target.zoom).toBeGreaterThan(14)
    expect(target.lookaheadMeters).toBeGreaterThan(100)
  })

  it("keeps a usable bearing even with no signal at all", () => {
    const target = resolveFollowCameraTarget(inputs({
      speedMetersPerSecond: 0,
      headingDegrees: null,
      routeBearingDegrees: null,
      previousBearingDegrees: null
    }))
    expect(Number.isFinite(target.bearingDegrees)).toBe(true)
  })
})

describe("route look-ahead geometry", () => {
  // A straight eastbound run near Harrisburg, roughly 1 km of road.
  const straight: Coordinate[] = [
    [-76.9000, 40.2700],
    [-76.8900, 40.2700],
    [-76.8800, 40.2700],
    [-76.8700, 40.2700]
  ]

  it("aims at a point further along the route than the rider", () => {
    const target = routeLookaheadCoordinate(straight, 200, 300)
    expect(target).not.toBeNull()
    // Further east than the rider's own matched position.
    const rider = turfPointAlong(straight, 200)!
    expect(target![0]).toBeGreaterThan(rider[0])
  })

  it("clamps to the end of the route rather than running off it", () => {
    const target = routeLookaheadCoordinate(straight, 900, 5000)
    expect(target).not.toBeNull()
    expect(target![0]).toBeLessThanOrEqual(straight[straight.length - 1]![0] + 1e-9)
  })

  it("has nothing to aim at without a route", () => {
    expect(routeLookaheadCoordinate([], 0, 100)).toBeNull()
    expect(routeLookaheadCoordinate([[-76.9, 40.27]], 0, 100)).toBeNull()
  })

  it("reads the road direction as a compass bearing, not a signed one", () => {
    const bearing = routeTangentBearing(straight, 400)
    expect(bearing).not.toBeNull()
    // Due east.
    expect(bearing!).toBeGreaterThan(80)
    expect(bearing!).toBeLessThan(100)
  })

  it("reports a westbound road as a compass bearing near 270, never negative", () => {
    const westbound = [...straight].reverse()
    const bearing = routeTangentBearing(westbound, 400)
    expect(bearing).not.toBeNull()
    expect(bearing!).toBeGreaterThan(260)
    expect(bearing!).toBeLessThan(280)
  })

  it("declines to guess a direction from a degenerate route", () => {
    expect(routeTangentBearing([[-76.9, 40.27], [-76.9, 40.27]], 0)).toBeNull()
  })
})
