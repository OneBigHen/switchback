import { describe, expect, it, vi } from "vitest"
import {
  FOLLOW_EASE_ID,
  NavigationCameraController,
  type FollowCameraMap
} from "@/lib/client/navigation-camera-controller"
import type { NavigationFrame } from "@/lib/client/navigation-engine"
import type { Coordinate } from "@/lib/routing/types"

const ROUTE: Coordinate[] = [
  [-76.9000, 40.2700],
  [-76.8900, 40.2700],
  [-76.8800, 40.2700],
  [-76.8700, 40.2700]
]

const PADDING = { top: 220, right: 28, bottom: 92, left: 28 }

function frame(overrides: Partial<NavigationFrame> = {}): NavigationFrame {
  return {
    status: "navigating",
    rawCoordinate: [-76.8900, 40.2700],
    matchedCoordinate: [-76.8900, 40.2700],
    accuracyMeters: 8,
    headingDegrees: 90,
    speedMetersPerSecond: 18,
    timestamp: 1_000,
    segmentIndex: 1,
    segmentFraction: 0.2,
    matchedDistanceMeters: 850,
    distanceFromRouteMeters: 4,
    routePercent: 30,
    remainingDistanceMeters: 5_000,
    remainingDurationSeconds: 600,
    instructionIndex: 2,
    instruction: null,
    thenInstruction: null,
    distanceToInstructionMeters: 1_500,
    offRouteFixCount: 0,
    offRouteSince: null,
    matchAmbiguous: false,
    routeBearingDegrees: 90,
    ...overrides
  }
}

function fakeMap(): { map: FollowCameraMap; easeTo: ReturnType<typeof vi.fn> } {
  const easeTo = vi.fn()
  let bearing = 0
  const map: FollowCameraMap = {
    easeTo: (options: Record<string, unknown>) => {
      easeTo(options)
      if (typeof options.bearing === "number") bearing = options.bearing
      return undefined
    },
    getBearing: () => bearing,
    getPitch: () => 0,
    getZoom: () => 15,
    getCenter: () => ({ lng: -76.9, lat: 40.27 })
  }
  return { map, easeTo }
}

const context = { padding: PADDING, routeGeometry: ROUTE }

describe("follow camera application", () => {
  it("aims along the route rather than at the ground already ridden", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    controller.update(map, frame(), context)

    const options = easeTo.mock.calls[0]![0]
    const center = options.center as Coordinate
    // Further along the eastbound route than the rider's matched position.
    expect(center[0]).toBeGreaterThan(-76.8900)
    expect(options.padding).toEqual(PADDING)
    expect(options.essential).toBe(true)
  })

  it("chains eases under one id so interruptions emit no move events", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    controller.update(map, frame(), context)
    const options = easeTo.mock.calls[0]![0]
    // Every camera move costs a moveend, which drives viewport layer fetches.
    expect(options.easeId).toBe(FOLLOW_EASE_ID)
    expect(options.noMoveStart).toBe(true)
  })

  it("eases over the gap between fixes instead of queueing long animations", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    controller.update(map, frame({ timestamp: 1_000 }), context)
    controller.update(map, frame({ timestamp: 2_000, speedMetersPerSecond: 25 }), context)
    const second = easeTo.mock.calls[1]![0]
    expect(second.duration).toBeGreaterThanOrEqual(250)
    expect(second.duration).toBeLessThanOrEqual(1200)
  })

  it("falls back to the rider's own position when off route", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    const off = frame({ status: "off-route", rawCoordinate: [-76.8500, 40.3000] })
    controller.update(map, off, context)
    expect(easeTo.mock.calls[0]![0].center).toEqual([-76.8500, 40.3000])
  })

  it("still frames the rider when there is no route geometry", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    controller.update(map, frame(), { padding: PADDING })
    expect(easeTo.mock.calls[0]![0].center).toEqual([-76.8900, 40.2700])
  })
})

describe("heading behaviour", () => {
  it("damps small heading noise but takes a real corner promptly", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    controller.update(map, frame({ routeBearingDegrees: 90 }), { padding: PADDING })
    const settled = easeTo.mock.calls[0]![0].bearing as number

    controller.update(map, frame({ timestamp: 2_000, routeBearingDegrees: 93 }), { padding: PADDING })
    const nudged = easeTo.mock.calls[1]![0].bearing as number
    // Damped: it moves toward 93 without snapping to it.
    expect(nudged).toBeGreaterThan(settled)
    expect(nudged).toBeLessThan(93)

    controller.update(map, frame({ timestamp: 3_000, routeBearingDegrees: 180 }), { padding: PADDING })
    const cornered = easeTo.mock.calls[2]![0].bearing as number
    // Decisive: most of a 90 degree corner is taken at once.
    expect(cornered).toBeGreaterThan(140)
  })

  it("never spins the long way round north", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    controller.update(map, frame({ routeBearingDegrees: 359 }), { padding: PADDING })
    controller.update(map, frame({ timestamp: 2_000, routeBearingDegrees: 1 }), { padding: PADDING })
    const bearing = easeTo.mock.calls[1]![0].bearing as number
    // The result sits in the short arc through north, never out near 180.
    const throughNorth = bearing > 300 || bearing < 60
    expect(throughNorth).toBe(true)
  })
})

