import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RideHud } from "@/components/planner/RideHud"
import { RideRecoveryActions } from "@/components/planner/RideRecoveryActions"
import { RideWeatherAlert } from "@/components/planner/RideWeatherAlert"
import { getRideMapControlSlot } from "@/components/planner/ride-map-control-slot"
import { startRideSession } from "@/lib/client/ride-session"
import { requestTripPlan } from "@/lib/client/routing-client"
import { requestRouteWeather } from "@/lib/client/weather-client"
import { loadRideRecovery } from "@/lib/storage/ride-recovery"
import { discoverPlaceIdeas } from "@/lib/client/place-ideas-client"
import { usePlannerStore } from "@/stores/planner-store"
import type { PlaceResult } from "@/lib/geocoding/photon"
import type { PlannedRoute } from "@/lib/routing/types"
import type { RouteWeatherAlert } from "@/lib/weather/types"

vi.mock("@/lib/client/ride-session", () => ({
  startRideSession: vi.fn(async ({ onError }: { onError(error: { message: string }): void }) => {
    onError({ message: "Location permission denied" })
    return { stop: vi.fn(async () => undefined) }
  })
}))

vi.mock("@/lib/client/routing-client", () => ({
  requestTripPlan: vi.fn()
}))

vi.mock("@/lib/client/place-ideas-client", () => ({
  discoverPlaceIdeas: vi.fn()
}))

vi.mock("@/lib/client/weather-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/client/weather-client")>()
  return { ...original, requestRouteWeather: vi.fn() }
})

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

const rejoinRoute: PlannedRoute = {
  ...route,
  id: "rejoin-route",
  geometry: [[-77, 40], [-76.9, 40], [-76.8, 40], [-76.7, 40]] as [number, number][],
  waypoints: [
    { lat: 40, lon: -77, label: "Start" },
    { lat: 40, lon: -76.8, label: "Fuel stop" },
    { lat: 40, lon: -76.7, label: "Finish" }
  ]
}

function gpsPosition({
  longitude,
  latitude,
  heading,
  accuracy = 8,
  speed = 8,
  timestamp = Date.now()
}: {
  longitude: number
  latitude: number
  heading: number | null
  accuracy?: number
  speed?: number | null
  timestamp?: number
}): GeolocationPosition {
  return {
    coords: {
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading,
      latitude,
      longitude,
      speed,
      toJSON: () => ({})
    },
    timestamp,
    toJSON: () => ({})
  }
}

