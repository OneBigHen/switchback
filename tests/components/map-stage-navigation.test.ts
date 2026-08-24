import { afterEach, describe, expect, it, vi } from "vitest"
import type { Map as MapLibreMap } from "maplibre-gl"
import type { NavigationFrame } from "@/lib/client/navigation-engine"
import type { PlannedRoute } from "@/lib/routing/types"
import {
  fitSelectedRoute,
  followNavigationFrame
} from "@/components/planner/map-stage-navigation"

interface RecordedFitBounds {
  bounds: [[number, number], [number, number]]
  options: { padding: unknown; duration: number; maxZoom: number }
}

interface RecordedEaseTo {
  options: Record<string, unknown>
}

interface FakeMap {
  map: MapLibreMap
  fitBoundsCalls: RecordedFitBounds[]
  easeToCalls: RecordedEaseTo[]
}

function createFakeMap(): FakeMap {
  const fitBoundsCalls: RecordedFitBounds[] = []
  const easeToCalls: RecordedEaseTo[] = []
  const map = {
    fitBounds: vi.fn((bounds, options) => {
      fitBoundsCalls.push({ bounds, options })
    }),
    easeTo: vi.fn((options) => {
      easeToCalls.push({ options })
    })
  } as unknown as MapLibreMap
  return { map, fitBoundsCalls, easeToCalls }
}

function makeRoute(id: string, geometry: [number, number][]): PlannedRoute {
  return {
    id,
    name: id,
    profile: "twisty",
    geometry,
    waypoints: [],
    instructions: [],
    distanceMiles: 0,
    durationMinutes: 0,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 0,
    turnCount: 0,
    roadMix: {},
    surfaceMix: {},
    routingSource: "preview",
    previewOnly: true
  } as PlannedRoute
}

function makeFrame(overrides: Partial<NavigationFrame> = {}): NavigationFrame {
  return {
    status: "navigating",
    rawCoordinate: [-76.9, 40.0],
    matchedCoordinate: [-76.9, 40.0],
    accuracyMeters: 8,
    headingDegrees: 90,
    speedMetersPerSecond: 12,
    timestamp: 1_000,
    segmentIndex: 0,
    segmentFraction: 0,
    matchedDistanceMeters: 0,
    distanceFromRouteMeters: 0,
    routePercent: 0,
    remainingDistanceMeters: 0,
    remainingDurationSeconds: 0,
    instructionIndex: 0,
    instruction: null,
    thenInstruction: null,
    distanceToInstructionMeters: 0,
    offRouteFixCount: 0,
    offRouteSince: null,
    matchAmbiguous: false,
    ...overrides
  } as NavigationFrame
}

