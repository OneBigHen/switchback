import type { ReactNode } from "react"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PlannerShell } from "@/components/planner/PlannerShell"
import { searchPlacesClient } from "@/lib/client/geocoding-client"
import { discoverPlaceIdeas } from "@/lib/client/place-ideas-client"
import { requestRideIntent } from "@/lib/client/ride-intent-client"
import { requestRideResearch } from "@/lib/client/ride-research-client"
import { requestTripPlan } from "@/lib/client/routing-client"
import type { RideIntent } from "@/lib/ai/ride-intent"
import type { PlaceResult } from "@/lib/geocoding/photon"
import type { TripPlan } from "@/lib/routing/planner"
import type { PlannedRoute, Waypoint } from "@/lib/routing/types"
import type { RideResearchSource } from "@/lib/ai/ride-research"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"

const plannerTestStart: Waypoint = {
  lat: 40.2732,
  lon: -76.8867,
  label: "Harrisburg, Pennsylvania"
}
const plannerTestFinish: Waypoint = {
  lat: 39.8309,
  lon: -77.2311,
  label: "Gettysburg, Pennsylvania"
}
const plannerTestState = {
  ...initialPlannerState,
  start: plannerTestStart,
  finish: plannerTestFinish,
  startQuery: plannerTestStart.label,
  finishQuery: plannerTestFinish.label
}
const originalGeolocation = Object.getOwnPropertyDescriptor(window.navigator, "geolocation")

vi.mock("@/lib/client/geocoding-client", () => ({ searchPlacesClient: vi.fn() }))
vi.mock("@/lib/client/place-ideas-client", () => ({ discoverPlaceIdeas: vi.fn() }))
vi.mock("@/lib/client/ride-intent-client", () => ({ requestRideIntent: vi.fn() }))
vi.mock("@/lib/client/ride-research-client", () => ({ requestRideResearch: vi.fn() }))
vi.mock("@/lib/client/routing-client", () => ({
  requestTripPlan: vi.fn(),
  RoutingClientError: class RoutingClientError extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly status: number
    ) {
      super(message)
    }
  }
}))
vi.mock("@/lib/storage/route-library", () => ({
  RouteLibrary: class RouteLibrary {
    async list() { return [] }
  }
}))
vi.mock("@/components/planner/MapStage", () => ({
  MapStage: ({ onRouteSketch, onSketchModeChange, onWaypointDrag }: {
    onRouteSketch(trace: Waypoint[]): void
    onSketchModeChange(active: boolean): void
    onWaypointDrag(kind: "start" | "finish" | "via", index: number, point: Waypoint): void
  }) => (
    <div>
      <button type="button" onClick={() => onSketchModeChange(true)}>Enter rough sketch</button>
      <button type="button" onClick={() => onSketchModeChange(false)}>Cancel rough sketch</button>
      <button type="button" onClick={() => onRouteSketch([
        plannerTestStart,
        { lat: 40.18, lon: -76.98 },
        { lat: 40.04, lon: -77.1 },
        plannerTestFinish
      ])}>Complete rough sketch</button>
      <button type="button" onClick={() => onWaypointDrag("via", 0, { lat: 40.44, lon: -76.66, label: "Dragged connector" })}>Drag first stop</button>
    </div>
  )
}))
vi.mock("@/components/planner/LibraryDrawer", () => ({ LibraryDrawer: () => null }))
vi.mock("@/components/planner/RideHud", () => ({ RideHud: () => null }))
vi.mock("@/components/planner/RouteComparison", () => ({ RouteComparison: () => null }))
vi.mock("@/components/planner/PlannerDeck", () => ({
  PlannerDeck: ({
    onRidePrompt,
    onChooseStopIdea,
    onClearRoute,
    onMoveVia,
    onReverseRoute,
    onUndoRoutePoints,
    onRedoRoutePoints,
    onResearchRideIdea,
    onStartRide,
    researchSources,
    selectedRoute,
    children
  }: {
    onRidePrompt(prompt: string): void
    onChooseStopIdea(stop: Waypoint): void
    onClearRoute(): void
    onMoveVia(fromIndex: number, toIndex: number): void
    onReverseRoute(): void
    onUndoRoutePoints(): void
    onRedoRoutePoints(): void
    onResearchRideIdea(prompt: string): void
    onStartRide?(route: PlannedRoute): void
    selectedRoute?: PlannedRoute | null
    researchSources: RideResearchSource[]
    children?: ReactNode
  }) => (
    <section>
      <button type="button" onClick={() => onRidePrompt("test ride request")}>Plan prompt</button>
      <button type="button" onClick={() => onChooseStopIdea({ lat: 40.42, lon: -76.68, label: "Trailhead Brewing" })}>Choose stop idea</button>
      <button type="button" onClick={onClearRoute}>Clear test route</button>
      <button type="button" onClick={() => onMoveVia(1, 0)}>Move second stop</button>
      <button type="button" onClick={onReverseRoute}>Reverse route</button>
      <button type="button" onClick={onUndoRoutePoints}>Undo edit</button>
      <button type="button" onClick={onRedoRoutePoints}>Redo edit</button>
      <button type="button" onClick={() => onResearchRideIdea("first request")}>Research first request</button>
      <button type="button" onClick={() => onResearchRideIdea("second request")}>Research second request</button>
      <output data-testid="research-source-count">{researchSources.length}</output>
      {onStartRide && selectedRoute ? (
        <button type="button" onClick={() => onStartRide(selectedRoute)}>Start test ride</button>
      ) : null}
      {children}
    </section>
  )
}))

