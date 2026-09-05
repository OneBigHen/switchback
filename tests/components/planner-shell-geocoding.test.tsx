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
  MapStage: ({ onRouteSketch, onSketchModeChange, onWaypointDrag, drawCommand }: {
    onRouteSketch(trace: Waypoint[]): void
    onSketchModeChange(active: boolean): void
    onWaypointDrag(kind: "start" | "finish" | "via", index: number, point: Waypoint): void
    drawCommand?: { id: number; type: "start" } | null
  }) => (
    <div>
      <output data-testid="draw-command">{drawCommand?.id ?? "none"}</output>
      <button type="button" onClick={() => onSketchModeChange(true)}>Enter rough sketch</button>
      <button type="button" onClick={() => onSketchModeChange(false)}>Cancel rough sketch</button>
      <button type="button" onClick={() => onRouteSketch([
        plannerTestStart,
        { lat: 40.18, lon: -76.98 },
        { lat: 40.04, lon: -77.1 },
        plannerTestFinish
      ])}>Complete rough sketch</button>
      <button type="button" onClick={() => onRouteSketch([
        { lat: 40.2732, lon: -76.8867 },
        { lat: 40.3, lon: -76.83 },
        { lat: 40.335, lon: -76.77 }
      ])}>Complete inferred open sketch</button>
      <button type="button" onClick={() => onRouteSketch([
        { lat: 40.2732, lon: -76.8867 },
        { lat: 40.31, lon: -76.84 },
        { lat: 40.315, lon: -76.87 },
        { lat: 40.28, lon: -76.9 },
        { lat: 40.274, lon: -76.887 }
      ])}>Complete inferred loop sketch</button>
      <button type="button" onClick={() => onWaypointDrag("via", 0, { lat: 40.44, lon: -76.66, label: "Dragged connector" })}>Drag first stop</button>
    </div>
  )
}))
vi.mock("@/components/planner/LibraryDrawer", () => ({ LibraryDrawer: () => null }))
vi.mock("@/components/planner/RideHud", () => ({
  RideHud: ({ onExit }: { onExit(): void }) => (
    <button type="button" onClick={onExit}>Exit ride mode</button>
  )
}))
vi.mock("@/components/planner/RouteComparison", () => ({
  RouteComparison: ({
    routes,
    selectedId,
    onSelect
  }: {
    routes: PlannedRoute[]
    selectedId: string
    onSelect(id: string): void
  }) => (
    <section aria-label="Route choices">
      {routes.map((candidate) => (
        <button
          type="button"
          key={candidate.id}
          aria-label={`Select ${candidate.name}`}
          aria-pressed={candidate.id === selectedId}
          onClick={() => onSelect(candidate.id)}
        >
          {candidate.name}
        </button>
      ))}
    </section>
  )
}))
vi.mock("@/components/planner/PlannerDeck", () => ({
  PlannerDeck: ({
    viewModel,
    commands,
    children
  }: {
    viewModel: {
      intent: { researchSources: RideResearchSource[] }
      ui: { selectedRoute?: PlannedRoute | null; routesCount: number }
      lifecycle: { phase: string }
      providerHealth?: { status: string }
    }
    commands: {
      intent: {
        onRidePrompt(prompt: string): void
        onChooseStopIdea(stop: Waypoint): void
        onResearchRideIdea(prompt: string): void
      }
      waypoint: {
        onMoveVia(fromIndex: number, toIndex: number): void
        onReverseRoute(): void
        onUndoRoutePoints(): void
        onRedoRoutePoints(): void
      }
      onStartDrawing?(): void
      onClearRoute(): void
      onStartRide?(route: PlannedRoute): void
      onStartFreeRide?(): void
      onRetryProviderHealth?(): void
    }
    children?: ReactNode
  }) => {
    const researchSources = viewModel.intent.researchSources
    const selectedRoute = viewModel.ui.selectedRoute ?? null
    const { intent, waypoint, onClearRoute, onStartRide, onStartFreeRide } = commands
    return (
      <section>
        <h1>Where do you want to ride?</h1>
        <button type="button" onClick={() => intent.onRidePrompt("test ride request")}>Plan prompt</button>
        <button type="button" onClick={() => intent.onChooseStopIdea({ lat: 40.42, lon: -76.68, label: "Trailhead Brewing" })}>Choose stop idea</button>
        <button type="button" onClick={onClearRoute}>Clear test route</button>
        <button type="button" onClick={() => waypoint.onMoveVia(1, 0)}>Move second stop</button>
        <button type="button" onClick={waypoint.onReverseRoute}>Reverse route</button>
        <button type="button" onClick={waypoint.onUndoRoutePoints}>Undo edit</button>
        <button type="button" onClick={waypoint.onRedoRoutePoints}>Redo edit</button>
        <button type="button" onClick={() => intent.onResearchRideIdea("first request")}>Research first request</button>
        <button type="button" onClick={() => intent.onResearchRideIdea("second request")}>Research second request</button>
        <button type="button" onClick={() => commands.onStartDrawing?.()}>Start draw mode</button>
        <output data-testid="research-source-count">{researchSources.length}</output>
        <output data-testid="shell-selected-route">{selectedRoute?.id ?? "none"}</output>
        <output data-testid="shell-selection-source">{usePlannerStore.getState().selectionSource}</output>
        <output data-testid="shell-stage">
          {selectedRoute ? "Prepare" : viewModel.ui.routesCount > 1 && (viewModel.lifecycle.phase === "ready" || viewModel.lifecycle.phase === "alternatives") ? "Choose" : "Search"}
        </output>
        <output data-testid="shell-provider-health">{viewModel.providerHealth?.status ?? "unknown"}</output>
        {viewModel.providerHealth?.status === "graphhopper-unavailable" ? (
          <div role="alert">The route service is temporarily unavailable.</div>
        ) : null}
        <button type="button" onClick={() => commands.onRetryProviderHealth?.()}>Retry provider health</button>
        {onStartRide && selectedRoute ? (
          <button type="button" onClick={() => onStartRide(selectedRoute)}>Start test ride</button>
        ) : null}
        {onStartFreeRide ? (
          <button type="button" onClick={onStartFreeRide}>Start test Free Ride</button>
        ) : null}
        {children}
      </section>
    )
  }
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
    rideCharacter: "scenic",
    targetMinutes: 120,
    tollPolicy: "allow-with-warning",
    ambiguous: false,
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

    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledTimes(2))
    expect(requestTripPlan).toHaveBeenCalledWith(expect.objectContaining({ avoidHighways: true }), expect.anything(), expect.anything())
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

  it("does not synthesize a selected route when alternatives have no explicit selection", () => {
    const alternatives: PlannedRoute[] = [
      route,
      { ...route, id: "route-2", name: "Alternative ride" },
      { ...route, id: "route-3", name: "Scenic ride" }
    ]
    usePlannerStore.getState().applyPlan({
      selectedRouteId: route.id,
      routes: alternatives,
      warnings: []
    })
    usePlannerStore.setState({ planningPhase: "ready" })

    render(<PlannerShell />)

    expect(screen.getByTestId("shell-selected-route")).toHaveTextContent("none")
    expect(screen.getByTestId("shell-selection-source")).toHaveTextContent("automatic")
    expect(screen.getByTestId("shell-stage")).toHaveTextContent("Choose")
    expect(screen.getByRole("button", { name: "Select Test ride" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Select Alternative ride" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Select Scenic ride" })).toHaveAttribute("aria-pressed", "false")
  })

  it("passes a nonhealthy provider state and Retry command into the planner deck", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/gpx-library")) {
        return Response.json({ routes: [], rejected: [], generatedAt: "now", scannedFiles: 0 })
      }
      return Response.json({
        ok: false,
        degraded: false,
        app: { ok: true },
        router: { ok: false, status: 503, latencyMs: 2 },
        providers: { graphhopper: { ok: false, status: 503, latencyMs: 2 } },
        degradedProviders: ["graphhopper"],
        runtime: {
          rssBytes: null,
          heapUsedBytes: null,
          heapTotalBytes: null,
          externalBytes: null,
          arrayBuffersBytes: null,
          routeRunningJobs: null,
          routeQueuedJobs: null,
          routeCacheEntries: null
        }
      }, { status: 503 })
    })

    render(<PlannerShell />)
    await waitFor(() => expect(screen.getByTestId("shell-provider-health")).toHaveTextContent("graphhopper-unavailable"))
    expect(screen.getByRole("alert")).toHaveTextContent("The route service is temporarily unavailable")

    await userEvent.click(screen.getByRole("button", { name: "Retry provider health" }))
    // Count the health probes specifically: the shell makes other unrelated
    // mount-time requests, and Retry must re-probe health rather than merely
    // changing the number of calls made overall.
    const healthCalls = () => vi.mocked(fetch).mock.calls
      .filter(([input]) => String(input).includes("/api/health")).length
    await waitFor(() => expect(healthCalls()).toBe(2))
  })

  it("selects the exact alternative card and transitions to Prepare", async () => {
    const user = userEvent.setup()
    const alternative: PlannedRoute = { ...route, id: "route-2", name: "Alternative ride" }
    usePlannerStore.getState().applyPlan({
      selectedRouteId: route.id,
      routes: [route, alternative],
      warnings: []
    })
    usePlannerStore.setState({ planningPhase: "ready" })

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Select Alternative ride" }))

    expect(screen.getByTestId("shell-selected-route")).toHaveTextContent("route-2")
    expect(screen.getByTestId("shell-selection-source")).toHaveTextContent("user")
    expect(screen.getByTestId("shell-stage")).toHaveTextContent("Prepare")
    expect(screen.getByRole("button", { name: "Select Alternative ride" })).toHaveAttribute("aria-pressed", "true")
  })

  it("resets an explicit selection back to the planning state without fallback selection", async () => {
    const user = userEvent.setup()
    const alternative: PlannedRoute = { ...route, id: "route-2", name: "Alternative ride" }
    usePlannerStore.getState().applyPlan({
      selectedRouteId: route.id,
      routes: [route, alternative],
      warnings: []
    })
    usePlannerStore.setState({ planningPhase: "ready" })

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Select Alternative ride" }))
    expect(screen.getByTestId("shell-selected-route")).toHaveTextContent("route-2")

    await user.click(screen.getByRole("button", { name: "Clear test route" }))

    expect(screen.getByTestId("shell-selected-route")).toHaveTextContent("none")
    expect(screen.getByTestId("shell-selection-source")).toHaveTextContent("automatic")
    expect(screen.getByTestId("shell-stage")).toHaveTextContent("Search")
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

    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledTimes(2))
    expect(requestTripPlan).toHaveBeenCalledWith(expect.objectContaining({
      points: [
        { lat: 40.273246, lon: -76.886735, label: "Current location" },
        expect.objectContaining({ label: destination.label })
      ]
    }), expect.anything(), expect.anything())
  })

  it("rejects distant and non-POI stop results and keeps the unshaped ride", async () => {
    const user = userEvent.setup()
    vi.mocked(requestRideIntent).mockResolvedValue(intent({ stopQuery: "brewery" }))
    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Plan prompt" }))

    expect(await screen.findByText(/no reliable brewery stops were found/i)).toBeInTheDocument()
    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledTimes(2))
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

    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledTimes(2))
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
    // Initial prompt run plus the stop-idea rerun, each primary + alternatives.
    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledTimes(4))
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

    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledTimes(2))
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
    }), expect.anything(), expect.anything())
  })

  it("passes the compact Draw command to the map without a DOM bridge", async () => {
    const user = userEvent.setup()

    render(<PlannerShell />)
    expect(screen.getByTestId("draw-command")).toHaveTextContent("none")

    await user.click(screen.getByRole("button", { name: "Start draw mode" }))

    expect(screen.getByTestId("draw-command")).toHaveTextContent("1")
  })

  it("routes an open sketch with no preselected endpoints through destination planning", async () => {
    const user = userEvent.setup()
    usePlannerStore.setState({ ...plannerTestState, start: null, finish: null, startQuery: "", finishQuery: "" })

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Complete inferred open sketch" }))

    await waitFor(() => expect(requestTripPlan).toHaveBeenCalled())
    expect(requestTripPlan).toHaveBeenCalledWith(expect.objectContaining({
      points: expect.arrayContaining([
        expect.objectContaining({ lat: 40.2732, lon: -76.8867, label: "Sketch start" }),
        expect.objectContaining({ lat: 40.335, lon: -76.77, label: "Sketch finish" })
      ])
    }), expect.anything(), expect.anything())
  })

  it("routes a near-closed sketch with no preselected endpoints through loop planning", async () => {
    const user = userEvent.setup()
    usePlannerStore.setState({ ...plannerTestState, start: null, finish: null, startQuery: "", finishQuery: "" })

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Complete inferred loop sketch" }))

    await waitFor(() => expect(requestTripPlan).toHaveBeenCalled())
    expect(requestTripPlan).toHaveBeenCalledWith(expect.objectContaining({
      loopTargetMinutes: 120,
      points: expect.arrayContaining([expect.objectContaining({ lat: 40.2732, lon: -76.8867, label: "Sketch start" })])
    }), expect.anything(), expect.anything())
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
    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledTimes(2))
    expect(requestTripPlan).toHaveBeenLastCalledWith(expect.objectContaining({
      points: [plannerTestStart, second, first, plannerTestFinish]
    }), expect.anything(), expect.anything())

    await user.click(screen.getByRole("button", { name: "Undo edit" }))
    await user.click(screen.getByRole("button", { name: "Redo edit" }))
    await user.click(screen.getByRole("button", { name: "Reverse route" }))

    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledTimes(8))
    expect(requestTripPlan).toHaveBeenLastCalledWith(expect.objectContaining({
      points: [plannerTestFinish, first, second, plannerTestStart]
    }), expect.anything(), expect.anything())
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
    usePlannerStore.setState({ ...plannerTestState, selectedRouteId: imported.id })
    usePlannerStore.getState().applyPlan({ selectedRouteId: imported.id, routes: [imported], warnings: [] })
    vi.mocked(requestTripPlan).mockResolvedValue({
      selectedRouteId: matched.id,
      routes: [matched],
      warnings: []
    })

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Start test ride" }))

    await waitFor(() => expect(requestTripPlan).toHaveBeenCalledTimes(2))
    expect(requestTripPlan).toHaveBeenCalledWith(expect.objectContaining({
      compare: false,
      points: expect.arrayContaining([
        expect.objectContaining({ label: "Imported start" }),
        expect.objectContaining({ label: "Imported finish" })
      ])
    }), expect.anything(), expect.anything())
    await waitFor(() => expect(usePlannerStore.getState()).toMatchObject({
      surface: "ride",
      selectedRouteId: matched.id
    }))
  })

  it("confirms before exiting Free Ride when the recording has meaningful samples", async () => {
    const user = userEvent.setup()
    const confirm = vi.fn(() => false)
    const clearWatch = vi.fn()
    vi.stubGlobal("confirm", confirm)
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition(success: PositionCallback) {
          success({
            coords: { latitude: 40.2732, longitude: -76.8867, speed: 12, altitude: 120, heading: 90, accuracy: 8 },
            timestamp: Date.parse("2026-08-28T14:00:00.000Z")
          } as GeolocationPosition)
          success({
            coords: { latitude: 40.3732, longitude: -76.7867, speed: 14, altitude: 125, heading: 95, accuracy: 8 },
            timestamp: Date.parse("2026-08-28T14:01:00.000Z")
          } as GeolocationPosition)
          return 1
        },
        clearWatch
      }
    })

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Start test Free Ride" }))
    await waitFor(() => expect(usePlannerStore.getState().surface).toBe("free-ride"))

    await user.click(screen.getByRole("button", { name: "Exit Free Ride" }))

    expect(confirm).toHaveBeenCalledWith("Discard this recording? It has not been saved.")
    expect(clearWatch).not.toHaveBeenCalled()
    expect(usePlannerStore.getState().surface).toBe("free-ride")
    expect(screen.getByRole("button", { name: "Exit Free Ride" })).toBeInTheDocument()

    confirm.mockReturnValueOnce(true)
    await user.click(screen.getByRole("button", { name: /^Exit$/ }))
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(clearWatch).toHaveBeenCalledWith(1)
    expect(usePlannerStore.getState().surface).toBe("planner")
    expect(screen.queryByRole("button", { name: "Exit Free Ride" })).not.toBeInTheDocument()
  })

  it("exits idle Free Ride immediately without asking to discard", async () => {
    const user = userEvent.setup()
    const confirm = vi.fn(() => false)
    vi.stubGlobal("confirm", confirm)
    Reflect.deleteProperty(window.navigator, "geolocation")

    render(<PlannerShell />)
    await user.click(screen.getByRole("button", { name: "Start test Free Ride" }))
    await waitFor(() => expect(usePlannerStore.getState().surface).toBe("free-ride"))

    await user.click(screen.getByRole("button", { name: "Exit Free Ride" }))

    expect(confirm).not.toHaveBeenCalled()
    expect(usePlannerStore.getState().surface).toBe("planner")
    expect(screen.queryByRole("button", { name: "Exit Free Ride" })).not.toBeInTheDocument()
  })

  it("restores the planner tab and heading when active guidance exits", async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, "", "/?tab=library")
    usePlannerStore.setState({ ...plannerTestState, surface: "ride" })
    usePlannerStore.getState().applyPlan(plan)
    usePlannerStore.getState().selectRoute(route.id)

    render(<PlannerShell />)
    await act(async () => undefined)
    act(() => usePlannerStore.getState().setSurface("ride"))
    await user.click(screen.getByRole("button", { name: "Exit ride mode" }))

    await waitFor(() => expect(screen.getByRole("heading", { name: "Where do you want to ride?" })).toBeVisible())
    expect(usePlannerStore.getState().surface).toBe("planner")
    expect(screen.getByTestId("shell-selected-route")).toHaveTextContent(route.id)
    expect(window.location.search).toBe("")
    window.history.replaceState({}, "", "/")
  })
})