describe("fitSelectedRoute", () => {
  afterEach(() => {
    document.getElementById("planner-sheet")?.remove()
  })

  it("fits the map to the bounding box of the selected route geometry", () => {
    const route = makeRoute("route-a", [
      [-76.9, 40.0],
      [-76.8, 40.2],
      [-77.0, 40.1]
    ])
    const fake = createFakeMap()

    fitSelectedRoute(fake.map, {
      routes: [route],
      selectedRouteId: "route-a",
      rideMode: false
    })

    expect(fake.fitBoundsCalls).toHaveLength(1)
    const call = fake.fitBoundsCalls[0]
    expect(call.bounds).toEqual([
      [-77.0, 40.0],
      [-76.8, 40.2]
    ])
    expect(call.options.duration).toBe(900)
    expect(call.options.maxZoom).toBe(15)
  })

  it("measures the mobile sheet when reserving route-fit space", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 })
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 })
    const sheet = document.createElement("aside")
    sheet.id = "planner-sheet"
    sheet.getBoundingClientRect = () => ({ x: 8, y: 420, top: 420, right: 382, bottom: 836, left: 8, width: 374, height: 416, toJSON: () => ({}) })
    document.body.append(sheet)
    const fake = createFakeMap()

    fitSelectedRoute(fake.map, {
      routes: [makeRoute("route-a", [[-76.9, 40], [-76.8, 40.2]])],
      selectedRouteId: "route-a",
      rideMode: false
    })

    expect(fake.fitBoundsCalls[0]?.options.padding).toMatchObject({ bottom: 448 })
  })

  it("still fits when in ride mode if no navigation frame is active", () => {
    const route = makeRoute("route-a", [
      [-76.9, 40.0],
      [-76.8, 40.2]
    ])
    const fake = createFakeMap()

    fitSelectedRoute(fake.map, {
      routes: [route],
      selectedRouteId: "route-a",
      rideMode: true,
      navigationFrame: null
    })

    expect(fake.fitBoundsCalls).toHaveLength(1)
  })

  it("is a no-op when in ride mode with an active navigation frame", () => {
    const route = makeRoute("route-a", [
      [-76.9, 40.0],
      [-76.8, 40.2]
    ])
    const fake = createFakeMap()

    fitSelectedRoute(fake.map, {
      routes: [route],
      selectedRouteId: "route-a",
      rideMode: true,
      navigationFrame: makeFrame()
    })

    expect(fake.fitBoundsCalls).toHaveLength(0)
  })

  it("is a no-op when no route matches the selected id", () => {
    const route = makeRoute("route-a", [
      [-76.9, 40.0],
      [-76.8, 40.2]
    ])
    const fake = createFakeMap()

    fitSelectedRoute(fake.map, {
      routes: [route],
      selectedRouteId: "route-missing",
      rideMode: false
    })

    expect(fake.fitBoundsCalls).toHaveLength(0)
  })

  it("is a no-op when the selected route has fewer than two geometry points", () => {
    const route = makeRoute("route-a", [[-76.9, 40.0]])
    const fake = createFakeMap()

    fitSelectedRoute(fake.map, {
      routes: [route],
      selectedRouteId: "route-a",
      rideMode: false
    })

    expect(fake.fitBoundsCalls).toHaveLength(0)
  })

  it("is a no-op when the route list is empty", () => {
    const fake = createFakeMap()

    fitSelectedRoute(fake.map, {
      routes: [],
      selectedRouteId: "route-a",
      rideMode: false
    })

    expect(fake.fitBoundsCalls).toHaveLength(0)
  })
})

describe("followNavigationFrame", () => {
  it("eases the map to the rider raw coordinate with the frame heading as bearing", () => {
    const frame = makeFrame({
      rawCoordinate: [-77.1, 40.3],
      headingDegrees: 92
    })
    const fake = createFakeMap()

    followNavigationFrame(fake.map, frame)

    expect(fake.easeToCalls).toHaveLength(1)
    const options = fake.easeToCalls[0].options
    expect(options.center).toEqual([-77.1, 40.3])
    expect(options.bearing).toBe(92)
    expect(options.duration).toBe(650)
    expect(options.essential).toBe(true)
  })

  it("omits the bearing option when the frame has no heading", () => {
    const frame = makeFrame({ headingDegrees: null })
    const fake = createFakeMap()

    followNavigationFrame(fake.map, frame)

    expect(fake.easeToCalls).toHaveLength(1)
    const options = fake.easeToCalls[0].options
    expect("bearing" in options).toBe(false)
    expect(options.duration).toBe(650)
    expect(options.essential).toBe(true)
  })

  it("snaps immediately with duration 0 when the immediate flag is set", () => {
    const frame = makeFrame({ rawCoordinate: [-77.1, 40.3] })
    const fake = createFakeMap()

    followNavigationFrame(fake.map, frame, true)

    expect(fake.easeToCalls).toHaveLength(1)
    const options = fake.easeToCalls[0].options
    expect(options.duration).toBe(0)
    expect(options.center).toEqual([-77.1, 40.3])
  })

  it("animates with duration 650 by default", () => {
    const frame = makeFrame()
    const fake = createFakeMap()

    followNavigationFrame(fake.map, frame)

    expect(fake.easeToCalls).toHaveLength(1)
    expect(fake.easeToCalls[0].options.duration).toBe(650)
  })

  it("does not call fitBounds", () => {
    const frame = makeFrame()
    const fake = createFakeMap()

    followNavigationFrame(fake.map, frame)

    expect(fake.fitBoundsCalls).toHaveLength(0)
  })
})