describe("user pan and recenter", () => {
  it("stops following the moment the rider touches the map", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    controller.update(map, frame(), context)
    expect(easeTo).toHaveBeenCalledTimes(1)

    controller.suspend()
    expect(controller.isFollowing()).toBe(false)
    expect(controller.followState()).toBe("user-pan")

    // New fixes keep arriving, and the map is left exactly where the rider put it.
    controller.update(map, frame({ timestamp: 2_000 }), context)
    controller.update(map, frame({ timestamp: 3_000 }), context)
    expect(easeTo).toHaveBeenCalledTimes(1)
  })

  it("restores following in one controlled move on recenter", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    controller.suspend()
    controller.recenter(map, frame(), context)

    expect(controller.isFollowing()).toBe(true)
    expect(easeTo).toHaveBeenCalledTimes(1)
    const options = easeTo.mock.calls[0]![0]
    expect(options.duration).toBe(0)
    // Due east along the route; sampled from geometry, so not exactly 90.
    expect(options.bearing).toBeCloseTo(90, 1)
    expect(options.padding).toEqual(PADDING)
  })

  it("keeps following after recenter", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    controller.suspend()
    controller.recenter(map, frame(), context)
    // The route tangent is authoritative over the frame's declared bearing,
    // so following is proven by the rider actually travelling.
    controller.update(map, frame({
      timestamp: 5_000,
      matchedDistanceMeters: 1_200,
      rawCoordinate: [-76.8790, 40.2700]
    }), context)
    expect(easeTo).toHaveBeenCalledTimes(2)
  })

  it("starts following again from scratch after a reset", () => {
    const controller = new NavigationCameraController()
    controller.suspend()
    controller.reset()
    expect(controller.isFollowing()).toBe(true)
  })
})

describe("camera churn", () => {
  it("issues no camera move when nothing meaningful changed", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    const first = frame()
    controller.update(map, first, context)
    expect(easeTo).toHaveBeenCalledTimes(1)

    // The identical frame a second later must not cost another camera move:
    // every move ends in a moveend, which drives viewport layer fetches.
    controller.update(map, { ...first, timestamp: 2_000 }, context)
    expect(easeTo).toHaveBeenCalledTimes(1)
  })

  it("does move when the rider has actually travelled", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    controller.update(map, frame(), context)
    controller.update(map, frame({
      timestamp: 2_000,
      matchedDistanceMeters: 1_100,
      rawCoordinate: [-76.8800, 40.2700]
    }), context)
    expect(easeTo).toHaveBeenCalledTimes(2)
  })

  it("always applies a recenter even when nothing changed", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    const only = frame()
    controller.update(map, only, context)
    controller.recenter(map, only, context)
    expect(easeTo).toHaveBeenCalledTimes(2)
  })
})

describe("heading trust through the controller", () => {
  it("stops steering by the route when the engine calls the match ambiguous", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    // No geometry, so the frame's own tangent is the only route signal, and
    // an ambiguous match must send the camera to the device course instead.
    controller.update(map, frame({
      matchAmbiguous: true,
      routeBearingDegrees: 270,
      headingDegrees: 90
    }), { padding: PADDING })
    expect(easeTo.mock.calls[0]![0].bearing).toBe(90)
  })

  it("returns to the route tangent once matching recovers, without spinning", () => {
    const { map, easeTo } = fakeMap()
    const controller = new NavigationCameraController()
    controller.update(map, frame({ status: "off-route", headingDegrees: 350, routeBearingDegrees: 10 }), { padding: PADDING })
    const lost = easeTo.mock.calls[0]![0].bearing as number
    expect(lost).toBe(350)

    controller.update(map, frame({
      timestamp: 2_000,
      status: "navigating",
      distanceFromRouteMeters: 5,
      headingDegrees: 350,
      routeBearingDegrees: 10,
      rawCoordinate: [-76.8850, 40.2700],
      matchedDistanceMeters: 1_050
    }), { padding: PADDING })
    const recovered = easeTo.mock.calls[1]![0].bearing as number
    // Recovering toward 10 degrees from 350 goes forward through north, so the
    // result sits in the short arc rather than swinging back through south.
    expect(recovered > 340 || recovered < 30).toBe(true)
  })
})
