import { describe, expect, it } from "vitest"
import {
  buildNavigationModel,
  buildRemainingRoutePoints,
  coordinateAtRouteDistance,
  updateNavigation
} from "@/lib/client/navigation-engine"
import type { PlannedRoute } from "@/lib/routing/types"

const route: PlannedRoute = {
  id: "navigation-route",
  name: "Navigation route",
  profile: "twisty",
  geometry: [
    [-77, 40],
    [-76.99, 40],
    [-76.98, 40],
    [-76.98, 39.99],
    [-76.97, 39.99]
  ],
  waypoints: [
    { lat: 40, lon: -77, label: "Start" },
    { lat: 40, lon: -76.98, label: "Fuel" },
    { lat: 39.99, lon: -76.97, label: "Finish" }
  ],
  instructions: [
    {
      distanceMeters: 1_700,
      timeMilliseconds: 120_000,
      sign: 0,
      text: "Head east",
      streetName: "Ridge Road",
      interval: [0, 2]
    },
    {
      distanceMeters: 1_100,
      timeMilliseconds: 90_000,
      sign: 2,
      text: "Turn right",
      streetName: "River Road",
      interval: [2, 3]
    },
    {
      distanceMeters: 850,
      timeMilliseconds: 60_000,
      sign: -2,
      text: "Turn left",
      streetName: "Valley Road",
      interval: [3, 4]
    }
  ],
  distanceMiles: 2.25,
  durationMinutes: 4.5,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 50,
  turnCount: 2,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

function fix(
  coordinate: [number, number],
  overrides: Partial<Parameters<typeof updateNavigation>[1]> = {}
) {
  return {
    coordinate,
    accuracyMeters: 6,
    headingDegrees: 90,
    speedMetersPerSecond: 12,
    timestamp: 1_000,
    ...overrides
  }
}

describe("position-aware navigation engine", () => {
  it("starts at the rider's live position and selects the next real maneuver", () => {
    const model = buildNavigationModel(route)
    const frame = updateNavigation(model, fix([-76.985, 40]))

    expect(frame.status).toBe("navigating")
    expect(frame.routePercent).toBeGreaterThan(30)
    expect(frame.routePercent).toBeLessThan(45)
    expect(frame.instruction?.text).toBe("Turn right")
    expect(frame.instruction?.streetName).toBe("River Road")
    expect(frame.matchedCoordinate[0]).toBeCloseTo(-76.985, 5)
  })

  it("never adds a durably completed shaping stop back into a recovery route", () => {
    const model = buildNavigationModel(route)
    const frame = updateNavigation(model, fix([-76.995, 40]))

    const remaining = buildRemainingRoutePoints(route, frame, frame.rawCoordinate, [1])

    expect(remaining.map((point) => point.label)).not.toContain("Fuel")
    expect(remaining.map((point) => point.label)).toContain("Finish")
  })

  it("measures maneuver distance from the fractional position on the current segment", () => {
    const model = buildNavigationModel(route)
    const nearStart = updateNavigation(model, fix([-76.995, 40]))
    const fartherAlong = updateNavigation(model, fix([-76.985, 40], { timestamp: 2_000 }), nearStart)

    expect(nearStart.distanceToInstructionMeters).toBeGreaterThan(1_200)
    expect(fartherAlong.distanceToInstructionMeters).toBeGreaterThan(350)
    expect(fartherAlong.distanceToInstructionMeters).toBeLessThan(500)
    expect(fartherAlong.distanceToInstructionMeters).toBeLessThan(nearStart.distanceToInstructionMeters)
  })

  it("uses heading and continuity instead of jumping at an overlapping out-and-back leg", () => {
    const retraced: PlannedRoute = {
      ...route,
      id: "retraced",
      geometry: [
        [-77, 40],
        [-76.99, 40],
        [-76.98, 40],
        [-76.99, 40],
        [-77, 40]
      ],
      instructions: [
        { ...route.instructions[0], text: "Continue outbound", streetName: "Outbound", interval: [0, 2] },
        { ...route.instructions[1], sign: -2, text: "Make the turnaround", streetName: "Turnaround", interval: [2, 3] },
        { ...route.instructions[2], text: "Continue home", streetName: "Inbound", interval: [3, 4] }
      ]
    }
    const model = buildNavigationModel(retraced)
    const outbound = updateNavigation(model, fix([-76.995, 40], { headingDegrees: 90 }))
    const outboundNext = updateNavigation(
      model,
      fix([-76.99, 40], { headingDegrees: null, timestamp: 2_000 }),
      outbound
    )
    const inbound = updateNavigation(model, fix([-76.99, 40], { headingDegrees: 270 }))

    expect(outbound.routePercent).toBeLessThan(25)
    expect(outboundNext.routePercent).toBeLessThan(35)
    expect(inbound.routePercent).toBeGreaterThan(65)
    expect(inbound.instruction?.streetName).toBe("Inbound")
  })

  it("derives travel course from successive fixes when the browser omits heading", () => {
    const model = buildNavigationModel(route)
    const first = updateNavigation(model, fix([-76.997, 40], {
      headingDegrees: null,
      speedMetersPerSecond: 10,
      timestamp: 1_000
    }))
    const second = updateNavigation(model, fix([-76.996, 40], {
      headingDegrees: null,
      speedMetersPerSecond: 10,
      timestamp: 2_000
    }), first)

    expect(second.headingDegrees).toBeCloseTo(90, 0)
  })

  it("waits for sustained deviation before changing from deviating to off-route", () => {
    const model = buildNavigationModel(route)
    const first = updateNavigation(model, fix([-76.995, 40.001], { timestamp: 1_000 }))
    const second = updateNavigation(model, fix([-76.994, 40.001,], { timestamp: 3_000 }), first)
    const third = updateNavigation(model, fix([-76.993, 40.001], { timestamp: 5_000 }), second)

    expect(first.status).toBe("deviating")
    expect(second.status).toBe("deviating")
    expect(third.status).toBe("off-route")
    expect(third.distanceFromRouteMeters).toBeGreaterThan(80)
  })

  it("does not advance guidance from a very inaccurate GPS fix", () => {
    const model = buildNavigationModel(route)
    const reliable = updateNavigation(model, fix([-76.995, 40]))
    const weak = updateNavigation(
      model,
      fix([-76.98, 39.99], { accuracyMeters: 180, timestamp: 2_000 }),
      reliable
    )

    expect(weak.status).toBe("weak-signal")
    expect(weak.routePercent).toBe(reliable.routePercent)
    expect(weak.instruction).toEqual(reliable.instruction)
  })

  it("recognizes arrival only when the live position reaches the end of the route", () => {
    const model = buildNavigationModel(route)
    const frame = updateNavigation(
      model,
      fix([-76.97001, 39.99], { headingDegrees: 90, speedMetersPerSecond: 1 })
    )

    expect(frame.status).toBe("arrived")
    expect(frame.remainingDistanceMeters).toBeLessThan(40)
    expect(frame.routePercent).toBeGreaterThan(98)
  })

  it("reroutes from the actual rider position through only the remaining authored stops", () => {
    const model = buildNavigationModel(route)
    const frame = updateNavigation(model, fix([-76.979, 39.999]))

    expect(buildRemainingRoutePoints(route, frame, [-76.9785, 39.9985])).toEqual([
      { lat: 39.9985, lon: -76.9785, label: "Current location" },
      { lat: 39.99, lon: -76.97, label: "Finish" }
    ])
  })

  it("can choose a forward on-route recovery point without rounding to a geometry vertex", () => {
    const model = buildNavigationModel(route)
    const halfway = coordinateAtRouteDistance(model, model.totalDistanceMeters / 2)

    expect(halfway[0]).toBeCloseTo(-76.98, 4)
    expect(halfway[1]).toBeCloseTo(39.999, 2)
  })

  it("matches a live fix against a 50,000-point track within a navigation-frame budget", () => {
    const geometry = Array.from({ length: 50_000 }, (_, index) => (
      [-77 + index * 0.00001, 40 + Math.sin(index / 250) * 0.0005] as [number, number]
    ))
    const largeRoute: PlannedRoute = {
      ...route,
      id: "large-track",
      geometry,
      waypoints: [
        { lat: geometry[0]![1], lon: geometry[0]![0], label: "Start" },
        { lat: geometry.at(-1)![1], lon: geometry.at(-1)![0], label: "Finish" }
      ],
      instructions: []
    }
    const model = buildNavigationModel(largeRoute)
    expect(model.spatialIndex.size).toBeGreaterThan(100)

    const startedAt = performance.now()
    const frame = updateNavigation(model, fix(geometry[25_000]!, { headingDegrees: 90 }))
    const elapsed = performance.now() - startedAt

    expect(frame.segmentIndex).toBeGreaterThan(24_900)
    expect(frame.segmentIndex).toBeLessThan(25_100)
    expect(elapsed).toBeLessThan(75)
  })
})