const route: PlannedRoute = {
  id: "route-1",
  name: "Test ride",
  profile: "scenic",
  geometry: [[-76.8867, 40.2732], [-76.7, 40.4], [-76.8867, 40.2732]],
  waypoints: [plannerTestStart, plannerTestStart],
  instructions: [],
  distanceMiles: 60,
  durationMinutes: 120,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 1,
  turnCount: 10,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

const plan: TripPlan = {
  selectedRouteId: route.id,
  routes: [route],
  warnings: []
}

function intent(overrides: Partial<RideIntent>): RideIntent {
  return {
    mode: "loop",
    profile: "scenic",
    targetMinutes: 120,
    startQuery: null,
    destinationQuery: null,
    stopQuery: null,
    preferGravel: false,
    avoidHighways: true,
    summary: "a scenic ride",
    source: "local",
    ...overrides
  }
}

function place(overrides: Partial<PlaceResult> & Pick<PlaceResult, "id" | "name" | "lat" | "lon">): PlaceResult {
  return {
    label: overrides.name,
    region: "Pennsylvania",
    country: "United States",
    ...overrides
  }
}

describe("free-form planner place resolution", () => {
  beforeEach(() => {
    usePlannerStore.setState(plannerTestState)
    vi.mocked(requestRideIntent).mockReset()
    vi.mocked(requestRideResearch).mockReset()
    vi.mocked(searchPlacesClient).mockReset()
    vi.mocked(discoverPlaceIdeas).mockReset().mockResolvedValue({ places: [], provider: "google", rankedBy: "rider-fit" })
    vi.mocked(requestTripPlan).mockReset().mockResolvedValue(plan)
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      return url.includes("/api/gpx-library")
        ? Response.json({ routes: [], rejected: [], generatedAt: "now", scannedFiles: 0 })
        : Response.json({ ok: true })
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    if (originalGeolocation) {
      Object.defineProperty(window.navigator, "geolocation", originalGeolocation)
    } else {
      Reflect.deleteProperty(window.navigator, "geolocation")
    }
  })

  it("biases origin to the current start, then destination to the resolved origin and prefers PA matches", async () => {
    const user = userEvent.setup()
    const newJersey = place({
      id: "nj-carlisle",
      name: "Carlisle",
      label: "Carlisle, New Jersey",
      region: "New Jersey",
      lat: 40.12,
      lon: -74.6
    })
    const carlisle = place({ id: "pa-carlisle", name: "Carlisle", lat: 40.201, lon: -77.2 })
    const newYork = place({
      id: "ny-wellsboro",
      name: "Wellsboro",
      label: "Wellsboro, New York",
      region: "New York",
      lat: 42.8,
      lon: -75.7
    })
    const wellsboro = place({ id: "pa-wellsboro", name: "Wellsboro", lat: 41.7487, lon: -77.3005 })
    vi.mocked(requestRideIntent).mockResolvedValue(intent({
      mode: "destination",
      startQuery: "Carlisle",
      destinationQuery: "Wellsboro"
    }))
    vi.mocked(searchPlacesClient)
      .mockResolvedValueOnce([newJersey, carlisle])
      .mockResolvedValueOnce([newYork, wellsboro])

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Plan prompt" }))

    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledOnce())
    expect(requestTripPlan).toHaveBeenCalledWith(expect.objectContaining({ avoidHighways: true }))
    expect(searchPlacesClient).toHaveBeenNthCalledWith(
      1,
      "Carlisle",
      expect.any(Function),
      undefined,
      { lat: plannerTestStart.lat, lon: plannerTestStart.lon }
    )
    expect(searchPlacesClient).toHaveBeenNthCalledWith(
      2,
      "Wellsboro",
      expect.any(Function),
      undefined,
      { lat: carlisle.lat, lon: carlisle.lon }
    )
    expect(usePlannerStore.getState().start).toMatchObject({ label: carlisle.label })
    expect(usePlannerStore.getState().finish).toMatchObject({ label: wellsboro.label })
  })

  it("does not reuse the previous finish when destination intent omits a destination", async () => {
    const user = userEvent.setup()
    vi.mocked(requestRideIntent).mockResolvedValue(intent({
      mode: "destination",
      destinationQuery: null
    }))

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Plan prompt" }))

    expect(await screen.findByText(/tell me where you want to ride/i)).toBeInTheDocument()
    expect(requestTripPlan).not.toHaveBeenCalled()
    expect(usePlannerStore.getState().finish).toEqual(plannerTestFinish)
  })

  it("does not partially mutate an existing trip when prompt place resolution fails", async () => {
    const user = userEvent.setup()
    const existingVia = { lat: 40.4, lon: -76.7, label: "Keep this stop" }
    usePlannerStore.setState({
      ...plannerTestState,
      profile: "quick",
      via: [existingVia]
    })
    vi.mocked(requestRideIntent).mockResolvedValue(intent({
      mode: "destination",
      profile: "adventure",
      startQuery: "Missing origin",
      destinationQuery: "Wellsboro"
    }))
    vi.mocked(searchPlacesClient).mockResolvedValue([])

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Plan prompt" }))

    expect(await screen.findByText(/could not find.*missing origin/i)).toBeInTheDocument()
    expect(requestTripPlan).not.toHaveBeenCalled()
    expect(usePlannerStore.getState()).toMatchObject({
      profile: "quick",
      via: [existingVia],
      start: plannerTestStart,
      finish: plannerTestFinish
    })
  })

  it("requests current location on an explicit free-form plan instead of stopping before routing", async () => {
    const user = userEvent.setup()
    const destination = place({ id: "costco", name: "Costco Harrisburg", lat: 40.252, lon: -76.825 })
    usePlannerStore.setState(initialPlannerState)
    vi.mocked(requestRideIntent).mockResolvedValue(intent({
      mode: "destination",
      targetMinutes: null,
      destinationQuery: "Costco"
    }))
    vi.mocked(searchPlacesClient).mockResolvedValue([destination])
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          success({ coords: { latitude: 40.2732456, longitude: -76.8867345 } } as GeolocationPosition)
        }
      }
    })

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Plan prompt" }))

    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledOnce())
    expect(requestTripPlan).toHaveBeenCalledWith(expect.objectContaining({
      points: [
        { lat: 40.273246, lon: -76.886735, label: "Current location" },
        expect.objectContaining({ label: destination.label })
      ]
    }))
  })

  it("rejects distant and non-POI stop results and keeps the unshaped ride", async () => {
    const user = userEvent.setup()
    vi.mocked(requestRideIntent).mockResolvedValue(intent({ stopQuery: "brewery" }))
    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Plan prompt" }))

    expect(await screen.findByText(/no reliable brewery stops were found/i)).toBeInTheDocument()
    expect(requestTripPlan).toHaveBeenCalledOnce()
    expect(usePlannerStore.getState().via).toEqual([])
  })

  it("offers a nearby compatible POI for rider approval before routing through it", async () => {
    const user = userEvent.setup()
    const brewery = place({
      id: "near-pub",
      name: "Trailhead Brewing",
      lat: 40.42,
      lon: -76.68,
      kind: "pub"
    })
    vi.mocked(requestRideIntent).mockResolvedValue(intent({ stopQuery: "brewery" }))
    vi.mocked(discoverPlaceIdeas).mockResolvedValue({
      places: [brewery],
      provider: "google",
      rankedBy: "rider-fit"
    })

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Plan prompt" }))

    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledOnce())
    expect(usePlannerStore.getState().via).toEqual([])
    expect(discoverPlaceIdeas).toHaveBeenCalledWith(
      "brewery",
      { lat: 40.4, lon: -76.7 },
      35,
      expect.any(Function),
      undefined,
      plan.routes[0]!.geometry
    )

    await user.click(screen.getByRole("button", { name: "Choose stop idea" }))
    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledTimes(2))
    expect(usePlannerStore.getState().via).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: brewery.label })
    ]))
  })

  it("keeps the newest ride-research result when an earlier request finishes late", async () => {
    const user = userEvent.setup()
    let resolveFirst!: (sources: RideResearchSource[]) => void
    let resolveSecond!: (sources: RideResearchSource[]) => void
    const first = new Promise<RideResearchSource[]>((resolve) => { resolveFirst = resolve })
    const second = new Promise<RideResearchSource[]>((resolve) => { resolveSecond = resolve })
    vi.mocked(requestRideResearch)
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Research first request" }))
    await user.click(screen.getByRole("button", { name: "Research second request" }))
    resolveSecond([{ title: "Newest source", url: "https://example.com/new", summary: "Newer result" }])
    await waitFor(() => expect(screen.getByTestId("research-source-count")).toHaveTextContent("1"))

    await act(async () => {
      resolveFirst([])
      await Promise.resolve()
    })

    expect(screen.getByTestId("research-source-count")).toHaveTextContent("1")
  })

  it("does not restore research results after the rider clears the route", async () => {
    const user = userEvent.setup()
    let resolveResearch!: (sources: RideResearchSource[]) => void
    const research = new Promise<RideResearchSource[]>((resolve) => { resolveResearch = resolve })
    vi.mocked(requestRideResearch).mockReturnValueOnce(research)

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Research first request" }))
    await user.click(screen.getByRole("button", { name: "Clear test route" }))
    await act(async () => {
      resolveResearch([{ title: "Late source", url: "https://example.com/late", summary: "Must stay cleared" }])
      await Promise.resolve()
    })

    expect(screen.getByTestId("research-source-count")).toHaveTextContent("0")
  })

  it("turns a rough map stroke into editable shaping stops and replans", async () => {
    const user = userEvent.setup()

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Complete rough sketch" }))

    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledOnce())
    expect(usePlannerStore.getState().via).toEqual([
      { lat: 40.18, lon: -76.98, label: "Sketch stop 1" },
      { lat: 40.04, lon: -77.1, label: "Sketch stop 2" }
    ])
    expect(requestTripPlan).toHaveBeenCalledWith(expect.objectContaining({
      points: [
        plannerTestStart,
        { lat: 40.18, lon: -76.98, label: "Sketch stop 1" },
        { lat: 40.04, lon: -77.1, label: "Sketch stop 2" },
        plannerTestFinish
      ]
    }))
  })

  it("clears the planner sheet while the rider sketches on a phone-sized map", async () => {
    const user = userEvent.setup()

    render(<PlannerShell />)
    expect(screen.getByRole("button", { name: "Plan prompt" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Enter rough sketch" }))
    expect(screen.queryByRole("button", { name: "Plan prompt" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Cancel rough sketch" }))
    expect(screen.getByRole("button", { name: "Plan prompt" })).toBeInTheDocument()
  })

  it("replans after reorder, undo, redo, and reverse operations", async () => {
    const user = userEvent.setup()
    const first = { lat: 40.4, lon: -76.7, label: "First" }
    const second = { lat: 40.5, lon: -76.6, label: "Second" }
    usePlannerStore.getState().replaceRoutePoints({
      start: plannerTestStart,
      finish: plannerTestFinish,
      via: [first, second]
    })

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Move second stop" }))
    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledTimes(1))
    expect(requestTripPlan).toHaveBeenLastCalledWith(expect.objectContaining({
      points: [plannerTestStart, second, first, plannerTestFinish]
    }))

    await user.click(screen.getByRole("button", { name: "Undo edit" }))
    await user.click(screen.getByRole("button", { name: "Redo edit" }))
    await user.click(screen.getByRole("button", { name: "Reverse route" }))

    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledTimes(4))
    expect(requestTripPlan).toHaveBeenLastCalledWith(expect.objectContaining({
      points: [plannerTestFinish, first, second, plannerTestStart]
    }))
  })

  it("keeps a must-use lock when a shaping stop is dragged", async () => {
    const user = userEvent.setup()
    usePlannerStore.getState().addVia({ lat: 40.4, lon: -76.7, label: "Locked connector", locked: true })
    render(<PlannerShell />)

    await user.click(screen.getByRole("button", { name: "Drag first stop" }))

    expect(usePlannerStore.getState().via).toEqual([
      { lat: 40.44, lon: -76.66, label: "Locked connector", locked: true }
    ])
  })

  it("road-matches an instruction-less imported track before opening turn-by-turn mode", async () => {
    const user = userEvent.setup()
    const imported: PlannedRoute = {
      ...route,
      id: "imported-track",
      name: "Imported track",
      geometry: [
        [-76.9, 40.2],
        [-76.82, 40.25],
        [-76.76, 40.3]
      ],
      waypoints: [
        { lat: 40.2, lon: -76.9, label: "Imported start" },
        { lat: 40.3, lon: -76.76, label: "Imported finish" }
      ],
      routingSource: "imported",
      instructions: []
    }
    const matched: PlannedRoute = {
      ...imported,
      id: "matched-track",
      routingSource: "live",
      instructions: [{
        distanceMeters: 1_000,
        timeMilliseconds: 60_000,
        sign: 2,
        text: "Turn right",
        streetName: "Ridge Road",
        interval: [0, 1]
      }]
    }
    usePlannerStore.setState({
      ...plannerTestState,
      plan: { selectedRouteId: imported.id, routes: [imported], warnings: [] },
      selectedRouteId: imported.id
    })
    vi.mocked(requestTripPlan).mockResolvedValue({
      selectedRouteId: matched.id,
      routes: [matched],
      warnings: []
    })

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Start test ride" }))

    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledOnce())
    expect(requestTripPlan).toHaveBeenCalledWith(expect.objectContaining({
      compare: false,
      points: expect.arrayContaining([
        expect.objectContaining({ label: "Imported start" }),
        expect.objectContaining({ label: "Imported finish" })
      ])
    }))
    await waitFor(() => expect(usePlannerStore.getState()).toMatchObject({
      surface: "ride",
      selectedRouteId: matched.id
    }))
  })
})
