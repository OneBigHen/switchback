import { describe, expect, it, vi } from "vitest"
import type { Map as MapLibreMap } from "maplibre-gl"
import type { NavigationFrame } from "@/lib/client/navigation-engine"
import type { PlannedRoute } from "@/lib/routing/types"
import {
  fitSelectedRoute,
  followNavigationFrame
} from "@/components/planner/map-stage-navigation"
import {
  FOLLOW_EASE_ID,
  NavigationCameraController
} from "@/lib/client/navigation-camera-controller"
import { calculateRideFollowInsets } from "@/components/planner/workspace/map-viewport-insets"

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
    }),
    // The follow camera reads the live pose back off the map.
    getBearing: () => 0,
    getPitch: () => 0,
    getZoom: () => 15,
    getCenter: () => ({ lng: -77, lat: 40 })
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
  function controller() {
    return new NavigationCameraController()
  }

  it("frames the rider through the shared navigation inset model", () => {
    const frame = makeFrame({ rawCoordinate: [-77.1, 40.3], headingDegrees: 92 })
    const fake = createFakeMap()

    followNavigationFrame(fake.map, controller(), frame)

    expect(fake.easeToCalls).toHaveLength(1)
    const options = fake.easeToCalls[0].options
    expect(options.essential).toBe(true)
    // The padding is what places the rider low in frame; it must come from
    // the tested inset model rather than a second hardcoded table.
    expect(options.padding).toEqual(
      calculateRideFollowInsets({
        viewportWidthPx: window.innerWidth,
        viewportHeightPx: window.innerHeight,
        mode: "ride"
      })
    )
  })

  it("keeps chained follow eases free of move events", () => {
    const fake = createFakeMap()

    followNavigationFrame(fake.map, controller(), makeFrame())

    const options = fake.easeToCalls[0].options as Record<string, unknown>
    // Interrupting an ease that shares an id emits no movestart/moveend, and
    // those events are what drive the viewport-scoped layer fetches.
    expect(options.easeId).toBe(FOLLOW_EASE_ID)
    expect(options.noMoveStart).toBe(true)
  })

  it("snaps immediately when recentring", () => {
    const frame = makeFrame({ rawCoordinate: [-77.1, 40.3] })
    const fake = createFakeMap()

    followNavigationFrame(fake.map, controller(), frame, { immediate: true })

    expect(fake.easeToCalls).toHaveLength(1)
    expect(fake.easeToCalls[0].options.duration).toBe(0)
  })

  it("still follows a rider with no heading at all", () => {
    const frame = makeFrame({ headingDegrees: null, routeBearingDegrees: undefined })
    const fake = createFakeMap()

    expect(followNavigationFrame(fake.map, controller(), frame)).toBe(true)
    expect(fake.easeToCalls).toHaveLength(1)
    expect(Number.isFinite(fake.easeToCalls[0].options.bearing as number)).toBe(true)
  })

  it("does not call fitBounds", () => {
    const fake = createFakeMap()

    followNavigationFrame(fake.map, controller(), makeFrame())

    expect(fake.fitBoundsCalls).toHaveLength(0)
  })

  it("reports that it made no move once the rider has stopped moving", () => {
    const fake = createFakeMap()
    const shared = controller()
    const frame = makeFrame()

    expect(followNavigationFrame(fake.map, shared, frame)).toBe(true)
    // An identical frame must not cost a second camera move.
    expect(followNavigationFrame(fake.map, shared, { ...frame, timestamp: frame.timestamp + 1000 })).toBe(false)
    expect(fake.easeToCalls).toHaveLength(1)
  })

  it("stops moving the map once the rider takes it over", () => {
    const fake = createFakeMap()
    const shared = controller()
    shared.suspend()

    expect(followNavigationFrame(fake.map, shared, makeFrame())).toBe(false)
    expect(fake.easeToCalls).toHaveLength(0)
  })
})
