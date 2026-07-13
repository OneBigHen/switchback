import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RideHud } from "@/components/planner/RideHud"
import { startRideSession } from "@/lib/client/ride-session"
import type { PlannedRoute } from "@/lib/routing/types"

vi.mock("@/lib/client/ride-session", () => ({
  startRideSession: vi.fn(async ({ onError }: { onError(error: { message: string }): void }) => {
    onError({ message: "Location permission denied" })
    return { stop: vi.fn(async () => undefined) }
  })
}))

const route: PlannedRoute = {
  id: "ride",
  name: "Twisty route",
  profile: "twisty",
  geometry: [[-77, 40], [-76.9, 40]],
  waypoints: [],
  instructions: [{
    distanceMeters: 1_000,
    timeMilliseconds: 60_000,
    sign: -2,
    text: "Turn left",
    streetName: "Ridge Road",
    interval: [0, 1]
  }],
  distanceMiles: 5,
  durationMinutes: 10,
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
  name: "Out and back",
  geometry: [
    [-77, 40],
    [-76.9, 40],
    [-76.8, 40],
    [-76.9, 40],
    [-77, 40]
  ],
  instructions: [
    {
      distanceMeters: 1_000,
      timeMilliseconds: 60_000,
      sign: 0,
      text: "Continue east",
      streetName: "Outbound Road",
      interval: [1, 2]
    },
    {
      distanceMeters: 1_000,
      timeMilliseconds: 60_000,
      sign: -2,
      text: "Continue west",
      streetName: "Return Road",
      interval: [3, 4]
    }
  ]
}

function gpsPosition({
  longitude,
  latitude,
  heading
}: {
  longitude: number
  latitude: number
  heading: number | null
}): GeolocationPosition {
  return {
    coords: {
      accuracy: 8,
      altitude: null,
      altitudeAccuracy: null,
      heading,
      latitude,
      longitude,
      speed: 8,
      toJSON: () => ({})
    },
    timestamp: Date.now(),
    toJSON: () => ({})
  }
}

describe("ride HUD GPS safety", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(startRideSession).mockImplementation(async ({ onError }) => {
      onError({ message: "Location permission denied" } as GeolocationPositionError)
      return { stop: vi.fn(async () => undefined) }
    })
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: undefined })
  })

  afterEach(() => {
    cleanup()
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: undefined })
  })

  it("does not claim active guidance before an accurate GPS fix", async () => {
    render(<RideHud route={route} onExit={vi.fn()} />)

    await waitFor(() => expect(screen.getByText("Location permission denied")).toBeInTheDocument())
    expect(screen.getByText("Route preview")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /GPS fix required/i })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Turn left" })).not.toBeInTheDocument()
  })

  it("explains that live guidance needs HTTPS on a non-secure origin", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false })
    render(<RideHud route={route} onExit={vi.fn()} />)

    expect(await screen.findByText("Open Switchback over HTTPS to use live guidance."))
      .toBeInTheDocument()
    expect(startRideSession).not.toHaveBeenCalled()
    expect(screen.getByText("Route preview")).toBeInTheDocument()
  })

  it("withholds maneuver guidance when an overlapping route match is ambiguous", async () => {
    vi.mocked(startRideSession).mockImplementation(async ({ onPosition }) => {
      onPosition(gpsPosition({ longitude: -76.95, latitude: 40, heading: null }))
      return { stop: vi.fn(async () => undefined) }
    })

    render(<RideHud route={retracedRoute} onExit={vi.fn()} />)

    expect(await screen.findByRole("heading", { name: "Route match unclear" })).toBeInTheDocument()
    expect(screen.getByText("Position uncertain")).toBeInTheDocument()
    expect(screen.queryByText(/Next instruction/i)).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Continue east" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Continue west" })).not.toBeInTheDocument()
  })
})