describe("ride HUD GPS safety", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    window.localStorage.clear()
    document.documentElement.classList.remove("ride-mode-active")
    document.body.classList.remove("ride-mode-active")
    vi.mocked(startRideSession).mockImplementation(async ({ onError }) => {
      onError({ message: "Location permission denied" } as GeolocationPositionError)
      return { stop: vi.fn(async () => undefined) }
    })
    vi.mocked(requestTripPlan).mockReset()
    vi.mocked(discoverPlaceIdeas).mockReset()
    vi.mocked(requestRouteWeather).mockReset()
    vi.mocked(requestRouteWeather).mockResolvedValue({ source: "nws", samples: [] })
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: undefined })
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
    window.sessionStorage.clear()
    window.localStorage.clear()
    document.documentElement.classList.remove("ride-mode-active")
    document.body.classList.remove("ride-mode-active")
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: undefined })
  })

  it("locks the document viewport only while ride mode is mounted", () => {
    const { unmount } = render(<RideHud route={route} onExit={vi.fn()} />)

    expect(document.documentElement).toHaveClass("ride-mode-active")
    expect(document.body).toHaveClass("ride-mode-active")

    unmount()

    expect(document.documentElement).not.toHaveClass("ride-mode-active")
    expect(document.body).not.toHaveClass("ride-mode-active")
  })

  it("gives the recenter control and the instruction card one layout owner", () => {
    // The card's height is legitimately variable — one wrapped turn line, or
    // the whole off-route recovery list. Nothing may be positioned against a
    // guessed offset above it, so the recenter slot and the card are siblings
    // in one deck and are laid out with a real gap instead.
    const { container } = render(<RideHud route={route} onExit={vi.fn()} />)

    const deck = container.querySelector(".ride-lower-deck")
    expect(deck).not.toBeNull()

    const slot = deck?.querySelector(".ride-map-control-slot")
    const card = deck?.querySelector(".ride-instruction")
    expect(slot).toBeTruthy()
    expect(card).toBeTruthy()
    if (!slot || !card) throw new Error("ride lower deck is missing a child")

    // Order matters: the control sits above the card in the column.
    expect(slot.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // MapStage portals the control here, so the slot must be addressable.
    expect(slot.id).toBe("ride-map-control-slot")
  })

  it("republishes the recenter slot when the HUD remounts for a recovery line", () => {
    // The HUD is keyed by route id, so an accepted rejoin replaces the whole
    // component — including its slot element. MapStage subscribes to the
    // published element rather than capturing one, or the portal would keep
    // rendering into a detached node and the control would vanish mid-recovery.
    const { container, unmount } = render(<RideHud route={route} onExit={vi.fn()} />)

    const firstSlot = container.querySelector(".ride-map-control-slot")
    expect(firstSlot).toBeTruthy()
    expect(getRideMapControlSlot()).toBe(firstSlot)

    unmount()
    expect(getRideMapControlSlot()).toBeNull()

    const rerendered = render(<RideHud route={{ ...route, id: "recovery-line" }} onExit={vi.fn()} />)
    const secondSlot = rerendered.container.querySelector(".ride-map-control-slot")
    expect(secondSlot).toBeTruthy()
    expect(secondSlot).not.toBe(firstSlot)
    expect(getRideMapControlSlot()).toBe(secondSlot)
  })

  it("does not claim active guidance before an accurate GPS fix", async () => {
    render(<RideHud route={route} onExit={vi.fn()} />)

    await waitFor(() => expect(screen.getByText("Location permission denied")).toBeInTheDocument())
    expect(screen.getByText("Route preview")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /GPS fix required/i })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Turn left" })).not.toBeInTheDocument()
  })

  it("lets the rider retry GPS permission without leaving ride mode", async () => {
    render(<RideHud route={route} onExit={vi.fn()} />)

    const retry = await screen.findByRole("button", { name: "Try GPS again" })
    fireEvent.click(retry)
    await waitFor(() => expect(startRideSession).toHaveBeenCalledTimes(2))
  })

  it("pauses and resumes guidance without leaving ride mode", async () => {
    render(<RideHud route={route} onExit={vi.fn()} />)

    const pause = await screen.findByRole("button", { name: "Pause guidance" })
    fireEvent.click(pause)
    expect(screen.getByRole("button", { name: "Resume guidance" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Guidance paused" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Resume guidance" }))
    expect(screen.getByRole("button", { name: "Pause guidance" })).toBeInTheDocument()
  })

  it("keeps a durable checkpoint when the rider pauses for an overnight stop", async () => {
    render(<RideHud route={rejoinRoute} onExit={vi.fn()} />)

    fireEvent.click(await screen.findByRole("button", { name: "Pause for overnight stop" }))

    expect(screen.getByRole("heading", { name: "Guidance paused" })).toBeInTheDocument()
    expect(loadRideRecovery(rejoinRoute.id)).toMatchObject({
      routeId: rejoinRoute.id,
      pausedAt: expect.any(String)
    })
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

  it("publishes the same live navigation frame that drives the maneuver HUD", async () => {
    const onNavigationFrame = vi.fn()
    vi.mocked(startRideSession).mockImplementation(async ({ onPosition }) => {
      onPosition(gpsPosition({ longitude: -76.95, latitude: 40, heading: 90, timestamp: 1_000 }))
      return { stop: vi.fn(async () => undefined) }
    })

    render(
      <RideHud
        route={route}
        onExit={vi.fn()}
        onNavigationFrame={onNavigationFrame}
      />
    )

    await waitFor(() => expect(onNavigationFrame).toHaveBeenCalled())
    expect(onNavigationFrame).toHaveBeenLastCalledWith(expect.objectContaining({
      rawCoordinate: [-76.95, 40],
      matchedCoordinate: expect.any(Array),
      status: "navigating",
      routePercent: expect.any(Number)
    }))
  })

  it("marks a previously healthy GPS stream stale until a fresh fix arrives", async () => {
    vi.useFakeTimers()
    let publishPosition!: (position: GeolocationPosition) => void
    vi.mocked(startRideSession).mockImplementation(async ({ onPosition }) => {
      publishPosition = onPosition
      return { stop: vi.fn(async () => undefined) }
    })

    render(<RideHud route={route} onExit={vi.fn()} />)
    publishPosition(gpsPosition({ longitude: -76.95, latitude: 40, heading: 90 }))
    await act(async () => { await vi.advanceTimersByTimeAsync(25_001) })

    expect(screen.getAllByText("GPS signal stale · waiting for a fresh location")).toHaveLength(2)

    act(() => publishPosition(gpsPosition({ longitude: -76.94, latitude: 40, heading: 90 })))
    expect(screen.queryByText("GPS signal stale · waiting for a fresh location")).not.toBeInTheDocument()
  })

  it("requires sustained deviation before presenting off-route recovery", async () => {
    let publishPosition: PositionCallback | null = null
    vi.mocked(startRideSession).mockImplementation(async ({ onPosition }) => {
      publishPosition = onPosition
      return { stop: vi.fn(async () => undefined) }
    })

    render(<RideHud route={route} onExit={vi.fn()} />)
    await waitFor(() => expect(publishPosition).not.toBeNull())

    act(() => publishPosition!(gpsPosition({ longitude: -75.8, latitude: 40.8, heading: 220, timestamp: 1_000 })))
    expect(screen.queryByRole("button", { name: /nearest rejoin/i })).not.toBeInTheDocument()
    act(() => publishPosition!(gpsPosition({ longitude: -75.8, latitude: 40.8, heading: 220, timestamp: 3_000 })))
    expect(screen.queryByRole("button", { name: /nearest rejoin/i })).not.toBeInTheDocument()
    act(() => publishPosition!(gpsPosition({ longitude: -75.8, latitude: 40.8, heading: 220, timestamp: 5_000 })))

    expect(screen.getByRole("button", { name: /nearest rejoin/i })).toBeInTheDocument()
    expect(loadRideRecovery(route.id)).toMatchObject({
      deviationHistory: [{ coordinate: [-75.8, 40.8] }]
    })
    expect(requestTripPlan).not.toHaveBeenCalled()
  })

  it("requires the rider to select a verified fuel stop before routing a fuel detour", async () => {
    let publishPosition: PositionCallback | null = null
    vi.mocked(discoverPlaceIdeas).mockResolvedValue({
      provider: "photon",
      rankedBy: "distance",
      places: [{
        id: "fuel-1", name: "Ridge Fuel", label: "Ridge Fuel, New Hope, PA",
        region: "Pennsylvania", country: "United States", lat: 40.4, lon: -76.7, kind: "fuel"
      }]
    })
    vi.mocked(requestTripPlan).mockResolvedValue({
      selectedRouteId: "fuel-reroute",
      routes: [{ ...rejoinRoute, id: "fuel-reroute" }],
      warnings: []
    })
    vi.mocked(startRideSession).mockImplementation(async ({ onPosition }) => {
      publishPosition = onPosition
      return { stop: vi.fn(async () => undefined) }
    })

    render(<RideHud route={rejoinRoute} onExit={vi.fn()} onReroute={vi.fn()} />)
    await waitFor(() => expect(publishPosition).not.toBeNull())
    for (const timestamp of [1_000, 3_000, 5_000]) {
      act(() => publishPosition!(gpsPosition({ longitude: -75.8, latitude: 40.8, heading: 220, timestamp })))
    }

    fireEvent.click(screen.getByRole("button", { name: /find fuel/i }))
    expect(await screen.findByRole("button", { name: /route to ridge fuel/i })).toBeInTheDocument()
    expect(discoverPlaceIdeas).toHaveBeenCalledWith(
      "fuel",
      { lat: 40.8, lon: -75.8 },
      25,
      fetch,
      expect.any(AbortSignal)
    )

    fireEvent.click(screen.getByRole("button", { name: /route to ridge fuel/i }))
    await waitFor(() => expect(vi.mocked(requestTripPlan).mock.calls[0]?.[0]).toMatchObject({
      points: [
        { lat: 40.8, lon: -75.8, label: "Current location" },
        { lat: 40.4, lon: -76.7, label: "Fuel · Ridge Fuel" },
        { lat: 40, lon: -76.8, label: "Fuel stop" },
        { lat: 40, lon: -76.7, label: "Finish" }
      ]
    }))
  })

  it("cancels fuel discovery when a different active route replaces the ride", async () => {
    let publishPosition: PositionCallback | null = null
    let fuelSignal: AbortSignal | undefined
    vi.mocked(discoverPlaceIdeas).mockImplementation((_kind, _center, _radiusKm, _fetcher, signal) => {
      fuelSignal = signal
      return new Promise(() => undefined)
    })
    vi.mocked(startRideSession).mockImplementation(async ({ onPosition }) => {
      publishPosition = onPosition
      return { stop: vi.fn(async () => undefined) }
    })

    const { rerender } = render(<RideHud route={rejoinRoute} onExit={vi.fn()} />)
    await waitFor(() => expect(publishPosition).not.toBeNull())
    for (const timestamp of [1_000, 3_000, 5_000]) {
      act(() => publishPosition!(gpsPosition({ longitude: -75.8, latitude: 40.8, heading: 220, timestamp })))
    }
    fireEvent.click(screen.getByRole("button", { name: /find fuel/i }))
    expect(fuelSignal).toBeDefined()

    rerender(<RideHud route={{ ...rejoinRoute, id: "replacement-route" }} onExit={vi.fn()} />)

    expect(fuelSignal?.aborted).toBe(true)
  })

  it("automatically recalculates through remaining stops after sustained off-route travel", async () => {
    let publishPosition: PositionCallback | null = null
    const rerouted = { ...rejoinRoute, id: "automatic-reroute" }
    vi.mocked(requestTripPlan).mockResolvedValue({
      selectedRouteId: rerouted.id,
      routes: [rerouted],
      warnings: []
    })
    vi.mocked(startRideSession).mockImplementation(async ({ onPosition }) => {
      publishPosition = onPosition
      return { stop: vi.fn(async () => undefined) }
    })

    render(<RideHud route={rejoinRoute} onExit={vi.fn()} onReroute={vi.fn()} />)
    await waitFor(() => expect(publishPosition).not.toBeNull())
    for (const timestamp of [1_000, 3_000, 5_000, 10_000]) {
      act(() => publishPosition!(gpsPosition({ longitude: -75.8, latitude: 40.8, heading: 220, timestamp })))
    }

    await waitFor(() => expect(vi.mocked(requestTripPlan).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      compare: false,
      points: [
        { lat: 40.8, lon: -75.8, label: "Current location" },
        { lat: 40, lon: -76.8, label: "Fuel stop" },
        { lat: 40, lon: -76.7, label: "Finish" }
      ]
    })))
    expect(vi.mocked(requestTripPlan).mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal)
  })

  it("requests a safe route back when the rider selects nearest rejoin", async () => {
    const rerouted = {
      ...route,
      id: "rerouted",
      name: "Twisty reroute",
      geometry: [[-75.8, 40.8], [-76.9, 40]] as [number, number][]
    }
    vi.mocked(requestTripPlan).mockResolvedValue({
      selectedRouteId: rerouted.id,
      routes: [rerouted],
      warnings: []
    })
    vi.mocked(startRideSession).mockImplementation(async ({ onPosition }) => {
      for (const timestamp of [1_000, 3_000, 5_000]) {
        onPosition(gpsPosition({ longitude: -75.8, latitude: 40.8, heading: 220, timestamp }))
      }
      return { stop: vi.fn(async () => undefined) }
    })
    const onReroute = vi.fn()

    render(<RideHud route={route} onExit={vi.fn()} onReroute={onReroute} />)

    fireEvent.click(await screen.findByRole("button", { name: /nearest rejoin/i }))
    await waitFor(() => expect(vi.mocked(requestTripPlan).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      profile: "twisty",
      compare: false,
      points: expect.arrayContaining([
        { lat: 40.8, lon: -75.8, label: "Current location" },
        expect.objectContaining({ label: "Nearest safe rejoin" }),
        { lat: 40, lon: -76.9, label: "Destination" }
      ])
    })))
    await waitFor(() => expect(onReroute).toHaveBeenCalledWith(rerouted))
  })

  it("lets the rider choose a rejoin policy instead of silently discarding their intended route", async () => {
    const rerouted = { ...rejoinRoute, id: "next-stop-reroute" }
    vi.mocked(requestTripPlan).mockResolvedValue({
      selectedRouteId: rerouted.id,
      routes: [rerouted],
      warnings: []
    })
    vi.mocked(startRideSession).mockImplementation(async ({ onPosition }) => {
      for (const timestamp of [1_000, 3_000, 5_000]) {
        onPosition(gpsPosition({ longitude: -75.8, latitude: 40.8, heading: 220, timestamp }))
      }
      return { stop: vi.fn(async () => undefined) }
    })

    render(<RideHud route={rejoinRoute} onExit={vi.fn()} onReroute={vi.fn()} />)

    const nextStop = await screen.findByRole("button", { name: /rejoin at the next waypoint/i })
    expect(requestTripPlan).not.toHaveBeenCalled()
    fireEvent.click(nextStop)

    await waitFor(() => expect(vi.mocked(requestTripPlan).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      points: [
        { lat: 40.8, lon: -75.8, label: "Current location" },
        { lat: 40, lon: -76.8, label: "Fuel stop" },
        { lat: 40, lon: -76.7, label: "Finish" }
      ]
    })))
  })

  it("surfaces active NWS alerts while the ride is open", async () => {
    vi.mocked(requestRouteWeather).mockResolvedValue({
      source: "nws",
      samples: [{
        coordinate: { lat: 40, lon: -77 },
        location: { city: "Ridge", state: "PA" },
        status: "ok",
        forecastUpdatedAt: null,
        hourly: [],
        alerts: [{
          id: "storm",
          event: "Flash Flood Warning",
          headline: "Flooding on low-lying roads",
          severity: "Severe",
          urgency: "Immediate",
          certainty: "Observed",
          onset: null,
          expires: null
        }],
        unavailable: []
      }]
    })

    render(<RideHud route={route} onExit={vi.fn()} />)

    expect(await screen.findByRole("alert")).toHaveTextContent("Flash Flood Warning")
    expect(screen.getByRole("alert")).toHaveTextContent("Flooding on low-lying roads")
  })

  it("dismisses an advisory for the rest of the browser ride session", async () => {
    vi.mocked(requestRouteWeather).mockResolvedValue({
      source: "nws",
      samples: [{
        coordinate: { lat: 40, lon: -77 },
        location: { city: "Ridge", state: "PA" },
        status: "ok",
        forecastUpdatedAt: null,
        hourly: [],
        alerts: [{
          id: "heat-wave",
          event: "Extreme Heat Warning",
          headline: "Dangerous heat through this evening",
          severity: "Severe",
          urgency: "Immediate",
          certainty: "Likely",
          onset: null,
          expires: null
        }],
        unavailable: []
      }]
    })

    const firstRide = render(<RideHud route={route} onExit={vi.fn()} />)
    const dismiss = await screen.findByRole("button", { name: "Dismiss Extreme Heat Warning" })

    fireEvent.click(dismiss)

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    firstRide.unmount()

    render(<RideHud route={route} onExit={vi.fn()} />)
    await waitFor(() => expect(requestRouteWeather).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("gives the rider a one-tap voice guidance control", () => {
    render(<RideHud route={route} onExit={vi.fn()} />)

    const mute = screen.getByRole("button", { name: "Mute voice guidance" })
    fireEvent.click(mute)
    expect(screen.getByRole("button", { name: "Enable voice guidance" })).toBeInTheDocument()
  })
})

describe("RideHud presentation extraction", () => {
  const weatherAlert: RouteWeatherAlert = {
    id: "x",
    event: "Flash Flood Warning",
    headline: "Flooding on low-lying roads",
    severity: "Severe",
    urgency: "Immediate",
    certainty: "Observed",
    onset: null,
    expires: null
  }

  afterEach(() => {
    cleanup()
  })

  it("RideWeatherAlert renders alert details and dismisses via accessibility label", async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(<RideWeatherAlert alert={weatherAlert} onDismiss={onDismiss} />)

    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Flash Flood Warning")
    expect(alert).toHaveTextContent("Flooding on low-lying roads")

    await user.click(screen.getByRole("button", { name: "Dismiss Flash Flood Warning" }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("RideRecoveryActions renders rejoin options in idle state and forwards the selected policy", async () => {
    const onRequestRejoin = vi.fn()
    const onFindFuel = vi.fn()
    const onSelectFuelStop = vi.fn()
    const user = userEvent.setup()

    render(
      <RideRecoveryActions
        rerouteStatus="idle"
        rejoinPolicy={null}
        fuelStops={{ status: "idle", places: [] }}
        onRequestRejoin={onRequestRejoin}
        onFindFuel={onFindFuel}
        onSelectFuelStop={onSelectFuelStop}
      />
    )

    await user.click(screen.getByRole("button", { name: /nearest rejoin/i }))
    expect(onRequestRejoin).toHaveBeenCalledWith("nearest-safe")

    await user.click(screen.getByRole("button", { name: /keep original/i }))
    expect(onRequestRejoin).toHaveBeenCalledWith("preserve-original")
  })

  it("RideRecoveryActions shows only the loading row while routing", () => {
    render(
      <RideRecoveryActions
        rerouteStatus="routing"
        rejoinPolicy={null}
        fuelStops={{ status: "idle", places: [] }}
        onRequestRejoin={vi.fn()}
        onFindFuel={vi.fn()}
        onSelectFuelStop={vi.fn()}
      />
    )

    expect(screen.getByText("Finding a safe way back…")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /nearest rejoin/i })).not.toBeInTheDocument()
  })

  it("RideRecoveryActions lists fuel stops when ready and forwards selection", async () => {
    const onSelectFuelStop = vi.fn()
    const user = userEvent.setup()
    const fuelStop = {
      id: "f1",
      name: "Ridge Fuel",
      label: "Ridge Fuel, New Hope, PA",
      region: "Pennsylvania",
      country: "United States",
      lat: 40.4,
      lon: -76.7,
      kind: "fuel"
    } as PlaceResult

    render(
      <RideRecoveryActions
        rerouteStatus="idle"
        rejoinPolicy={null}
        fuelStops={{ status: "ready", places: [fuelStop] }}
        onRequestRejoin={vi.fn()}
        onFindFuel={vi.fn()}
        onSelectFuelStop={onSelectFuelStop}
      />
    )

    const button = screen.getByRole("button", { name: /route to ridge fuel/i })
    expect(button).toBeInTheDocument()

    await user.click(button)
    expect(onSelectFuelStop).toHaveBeenCalledWith(fuelStop)
  })

  it("RideRecoveryActions shows an error message when no fuel stops are available", () => {
    render(
      <RideRecoveryActions
        rerouteStatus="idle"
        rejoinPolicy={null}
        fuelStops={{ status: "error", places: [] }}
        onRequestRejoin={vi.fn()}
        onFindFuel={vi.fn()}
        onSelectFuelStop={vi.fn()}
      />
    )

    expect(screen.getByText("No mapped fuel stops were available nearby.")).toBeInTheDocument()
  })
})

describe("ride HUD status strip and locked corridor", () => {
  afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it("shows the active bike profile and the route data quality headline in the status strip", () => {
    render(<RideHud route={route} onExit={vi.fn()} />)
    const strip = screen.getByLabelText("Ride status strip")
    expect(strip.querySelector(".ride-hud-status-bike")?.getAttribute("data-label")).toBe("Street")
    expect(strip.querySelector(".ride-hud-status-quality")).toBeInTheDocument()
  })

  it("shows a persistent badge when riding through a satisfied must-lock corridor", async () => {
    const mustSatisfaction = {
      lockId: "lock-must-1",
      mode: "must" as const,
      satisfied: true,
      match: { kind: "exact" as const, edgeIds: ["e1"] }
    }
    const routeWithLock: PlannedRoute = {
      ...route,
      lockSatisfaction: [mustSatisfaction]
    }
    vi.mocked(startRideSession).mockImplementation(async ({ onPosition }) => {
      onPosition(gpsPosition({ longitude: -76.95, latitude: 40, heading: 90, timestamp: 1_000 }))
      return { stop: vi.fn(async () => undefined) }
    })
    usePlannerStore.getState().addRoadLock({
      id: "lock-must-1",
      mode: "must",
      edgeIds: ["e1"],
      geometry: { type: "LineString", coordinates: [[-77, 40], [-76.9, 40]] },
      orderedAnchors: [[-77, 40], [-76.9, 40]],
      fallbackToleranceMeters: 50,
      source: "manual",
      confidence: "exact",
      sourceRegionId: "us-pa",
      sourceGraphVersion: "v1",
      accessSnapshot: {
        highwayClass: "secondary",
        motorcycleAccess: "yes",
        generalAccess: "yes",
        surface: "asphalt",
        smoothness: "good",
        tracktype: "unknown",
        maxweightTonnes: null,
        seasonalUndated: false,
        activeConditions: [],
        routable: true
      },
      createdAt: "2026-07-20T00:00:00.000Z"
    })
    try {
      render(<RideHud route={routeWithLock} onExit={vi.fn()} />)
      await waitFor(() => expect(screen.getByText("On locked corridor")).toBeInTheDocument())
    } finally {
      usePlannerStore.getState().clearRoadLocks()
    }
  })

  it("does not show the locked corridor badge when no must locks are satisfied", () => {
    render(<RideHud route={route} onExit={vi.fn()} />)
    expect(screen.queryByText("On locked corridor")).not.toBeInTheDocument()
  })
})
